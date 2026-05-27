/**
 * csvArchiver.ts — Phase 1 Validation Gate
 *
 * Every path that downloads the Gov.uk sponsor CSV must go through here.
 * Responsibilities:
 *   1. Download CSV stream → disk (data/archives/YYYY-MM-DD_raw.csv)
 *   2. Compute SHA-256 checksum for integrity
 *   3. Run qsv validate (graceful skip if binary missing)
 *   4. Run qsv count  → hard-abort if < MIN_SPONSOR_COUNT
 *   5. Register in csv_archive table (idempotent)
 *   6. Return the local file path for downstream consumers
 *
 * Graceful degradation:
 *   - qsv not installed → skips steps 3–4, logs a warning (no hard failure)
 *   - Record count from qsv = -1 (binary missing) → falls back to streaming count
 *   - File already archived today → skips download, returns cached path
 *
 * Hard failures (throw — the monitor job must NOT proceed):
 *   - HTTP error from Gov.uk
 *   - Record count < MIN_SPONSOR_COUNT (corrupted/truncated file)
 *   - Zero-byte file
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable, Writable } from "stream";
import { pipeline } from "stream/promises";
import { parse as parseStream } from "csv-parse";
import { db } from "../db";
import { csvArchive } from "@shared/schema";
import { eq } from "drizzle-orm";
import { qsvValidate, qsvCount } from "./binaryRunner";
import { sendAdminAlert } from "./adminAlert";
import { buildFingerprintedCsv, fingerprintedCsvPath } from "./csvFingerprintBuilder";
import type { SponsorRecord } from "./sponsorListFetcher";
import {
  SponsorRowSchema,
  deriveSponsorRowEnums,
  issueFieldName,
  shouldTriggerSchemaChangeAlert,
  buildSchemaChangeAlertHtml,
} from "./sponsorRowSchema";
import { logger } from "./logger";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Hard floor: if the validated record count is below this, the file is considered
 * corrupted or truncated and the pipeline aborts. The register has 120k+ entries.
 * 100,000 gives a safe margin for legitimate day-to-day fluctuation.
 */
const MIN_SPONSOR_COUNT = 100_000;

const ARCHIVE_DIR = path.join(process.cwd(), "data", "archives");
const USER_AGENT = "Mozilla/5.0 (compatible; CheckByAI-SponsorBot/1.0; +https://checkbyai.net)";

// Browser-like headers sent with every CSV fetch request.
// GOV.UK's Cloudflare CDN scores bot probability by checking Accept,
// Accept-Language, and Referer alongside the User-Agent.  A cold
// direct-to-asset request with no Referer and no Accept header is a
// strong bot signal regardless of what the UA string says.
const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":      USER_AGENT,
  "Accept":          "text/csv, application/octet-stream, text/plain, */*;q=0.9",
  "Accept-Language": "en-GB,en;q=0.9",
  // Tells the CDN this request was navigated from the publications index page,
  // not opened cold by an automated client.
  "Referer":         "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers",
};

// ── Directory bootstrap ───────────────────────────────────────────────────────

function ensureArchiveDir(): void {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

function archivePath(date: string): string {
  return path.join(ARCHIVE_DIR, `${date}_sponsors_raw.csv`);
}

// ── Checksum ──────────────────────────────────────────────────────────────────

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  // Stream through hash — avoids loading 15-25 MB into RAM
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const fd = fs.openSync(filePath, "r");
  try {
    let bytesRead: number;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

// ── HTML content detection ─────────────────────────────────────────────────────
// Defence-in-depth: a CDN can lie about Content-Type and serve an HTML
// Cloudflare challenge page with "text/plain" or "application/octet-stream".
// Reading 512 bytes is cheaper than running qsv on garbage for 90 s.

const HTML_SIGNATURES = ["<!doctype", "<html", "<head>", "<title>", "cloudflare"];

function detectHtmlContent(filePath: string): boolean {
  const buf = Buffer.allocUnsafe(512);
  const fd = fs.openSync(filePath, "r");
  try {
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    const head = buf.subarray(0, bytesRead).toString("utf8").trimStart().toLowerCase();
    return HTML_SIGNATURES.some((sig) => head.includes(sig));
  } finally {
    fs.closeSync(fd);
  }
}

// ── Column resolution (duplicated here to avoid circular import) ──────────────

interface ColumnIndexes {
  nameIdx: number;
  townIdx: number;
  countyIdx: number;
  typeIdx: number;
  routeIdx: number;
  statusIdx: number;
  licenceTypeIdx: number;
  ratingIdx: number;
  lastUpdatedIdx: number;
}

function resolveColumnIndexes(header: string[]): ColumnIndexes {
  const h = header.map((s) => s.trim().toLowerCase());
  return {
    nameIdx:   h.findIndex((c) => c.includes("organisation") && c.includes("name")),
    townIdx:   h.findIndex((c) => c.includes("town") || c.includes("city")),
    countyIdx: h.findIndex((c) => c.includes("county")),
    typeIdx:   h.findIndex((c) => c.includes("type") && c.includes("rating")),
    routeIdx:  h.findIndex((c) => c.includes("route")),
    statusIdx: h.findIndex((c) => c.includes("status")),
    licenceTypeIdx: h.findIndex((c) => c.includes("licence") && c.includes("type")),
    ratingIdx: h.findIndex((c) => c.includes("rating") && !c.includes("type")),
    lastUpdatedIdx: h.findIndex((c) => c.includes("last") && c.includes("updated")),
  };
}

// ── Core public API ───────────────────────────────────────────────────────────

export interface ArchiveResult {
  filePath: string;              // raw CSV path
  fingerprintedFilePath: string; // fingerprinted CSV path (primary key = fingerprint column)
  recordCount: number;
  checksumSha256: string;
  sourceUrl: string;
  wasAlreadyCached: boolean;
}

/**
 * Ensures today's CSV is downloaded, validated, and registered in the archive.
 * Idempotent: if today's file already exists on disk + DB, returns the cached entry.
 *
 * @param date       - ISO date string (YYYY-MM-DD)
 * @param csvUrl     - Direct URL to the Gov.uk CSV file
 * @param fetchFn    - The fetch implementation (allows injection for testing)
 */
export async function ensureTodaysArchive(
  date: string,
  csvUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<ArchiveResult> {
  ensureArchiveDir();
  const filePath = archivePath(date);

  // ── Check DB cache first ────────────────────────────────────────────────────
  const existing = await db
    .select()
    .from(csvArchive)
    .where(eq(csvArchive.snapshotDate, date))
    .limit(1);

  if (existing.length > 0 && fs.existsSync(filePath)) {
    const entry = existing[0];
    logger.info(
      `[CsvArchiver] Cache hit for ${date}: ${entry.recordCount.toLocaleString()} records at ${filePath}`,
    );
    // Ensure fingerprinted CSV exists (may have been skipped on a prior partial run)
    const fpPath = fingerprintedCsvPath(ARCHIVE_DIR, date);
    await buildFingerprintedCsv(filePath, fpPath);
    return {
      filePath,
      fingerprintedFilePath: fpPath,
      recordCount:    entry.recordCount,
      checksumSha256: entry.checksumSha256,
      sourceUrl:      entry.sourceUrl ?? csvUrl,
      wasAlreadyCached: true,
    };
  }

  // ── Download to disk ────────────────────────────────────────────────────────
  logger.info(`[CsvArchiver] Downloading CSV for ${date} → ${filePath}`);

  // Phase A: connect + receive headers (30 s hard cap).
  // The AbortController signal is cleared as soon as headers arrive — before
  // the body is streamed — so we keep it scoped to the connect phase only.
  const connectController = new AbortController();
  const connectTimer = setTimeout(() => connectController.abort(), 30_000);

  let response: Response;
  try {
    response = await fetchFn(csvUrl, {
      signal: connectController.signal,
      headers: FETCH_HEADERS,
    });
  } catch (err: unknown) {
    clearTimeout(connectTimer);
    throw new Error(
      err instanceof Error && err.name === "AbortError"
        ? `[CsvArchiver] CSV download connect timed out (30 s) from ${csvUrl}`
        : `[CsvArchiver] CSV download failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  clearTimeout(connectTimer);

  // Single retry on CDN rate-limit (429) or overload (503) before hard-failing.
  // Both codes are explicitly retryable; re-using a fresh AbortController keeps
  // the 30 s connect cap on the retry independent of the original request.
  if (response.status === 429 || response.status === 503) {
    const retryAfterSec = parseInt(response.headers.get("retry-after") ?? "10", 10);
    const delayMs = Math.min((isNaN(retryAfterSec) ? 10 : retryAfterSec) * 1_000, 30_000);
    logger.warn(
      `[CsvArchiver] HTTP ${response.status} from CDN — waiting ${delayMs / 1000}s then retrying once`,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    const retryController = new AbortController();
    const retryTimer = setTimeout(() => retryController.abort(), 30_000);
    try {
      response = await fetchFn(csvUrl, { signal: retryController.signal, headers: FETCH_HEADERS });
    } catch (retryErr: any) {
      clearTimeout(retryTimer);
      throw new Error(
        retryErr.name === "AbortError"
          ? `[CsvArchiver] CSV download retry connect timed out (30 s) from ${csvUrl}`
          : `[CsvArchiver] CSV download retry failed: ${retryErr?.message ?? String(retryErr)}`,
      );
    }
    clearTimeout(retryTimer);
  }

  if (!response.ok) {
    throw new Error(
      `[CsvArchiver] Gov.uk returned HTTP ${response.status} for CSV download. URL: ${csvUrl}`,
    );
  }

  // ── Content-Type guard ──────────────────────────────────────────────────────
  // Rejects Cloudflare challenge pages and HTML redirects before any bytes hit
  // disk. GOV.UK serves the CSV as text/csv or application/octet-stream; a
  // text/html response here means the CDN intercepted the request.
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const ACCEPTABLE_CONTENT_TYPES = [
    "text/csv",
    "application/octet-stream",
    "application/csv",
    "text/plain",
  ];
  if (!ACCEPTABLE_CONTENT_TYPES.some((ct) => contentType.startsWith(ct))) {
    const ctErr = new Error(
      `[CsvArchiver] GOV_UK_UNEXPECTED_RESPONSE: expected CSV content-type, ` +
      `got "${contentType}" (HTTP ${response.status}). URL: ${csvUrl}. ` +
      `Possible Cloudflare interstitial or unexpected redirect — aborting before stream.`,
    );
    (ctErr as any).code = "GOV_UK_UNEXPECTED_RESPONSE";
    throw ctErr;
  }

  if (!response.body) {
    throw new Error("[CsvArchiver] Response body is null — cannot stream to disk.");
  }

  // Phase B: body streaming (120 s hard cap, independent of the connect timeout).
  // A new AbortController is required here — the connect-phase one was already
  // cleared above, so it can no longer cancel anything. Without this second
  // controller, a server that sends HTTP 200 + headers quickly and then stalls
  // mid-body would cause pipeline() to hang indefinitely.
  const bodyController = new AbortController();
  const bodyTimer = setTimeout(() => bodyController.abort(), 120_000);

  const nodeReadable = Readable.fromWeb(response.body as any);
  const writeStream = fs.createWriteStream(filePath);
  try {
    await pipeline(nodeReadable, writeStream, { signal: bodyController.signal });
  } catch (err: unknown) {
    // Clean up partial file on failure (pipeline destroys both streams on throw)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw new Error(
      err instanceof Error && err.name === "AbortError"
        ? `[CsvArchiver] CSV body stream timed out after 120 s from ${csvUrl}. Server stalled mid-download.`
        : `[CsvArchiver] Failed to write CSV to disk: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(bodyTimer);
  }

  // ── Sanity: ensure file is non-empty ───────────────────────────────────────
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    fs.unlinkSync(filePath);
    throw new Error("[CsvArchiver] Downloaded CSV file is zero bytes. Gov.uk may have an issue.");
  }

  logger.info(`[CsvArchiver] Saved ${(stat.size / 1024 / 1024).toFixed(1)} MB to disk.`);

  // ── HTML content guard (magic-byte check) ──────────────────────────────────
  // Catches CDNs that serve a Cloudflare interstitial with a misleading
  // Content-Type header (e.g. "text/plain"). Reading 512 bytes is essentially
  // free compared with the 60 s + 30 s qsv invocations that would follow.
  if (detectHtmlContent(filePath)) {
    fs.unlinkSync(filePath);
    const htmlErr = new Error(
      `[CsvArchiver] GOV_UK_HTML_CONTENT: downloaded file starts with HTML markup, ` +
      `not CSV data. URL: ${csvUrl}. Likely a Cloudflare challenge page or unexpected redirect.`,
    );
    (htmlErr as any).code = "GOV_UK_HTML_CONTENT";
    throw htmlErr;
  }

  // ── Compute checksum ────────────────────────────────────────────────────────
  const checksumSha256 = sha256File(filePath);

  // ── qsv validate (graceful skip if binary not installed) ───────────────────
  const validationResult = await qsvValidate(filePath);
  if (!validationResult.valid) {
    const errMsg = validationResult.errors.slice(0, 5).join("\n");
    logger.error(`[CsvArchiver] qsv validation FAILED for ${date}:\n${errMsg}`);

    // Send admin alert but do NOT hard-abort here — qsv may have false positives
    // on encoding edge cases. The record count guard below is the hard gate.
    await sendAdminAlert(
      "⚠️ CheckByAI: CSV validation warnings detected",
      `<p>qsv found structural issues in the downloaded CSV for <strong>${date}</strong>:</p>
       <pre style="background:#fff3cd;padding:10px;border-radius:4px">${errMsg.replace(/</g, "&lt;")}</pre>
       <p>The pipeline will continue but the record count guard is the final safety check.</p>`,
    ).catch(() => {});
  }

  // ── qsv count + hard guard ──────────────────────────────────────────────────
  let recordCount = await qsvCount(filePath);

  if (recordCount === -1) {
    // qsv not installed — fall back to streaming count
    logger.warn("[CsvArchiver] qsv not available for count — counting rows via csv-parse.");
    recordCount = await countCsvRows(filePath);
  }

  logger.info(`[CsvArchiver] Record count for ${date}: ${recordCount.toLocaleString()}`);

  if (recordCount < MIN_SPONSOR_COUNT) {
    const errorMsg =
      `[CsvArchiver] ABORT: CSV has only ${recordCount.toLocaleString()} records ` +
      `(minimum expected: ${MIN_SPONSOR_COUNT.toLocaleString()}). ` +
      `This indicates a corrupted, truncated, or unexpected file from Gov.uk.`;

    logger.error(errorMsg);

    // Register the invalid file so we know it was attempted
    await db
      .insert(csvArchive)
      .values({
        snapshotDate:   date,
        filePath,
        recordCount,
        checksumSha256,
        sourceUrl:      csvUrl,
        isValid:        false,
        downloadedAt:   new Date(),
      })
      .onConflictDoNothing();

    await sendAdminAlert(
      "🔴 ALERT: Sponsor monitor ABORTED — CSV record count too low",
      `<p>The sponsor register CSV for <strong>${date}</strong> was rejected.</p>
       <ul>
         <li><strong>Record count:</strong> ${recordCount.toLocaleString()}</li>
         <li><strong>Minimum expected:</strong> ${MIN_SPONSOR_COUNT.toLocaleString()}</li>
         <li><strong>Source URL:</strong> <a href="${csvUrl}">${csvUrl}</a></li>
       </ul>
       <p>The nightly monitor job has been aborted. No state machine changes were made.
          Yesterday's data remains unchanged.</p>
       <p>Action: Check Gov.uk manually to verify the CSV is complete.</p>`,
    ).catch(() => {});

    throw new Error(errorMsg);
  }

  // ── Register valid archive in DB ────────────────────────────────────────────
  // syncStatus is set to PENDING_SYNC here and updated to SYNCED (or FAILED)
  // by sponsorMonitorJob.ts after applyStateMachine() completes. This lets the
  // ETL integrity check on the next job run detect archives that were downloaded
  // but whose state machine never ran (e.g. mid-run server crash).
  await db
    .insert(csvArchive)
    .values({
      snapshotDate:   date,
      filePath,
      recordCount,
      checksumSha256,
      sourceUrl:      csvUrl,
      isValid:        true,
      syncStatus:     "PENDING_SYNC",
      downloadedAt:   new Date(),
    })
    .onConflictDoNothing(); // idempotent on re-run

  logger.info(
    `[CsvArchiver] Archive registered: ${date} | ${recordCount.toLocaleString()} records | SHA-256: ${checksumSha256.slice(0, 12)}...`,
  );

  // ── Build fingerprinted CSV (input to csvdiff) ────────────────────────────
  const fpPath = fingerprintedCsvPath(ARCHIVE_DIR, date);
  await buildFingerprintedCsv(filePath, fpPath);

  return {
    filePath,
    fingerprintedFilePath: fpPath,
    recordCount,
    checksumSha256,
    sourceUrl: csvUrl,
    wasAlreadyCached: false,
  };
}

/**
 * Fallback row counter used when qsv is not installed.
 * Streams the file through csv-parse counting data rows (excludes header).
 */
async function countCsvRows(filePath: string): Promise<number> {
  const readStream = fs.createReadStream(filePath);
  const parser = parseStream({
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    from_line: 2, // skip header
  });

  let count = 0;
  const counter = new Writable({
    objectMode: true,
    write(_chunk, _encoding, callback) {
      count++;
      callback();
    },
  });

  // pipeline() propagates errors across all three stages and destroys every
  // stream on failure — no naked .pipe(), no manual error listener needed.
  await pipeline(readStream, parser, counter);
  return count;
}

/**
 * Parses a saved CSV file from disk into SponsorRecord[].
 * Used after ensureTodaysArchive() validates the file.
 */
export async function parseCsvFile(filePath: string): Promise<SponsorRecord[]> {
  const log = logger.child({ module: "CsvArchiver", filePath });
  const readStream = fs.createReadStream(filePath);
  const parser = parseStream({
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  let idx: ColumnIndexes | null = null;
  let headerRow: string[] | null = null;
  const sponsors: SponsorRecord[] = [];
  let totalRowsProcessed = 0;
  let rowsAccepted = 0;
  let rowsRejected = 0;
  const rejectionReasons: Record<string, number> = {};

  const collector = new Writable({
    objectMode: true,
    write(chunk, _encoding, callback) {
      const row = chunk as string[];

      if (!headerRow) {
        headerRow = row;
        idx = resolveColumnIndexes(row);
        if (idx.nameIdx === -1) {
          // Passing an error to callback propagates through pipeline() and
          // causes it to destroy all streams and reject its Promise.
          callback(
            new Error(
              `[CsvArchiver] Could not find "Organisation Name" column. ` +
              `Found columns: ${row.join(", ")}`,
            ),
          );
          return;
        }
        callback();
        return;
      }

      totalRowsProcessed++;
      const organisationName = (row[idx!.nameIdx] ?? "").trim();
      const townCity = (idx!.townIdx >= 0 ? row[idx!.townIdx] ?? "" : "").trim() || null;
      const county = (idx!.countyIdx >= 0 ? row[idx!.countyIdx] ?? "" : "").trim() || null;
      const typeRating = (idx!.typeIdx >= 0 ? row[idx!.typeIdx] ?? "" : "").trim();
      const route = (idx!.routeIdx >= 0 ? row[idx!.routeIdx] ?? "" : "").trim() || null;
      const statusRaw = (idx!.statusIdx >= 0 ? row[idx!.statusIdx] ?? "" : "").trim() || null;
      const licenceTypeRaw = (idx!.licenceTypeIdx >= 0 ? row[idx!.licenceTypeIdx] ?? "" : "").trim() || null;
      const ratingRaw = (idx!.ratingIdx >= 0 ? row[idx!.ratingIdx] ?? "" : "").trim() || null;
      const lastUpdatedRaw = (idx!.lastUpdatedIdx >= 0 ? row[idx!.lastUpdatedIdx] ?? "" : "").trim() || null;

      const { licenceStatus, rating, licenceType } = deriveSponsorRowEnums({
        statusRaw,
        ratingRaw,
        typeRating,
        licenceTypeRaw,
      });

      const parsed = SponsorRowSchema.safeParse({
        organisationName,
        townCity,
        county,
        typeRating,
        route,
        licenceStatus,
        licenceType,
        rating,
        lastUpdated: lastUpdatedRaw ?? undefined,
      });

      if (!parsed.success) {
        rowsRejected++;
        for (const issue of parsed.error.issues) {
          const field = issueFieldName(issue.path);
          rejectionReasons[field] = (rejectionReasons[field] ?? 0) + 1;
        }
        log.warn(
          {
            rowIndex: totalRowsProcessed,
            errors: parsed.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
              code: issue.code,
            })),
            rawRow: row,
          },
          "Sponsor CSV row rejected by Zod validation",
        );
        callback();
        return;
      }

      rowsAccepted++;
      sponsors.push({
        organisationName: parsed.data.organisationName,
        townCity: parsed.data.townCity ?? "",
        county: parsed.data.county ?? "",
        typeRating: parsed.data.typeRating,
        route: parsed.data.route ?? "",
      });
      callback();
    },
  });

  // pipeline() handles error propagation across all three stages automatically:
  //   readStream error  → parser + collector destroyed, Promise rejects
  //   parser error      → readStream + collector destroyed, Promise rejects
  //   collector error   → readStream + parser destroyed, Promise rejects
  // No manual .on("error") listener or try/catch/destroy block needed.
  await pipeline(readStream, parser, collector);

  log.info(
    {
      totalRowsProcessed,
      rowsAccepted,
      rowsRejected,
      rejectionReasons,
    },
    "Sponsor CSV validation summary",
  );

  const summary = { totalRowsProcessed, rowsAccepted, rowsRejected, rejectionReasons };
  if (shouldTriggerSchemaChangeAlert(summary)) {
    log.error(
      {
        totalRowsProcessed,
        rowsRejected,
        rejectionReasons,
      },
      "Sponsor CSV schema-change event detected (>20% rejected rows)",
    );
    await sendAdminAlert(
      "🔴 CheckByAI: Sponsor CSV schema-change event detected",
      `${buildSchemaChangeAlertHtml(`CsvArchiver file: ${filePath}`, summary)}`,
    );
  }

  return sponsors;
}

/**
 * Returns the archive entry for a given date, or null if not yet archived.
 * Used by Phase 2 (csvdiff) to locate yesterday's fingerprinted CSV.
 */
export async function getArchiveForDate(date: string): Promise<{
  filePath: string;
  fingerprintedFilePath: string;
  recordCount: number;
} | null> {
  const rows = await db
    .select({
      filePath:    csvArchive.filePath,
      recordCount: csvArchive.recordCount,
      isValid:     csvArchive.isValid,
    })
    .from(csvArchive)
    .where(eq(csvArchive.snapshotDate, date))
    .limit(1);

  if (rows.length === 0) return null;
  const entry = rows[0];
  if (!entry.isValid) return null;
  if (!fs.existsSync(entry.filePath)) return null;

  const fpPath = fingerprintedCsvPath(ARCHIVE_DIR, date);
  // Ensure fingerprinted CSV exists even if the original run skipped it
  if (!fs.existsSync(fpPath)) {
    await buildFingerprintedCsv(entry.filePath, fpPath);
  }

  return {
    filePath:             entry.filePath,
    fingerprintedFilePath: fpPath,
    recordCount:          entry.recordCount,
  };
}
