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
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { parse as parseStream } from "csv-parse";
import { db } from "../db";
import { csvArchive } from "@shared/schema";
import { eq } from "drizzle-orm";
import { qsvValidate, qsvCount } from "./binaryRunner";
import { sendAdminAlert } from "./adminAlert";
import { buildFingerprintedCsv, fingerprintedCsvPath } from "./csvFingerprintBuilder";
import type { SponsorRecord } from "./sponsorListFetcher";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Hard floor: if the validated record count is below this, the file is considered
 * corrupted or truncated and the pipeline aborts. The register has 120k+ entries.
 * 100,000 gives a safe margin for legitimate day-to-day fluctuation.
 */
const MIN_SPONSOR_COUNT = 100_000;

const ARCHIVE_DIR = path.join(process.cwd(), "data", "archives");
const USER_AGENT = "Mozilla/5.0 (compatible; CheckByAI-SponsorBot/1.0; +https://checkbyai.net)";

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

// ── Column resolution (duplicated here to avoid circular import) ──────────────

interface ColumnIndexes {
  nameIdx: number;
  townIdx: number;
  countyIdx: number;
  typeIdx: number;
  routeIdx: number;
}

function resolveColumnIndexes(header: string[]): ColumnIndexes {
  const h = header.map((s) => s.trim().toLowerCase());
  return {
    nameIdx:   h.findIndex((c) => c.includes("organisation") && c.includes("name")),
    townIdx:   h.findIndex((c) => c.includes("town") || c.includes("city")),
    countyIdx: h.findIndex((c) => c.includes("county")),
    typeIdx:   h.findIndex((c) => c.includes("type") && c.includes("rating")),
    routeIdx:  h.findIndex((c) => c.includes("route")),
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
    console.log(
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
  console.log(`[CsvArchiver] Downloading CSV for ${date} → ${filePath}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000); // 2-min timeout

  let response: Response;
  try {
    response = await fetchFn(csvUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(
      err.name === "AbortError"
        ? `[CsvArchiver] CSV download timed out after 2 min from ${csvUrl}`
        : `[CsvArchiver] CSV download failed: ${err.message}`,
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    throw new Error(
      `[CsvArchiver] Gov.uk returned HTTP ${response.status} for CSV download. URL: ${csvUrl}`,
    );
  }

  if (!response.body) {
    throw new Error("[CsvArchiver] Response body is null — cannot stream to disk.");
  }

  // Stream response body → file (never loads full CSV into RAM)
  const nodeReadable = Readable.fromWeb(response.body as any);
  const writeStream = fs.createWriteStream(filePath);
  try {
    await pipeline(nodeReadable, writeStream);
  } catch (err) {
    // Clean up partial file on failure
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
    throw new Error(`[CsvArchiver] Failed to write CSV to disk: ${(err as Error).message}`);
  }

  // ── Sanity: ensure file is non-empty ───────────────────────────────────────
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    fs.unlinkSync(filePath);
    throw new Error("[CsvArchiver] Downloaded CSV file is zero bytes. Gov.uk may have an issue.");
  }

  console.log(`[CsvArchiver] Saved ${(stat.size / 1024 / 1024).toFixed(1)} MB to disk.`);

  // ── Compute checksum ────────────────────────────────────────────────────────
  const checksumSha256 = sha256File(filePath);

  // ── qsv validate (graceful skip if binary not installed) ───────────────────
  const validationResult = await qsvValidate(filePath);
  if (!validationResult.valid) {
    const errMsg = validationResult.errors.slice(0, 5).join("\n");
    console.error(`[CsvArchiver] qsv validation FAILED for ${date}:\n${errMsg}`);

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
    console.warn("[CsvArchiver] qsv not available for count — counting rows via csv-parse.");
    recordCount = await countCsvRows(filePath);
  }

  console.log(`[CsvArchiver] Record count for ${date}: ${recordCount.toLocaleString()}`);

  if (recordCount < MIN_SPONSOR_COUNT) {
    const errorMsg =
      `[CsvArchiver] ABORT: CSV has only ${recordCount.toLocaleString()} records ` +
      `(minimum expected: ${MIN_SPONSOR_COUNT.toLocaleString()}). ` +
      `This indicates a corrupted, truncated, or unexpected file from Gov.uk.`;

    console.error(errorMsg);

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
  await db
    .insert(csvArchive)
    .values({
      snapshotDate:   date,
      filePath,
      recordCount,
      checksumSha256,
      sourceUrl:      csvUrl,
      isValid:        true,
      downloadedAt:   new Date(),
    })
    .onConflictDoNothing(); // idempotent on re-run

  console.log(
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
  readStream.pipe(parser);

  for await (const _row of parser as AsyncIterable<string[]>) {
    count++;
  }

  return count;
}

/**
 * Parses a saved CSV file from disk into SponsorRecord[].
 * Used after ensureTodaysArchive() validates the file.
 */
export async function parseCsvFile(filePath: string): Promise<SponsorRecord[]> {
  const readStream = fs.createReadStream(filePath);
  const parser = parseStream({
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  readStream.pipe(parser);

  let idx: ColumnIndexes | null = null;
  let headerRow: string[] | null = null;
  const sponsors: SponsorRecord[] = [];

  try {
    for await (const row of parser as AsyncIterable<string[]>) {
      if (!headerRow) {
        headerRow = row;
        idx = resolveColumnIndexes(row);
        if (idx.nameIdx === -1) {
          throw new Error(
            `[CsvArchiver] Could not find "Organisation Name" column. ` +
            `Found columns: ${row.join(", ")}`,
          );
        }
        continue;
      }

      const orgName = (row[idx!.nameIdx] ?? "").trim();
      if (!orgName) continue;

      sponsors.push({
        organisationName: orgName,
        townCity:   (idx!.townIdx   >= 0 ? row[idx!.townIdx]   ?? "" : "").trim(),
        county:     (idx!.countyIdx >= 0 ? row[idx!.countyIdx] ?? "" : "").trim(),
        typeRating: (idx!.typeIdx   >= 0 ? row[idx!.typeIdx]   ?? "" : "").trim(),
        route:      (idx!.routeIdx  >= 0 ? row[idx!.routeIdx]  ?? "" : "").trim(),
      });
    }
  } catch (err) {
    parser.destroy();
    readStream.destroy();
    throw err;
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
