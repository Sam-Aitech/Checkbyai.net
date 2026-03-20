import { parse } from "csv-parse/sync";
import { parse as parseStream } from "csv-parse";
import { Readable } from "stream";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import * as cheerio from "cheerio";
import { db } from "../db";
import { sponsorList } from "@shared/schema";
import { eq, desc, lt, sql } from "drizzle-orm";
import { sendAdminAlert } from "./adminAlert";
import { ensureTodaysArchive, parseCsvFile } from "./csvArchiver";

const GOV_UK_PAGE_URL =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

const USER_AGENT =
  "Mozilla/5.0 (compatible; CheckByAI-SponsorBot/1.0; +https://checkbyai.net)";

const execFileAsync = promisify(execFile);

export interface SponsorRecord {
  organisationName: string;
  townCity: string;
  county: string;
  typeRating: string;
  route: string;
}

/**
 * Response from Scrapling Python script.
 * Either a CSV URL was found, or we fell back to HTML records.
 */
interface ScraplingResponse {
  url?: string;
  html_records?: SponsorRecord[];
  warning?: string;
  error?: string;
}

const COMPANY_SUFFIXES =
  /\b(ltd|limited|plc|llp|llc|inc|incorporated|uk|co|company|corp|corporation|group|holdings)\b/g;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(COMPANY_SUFFIXES, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateFingerprint(name: string, city: string, route: string): string {
  const normalizedName = normalizeName(name);
  const normalizedCity = normalizeName(city);
  const cleanedRoute = (route || "").toLowerCase().trim();
  return `${normalizedName}|${normalizedCity}|${cleanedRoute}`;
}

/** @deprecated sponsor_list table is retired. No callers remain as of 2026-03-20. Drop after 2026-04-20. */
export async function storeSnapshot(records: SponsorRecord[], date: string): Promise<void> {
  const batchSize = 5000; // was 500 — reduces DB round-trips from ~248 to ~25
  const formattedRecords = records.map(r => ({
    organisationName: r.organisationName,
    organisationNameNormalized: normalizeName(r.organisationName),
    townCity: r.townCity,
    county: r.county,
    typeRating: r.typeRating,
    route: r.route,
    fingerprint: generateFingerprint(r.organisationName, r.townCity, r.route),
    snapshotDate: date,
  }));

  for (let i = 0; i < formattedRecords.length; i += batchSize) {
    const batch = formattedRecords.slice(i, i + batchSize);
    await db.insert(sponsorList).values(batch).onConflictDoNothing();
  }
}

/** @deprecated sponsor_list table is retired. No callers remain as of 2026-03-20. Drop after 2026-04-20. */
export async function getLatestSnapshotDate(): Promise<string | null> {
  const result = await db
    .select({ snapshotDate: sponsorList.snapshotDate })
    .from(sponsorList)
    .orderBy(desc(sponsorList.snapshotDate))
    .limit(1);

  return result.length > 0 ? result[0].snapshotDate : null;
}

export async function cleanupOldSnapshots(daysToKeep: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const formattedDate = cutoffDate.toISOString().split('T')[0];

  const deleted = await db
    .delete(sponsorList)
    .where(lt(sponsorList.snapshotDate, formattedDate))
    .returning({ id: sponsorList.id });

  return deleted.length;
}

export type ChangeType =
  | "NEW_LICENCE"     // company appears on register for the first time
  | "RE_ACTIVATED"    // previously REMOVED_REVOKED, reappeared on register
  | "REMOVED_REVOKED" // absent 2+ consecutive days, confirmed removed
  | "UPGRADED"        // B-Rating → A-Rating
  | "DOWNGRADED"      // A-Rating → B-Rating
  | "ROUTE_CHANGE"    // route changed
  | "NAME_CHANGE";    // organisation name changed

export interface SponsorChange {
  id?: number;           // DB primary key from sponsor_changes — populated after insert
  organisationName: string;
  changeType: ChangeType;
  previousValue: string | null;
  newValue: string | null;
  fingerprint?: string;  // links directly to sponsor_canonical.fingerprint
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ── CSV URL Discovery ─────────────────────────────────────────────────────────

/**
 * Primary: cheerio-based scraper (fast, in-process, <100 ms).
 * Renamed from the original findCsvUrl() to allow fallback wrapping.
 */
async function findCsvUrlPrimary(): Promise<string> {
  let response: Response;
  try {
    response = await fetchWithTimeout(GOV_UK_PAGE_URL);
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(
        `Timed out fetching gov.uk page at ${GOV_UK_PAGE_URL}. The site may be temporarily unavailable.`,
      );
    }
    throw new Error(
      `Failed to fetch gov.uk page: ${err.message ?? "Unknown network error"}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `gov.uk returned HTTP ${response.status} when fetching the sponsor register page. The page may have moved or be temporarily unavailable.`,
    );
  }

  // Guard: if the publication page itself was intercepted by a bot challenge,
  // the CDN may return non-HTML content (e.g. a JSON error or binary blob).
  // Cheerio would silently find zero links and trigger the Scrapling fallback
  // with no explanation. Fail fast with a clear error instead.
  const pageContentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!pageContentType.startsWith("text/html")) {
    throw new Error(
      `gov.uk publication page returned unexpected content-type "${pageContentType}" ` +
      `(expected text/html). The page may be behind a bot challenge or have moved.`,
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  let csvUrl: string | null = null;
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (
      href &&
      href.includes("assets.publishing.service.gov.uk") &&
      href.endsWith(".csv")
    ) {
      csvUrl = href;
      return false;
    }
  });

  if (!csvUrl) {
    throw new Error(
      "Could not find a CSV download link on the gov.uk sponsor register page. " +
        "The page structure may have changed. Expected a link to assets.publishing.service.gov.uk ending in .csv.",
    );
  }

  return csvUrl;
}

/**
 * Scrapling Python subprocess (~2–4 s).
 * Returns either a CSV URL (Phase 1–2) or HTML fallback records (Phase 3).
 * Handles JS-rendered pages, Cloudflare bot protection, and gov.uk page structure changes.
 */
async function runScraplingScript(): Promise<ScraplingResponse> {
  const scriptPath = path.join(process.cwd(), "backend", "find_csv_url.py");
  const { stdout, stderr } = await execFileAsync(
    "python3",
    [scriptPath],
    { timeout: 90_000 }, // 90 s — StealthyFetcher browser startup can be slow
  );

  if (stderr) {
    console.warn("[SponsorListFetcher] Scrapling stderr:", stderr.trim());
  }

  let result: ScraplingResponse;
  try {
    result = JSON.parse(stdout.trim());
  } catch {
    throw new Error(`Scrapling returned unparseable output: ${stdout.slice(0, 200)}`);
  }

  if (result.error) {
    throw new Error(`Scrapling: ${result.error}`);
  }

  if (result.url) {
    return { url: result.url };
  }

  if (result.html_records && result.html_records.length > 0) {
    return { html_records: result.html_records, warning: result.warning };
  }

  throw new Error("Scrapling returned neither CSV URL nor HTML records");
}

/**
 * Entry point for CSV URL discovery.
 * Tries cheerio first; on failure escalates to the Scrapling Python subprocess.
 * Can return either a CSV URL string or ScraplingResponse with HTML records.
 */
async function findCsvUrl(): Promise<string | ScraplingResponse> {
  try {
    return await findCsvUrlPrimary();
  } catch (primaryErr: any) {
    console.warn(
      "[SponsorListFetcher] Cheerio scraper failed, trying Scrapling fallback:",
      primaryErr.message,
    );

    // Non-blocking admin alert — cheerio failure may indicate gov.uk page structure change.
    // Never let alerting throw or block the fallback attempt.
    sendAdminAlert(
      "⚠️ CheckByAI: Scrapling fallback activated",
      `<p>The cheerio-based gov.uk scraper failed:</p>
       <pre style="background:#f5f5f5;padding:10px;border-radius:4px">${primaryErr.message.replace(/</g, "&lt;")}</pre>
       <p>The Scrapling Python fallback is now running. If this alert fires repeatedly, the gov.uk page structure may have changed and <code>findCsvUrlPrimary()</code> needs updating.</p>`,
    ).catch(() => {});

    return await runScraplingScript();
  }
}

/**
 * Discovers the CSV download URL for the UK Gov sponsor register.
 * Tries cheerio first, then Scrapling as fallback.
 * Throws if only the HTML fallback is available — the monitor job requires the full CSV.
 */
export async function discoverCsvUrl(): Promise<string> {
  const result = await findCsvUrl();
  const url = typeof result === "string" ? result : result.url;
  if (!url) {
    throw new Error(
      "[SponsorListFetcher] CSV URL discovery failed — Scrapling returned HTML fallback only. " +
      "The monitor job requires the full CSV. Check gov.uk for page structure changes.",
    );
  }
  return url;
}

// ── Shared CSV parsing helpers ────────────────────────────────────────────────

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

function rowToRecord(row: string[], idx: ColumnIndexes): SponsorRecord | null {
  const orgName = (row[idx.nameIdx] ?? "").trim();
  if (!orgName) return null;
  return {
    organisationName: orgName,
    townCity:  (idx.townIdx   >= 0 ? row[idx.townIdx]   ?? "" : "").trim(),
    county:    (idx.countyIdx >= 0 ? row[idx.countyIdx] ?? "" : "").trim(),
    typeRating:(idx.typeIdx   >= 0 ? row[idx.typeIdx]   ?? "" : "").trim(),
    route:     (idx.routeIdx  >= 0 ? row[idx.routeIdx]  ?? "" : "").trim(),
  };
}

/**
 * Validates and returns HTML records from Scrapling fallback.
 * Filters out records with empty organisation names and logs a critical warning
 * that only ~1,000 records are available from HTML fallback (not the full CSV).
 */
function validateAndProcessHtmlRecords(records: SponsorRecord[], warning?: string): SponsorRecord[] {
  if (warning) {
    console.warn("[SponsorListFetcher] CRITICAL HTML FALLBACK WARNING:", warning);
    sendAdminAlert(
      "🔴 CRITICAL: Sponsor Monitor using HTML fallback",
      `<p>The Scrapling CSV URL discovery failed across all phases.</p>
       <p><strong>${warning}</strong></p>
       <p>This means only ~1,000 sponsor records (from the HTML preview) will be synced today instead of the full 124K+ from the CSV.</p>
       <p>Action: Check gov.uk for any page structure changes at <a href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers">the sponsor register page</a>.</p>`,
    ).catch(() => {});
  }

  return records.filter(r => r.organisationName?.trim());
}

// ── Legacy download functions (deprecated — no active callers as of 2026-03-20) ──

/** @deprecated Use ensureTodaysArchive() + parseCsvFile() from csvArchiver.ts instead. Drop after 2026-04-20. */
export async function downloadAndParseSponsorList(): Promise<SponsorRecord[]> {
  const csvUrlOrFallback = await findCsvUrl();
  const csvUrl = typeof csvUrlOrFallback === "string" ? csvUrlOrFallback : (csvUrlOrFallback.url ?? "");
  if (!csvUrl) throw new Error("No CSV URL available from discovery phase.");

  let csvResponse: Response;
  try {
    csvResponse = await fetchWithTimeout(csvUrl, 60000);
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(
        `Timed out downloading CSV file from ${csvUrl}. The file may be very large or the server is slow.`,
      );
    }
    throw new Error(
      `Failed to download CSV file: ${err.message ?? "Unknown network error"}`,
    );
  }

  if (!csvResponse.ok) {
    throw new Error(
      `Failed to download CSV: HTTP ${csvResponse.status} from ${csvUrl}`,
    );
  }

  const csvText = await csvResponse.text();

  if (!csvText || csvText.trim().length === 0) {
    throw new Error("Downloaded CSV file is empty.");
  }

  let records: string[][];
  try {
    records = parse(csvText, {
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    });
  } catch (err: any) {
    throw new Error(
      `Failed to parse CSV data: ${err.message ?? "Unknown parse error"}. The CSV format may have changed.`,
    );
  }

  if (records.length < 2) {
    throw new Error(
      "CSV file contains no data rows (only a header or is empty).",
    );
  }

  const idx = resolveColumnIndexes(records[0]);

  if (idx.nameIdx === -1) {
    throw new Error(
      `Could not find "Organisation Name" column in CSV header. Found columns: ${records[0].join(", ")}. The CSV format may have changed.`,
    );
  }

  const sponsors: SponsorRecord[] = [];
  for (const row of records.slice(1)) {
    const record = rowToRecord(row, idx);
    if (record) sponsors.push(record);
  }

  if (sponsors.length === 0) {
    throw new Error(
      "CSV was parsed but contained no valid sponsor records. All rows may have empty organisation names.",
    );
  }

  return sponsors;
}

// ── Streaming functions (new) ─────────────────────────────────────────────────

export type InitProgressCallback = (event: {
  stage: "downloading" | "inserting" | "done";
  rowsInserted: number;
  batchesComplete: number;
  totalBatches: number | null;
}) => void;

/**
 * @deprecated sponsor_list table is retired. No callers remain as of 2026-03-20.
 * Use ensureTodaysArchive() (csvArchiver.ts) which streams to disk instead.
 * Drop after 2026-04-20.
 *
 * Streams the UK Gov sponsor CSV directly into the sponsor_list DB table without
 * ever loading the full file into RAM.
 *
 * Process:
 *   1. Discover CSV URL via findCsvUrl() (cheerio → Scrapling fallback)
 *   2. Fetch with 2-min timeout
 *   3. Pipe response body through csv-parse Transform stream
 *   4. Accumulate rows into batches of `batchSize` (default 5000)
 *   5. Bulk-insert each batch → onConflictDoNothing
 *   6. Call onProgress after each batch
 *
 * Used by the /initialize background job in routes.ts.
 */
export async function downloadAndStreamSponsorList(
  snapshotDate: string,
  batchSize = 5000,
  onProgress?: InitProgressCallback,
): Promise<{ rowsInserted: number }> {
  const csvUrlOrFallback = await findCsvUrl();
  const csvUrl = typeof csvUrlOrFallback === "string" ? csvUrlOrFallback : (csvUrlOrFallback.url ?? "");
  if (!csvUrl) throw new Error("No CSV URL available from discovery phase.");

  let csvResponse: Response;
  try {
    csvResponse = await fetchWithTimeout(csvUrl, 120_000);
  } catch (err: any) {
    throw new Error(
      err.name === "AbortError"
        ? `Timed out downloading CSV (2 min limit). File may be unusually large.`
        : `Failed to download CSV: ${err.message ?? "Unknown network error"}`,
    );
  }

  if (!csvResponse.ok) {
    throw new Error(`Failed to download CSV: HTTP ${csvResponse.status} from ${csvUrl}`);
  }

  if (!csvResponse.body) {
    throw new Error("CSV response has no body — cannot stream.");
  }

  onProgress?.({ stage: "downloading", rowsInserted: 0, batchesComplete: 0, totalBatches: null });

  const nodeReadable = Readable.fromWeb(csvResponse.body as any);
  const parser = parseStream({
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  nodeReadable.pipe(parser);

  let idx: ColumnIndexes | null = null;
  let headerRow: string[] | null = null;
  let pendingBatch: ReturnType<typeof normalizeName extends infer F ? any : never>[] = [];
  let rowsInserted = 0;
  let batchesComplete = 0;

  try {
    for await (const row of parser as AsyncIterable<string[]>) {
      if (!headerRow) {
        headerRow = row;
        idx = resolveColumnIndexes(row);
        if (idx.nameIdx === -1) {
          throw new Error(
            `Could not find "Organisation Name" column in CSV header. Found: ${row.join(", ")}`,
          );
        }
        continue;
      }

      const record = rowToRecord(row, idx!);
      if (!record) continue;

      pendingBatch.push({
        organisationName: record.organisationName,
        organisationNameNormalized: normalizeName(record.organisationName),
        townCity:   record.townCity,
        county:     record.county,
        typeRating: record.typeRating,
        route:      record.route,
        fingerprint: generateFingerprint(record.organisationName, record.townCity, record.route),
        snapshotDate,
      });

      if (pendingBatch.length >= batchSize) {
        await db.insert(sponsorList).values(pendingBatch).onConflictDoNothing();
        rowsInserted += pendingBatch.length;
        batchesComplete++;
        pendingBatch = [];
        onProgress?.({ stage: "inserting", rowsInserted, batchesComplete, totalBatches: null });
      }
    }

    // Flush final partial batch
    if (pendingBatch.length > 0) {
      await db.insert(sponsorList).values(pendingBatch).onConflictDoNothing();
      rowsInserted += pendingBatch.length;
      batchesComplete++;
      pendingBatch = [];
    }

  } catch (err) {
    parser.destroy();
    nodeReadable.destroy();
    throw err;
  }

  if (rowsInserted === 0) {
    throw new Error("CSV was streamed but contained no valid sponsor records.");
  }

  onProgress?.({ stage: "done", rowsInserted, batchesComplete, totalBatches: batchesComplete });
  return { rowsInserted };
}

/**
 * Downloads, validates, and parses the Gov.uk sponsor CSV for today.
 *
 * Phase 1 gate — every call now goes through csvArchiver which:
 *   1. Saves the raw CSV to data/archives/YYYY-MM-DD_raw.csv
 *   2. Runs qsv validate (graceful skip if binary not installed)
 *   3. Asserts record_count >= 100,000 (hard abort on corrupted/truncated file)
 *   4. Registers the archive in the csv_archive table
 *   5. Parses from disk into SponsorRecord[]
 *
 * HTML fallback path (Scrapling returns ~1,000 records):
 *   The archiver is bypassed because there is no CSV file.
 *   An admin alert is fired by validateAndProcessHtmlRecords().
 *
 * Used by the nightly monitor job (sponsorMonitorJob.ts).
 */
export async function downloadAndStreamToArray(): Promise<SponsorRecord[]> {
  const result = await findCsvUrl();

  // ── HTML fallback (Scrapling Phase 3) ──────────────────────────────────────
  // No CSV file → skip archiver, return partial records with admin alert.
  if (typeof result !== "string" && result.html_records) {
    const records = validateAndProcessHtmlRecords(result.html_records, result.warning);
    if (records.length === 0) {
      throw new Error("HTML fallback returned no valid sponsor records.");
    }
    return records;
  }

  // ── Standard CSV path ───────────────────────────────────────────────────────
  const csvUrl = typeof result === "string" ? result : result.url;
  if (!csvUrl) {
    throw new Error("No CSV URL or fallback records available from discovery phase.");
  }

  const today = new Date().toISOString().split("T")[0];

  // ensureTodaysArchive: download → validate → count guard → register in DB
  // Throws hard on corrupted file (count < 100,000).
  // Idempotent: returns cached file path if already downloaded today.
  const archive = await ensureTodaysArchive(today, csvUrl);

  console.log(
    `[SponsorListFetcher] Archive ready for ${today}: ` +
    `${archive.recordCount.toLocaleString()} records (cached=${archive.wasAlreadyCached})`,
  );

  // Parse from disk (no HTTP, no RAM spike from raw string)
  const sponsors = await parseCsvFile(archive.filePath);

  if (sponsors.length === 0) {
    throw new Error("Parsed CSV from archive contains no valid sponsor records.");
  }

  return sponsors;
}
