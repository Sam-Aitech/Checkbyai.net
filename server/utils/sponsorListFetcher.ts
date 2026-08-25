import { parse } from "csv-parse/sync";
import { parse as parseStream } from "csv-parse";
import { Readable } from "stream";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import * as cheerio from "cheerio";
import { sql } from "drizzle-orm";
import { sendAdminAlert } from "./adminAlert";
import { ensureTodaysArchive, parseCsvFile } from "./csvArchiver";
import { logger } from "./logger";

const GOV_UK_PAGE_URL =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

const USER_AGENT =
  "Mozilla/5.0 (compatible; CheckByAI-SponsorBot/1.0; +https://checkbyai.net)";

const execFileAsync = promisify(execFile);

/**
 * Attempts to discover CSV URL using Firecrawl (if API key is configured).
 * Returns null if Firecrawl is not configured or fails.
 */
async function discoverViaFirecrawl(homeOfficeUrl: string): Promise<string | null> {
  if (!process.env.FIRECRAWL_API_KEY) {
    return null; // Not configured, skip
  }
  
  try {
    // Dynamically import to avoid making it a hard dependency
    const FirecrawlApp = (await import('@mendable/firecrawl-js')).default;
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! });
    const result = await app.scrapeUrl(homeOfficeUrl, { formats: ['markdown'] });
    
    // Extract CSV URL from markdown content
    if (result.success && result.markdown) {
      const match = result.markdown.match(/https?:\/\/[^\s)"]+\.csv/i);
      return match?.[0] ?? null;
    }
    
    return null;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 
                '[SponsorListFetcher] Firecrawl discovery failed - falling back to cheerio');
    return null;
  }
}

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

/**
 * Character class shared with the SQL-side `regexp_replace` in
 * server/routes/sponsors.ts's prefilter query. Both sides must strip exactly
 * the same characters for the namePrefilterToken() invariant to hold — a
 * mismatch here silently drops sponsor watches from the prefilter with no
 * visible error. Exported (rather than duplicated as a SQL string literal) so
 * the two can't drift independently.
 */
export const SQL_COMPARABLE_CHAR_CLASS = "[^a-z0-9_ ]";

/**
 * SQL-side counterpart of the character stripping inside {@link normalizeName}:
 * `regexp_replace(lower(current_name), '[^a-z0-9_ ]', '', 'g')`.
 * Exported so the prefilter invariant can be asserted in tests.
 */
export function stripToSqlComparable(name: string): string {
  return name.toLowerCase().replace(new RegExp(SQL_COMPARABLE_CHAR_CLASS, "g"), "");
}

/**
 * Picks the most selective token of a normalized company name, for use as a
 * `LIKE %token%` prefilter against {@link stripToSqlComparable}.
 *
 * Matching the *whole* normalized name is unsafe: normalizeName() deletes
 * characters, so "Smith & Jones Ltd" normalizes to "smith jones", which is not
 * a substring of the raw name. A single token is safe — both sides delete
 * exactly the same characters, and suffix removal only ever drops whole
 * tokens, so any token survives contiguously on the SQL side.
 *
 * Returns null when the name normalizes to nothing, in which case callers must
 * not prefilter (there is no safe pattern).
 */
export function namePrefilterToken(name: string): string | null {
  const tokens = normalizeName(name).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  // Seeded with tokens[0] so reduce() can never throw on an empty array,
  // independently of the guard above.
  return tokens.reduce((longest, t) => (t.length > longest.length ? t : longest), tokens[0]);
}

export function generateFingerprint(name: string, city: string, route: string): string {
  const normalizedName = normalizeName(name);
  const normalizedCity = normalizeName(city);
  const cleanedRoute = (route || "").toLowerCase().trim();
  return `${normalizedName}|${normalizedCity}|${cleanedRoute}`;
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
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Timed out fetching gov.uk page at ${GOV_UK_PAGE_URL}. The site may be temporarily unavailable.`,
      );
    }
    throw new Error(
      `Failed to fetch gov.uk page: ${err instanceof Error ? err.message : "Unknown network error"}`,
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

  function isAllowedCsvHref(raw: string): boolean {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:") return false;
      const allowedHosts = new Set(["assets.publishing.service.gov.uk"]);
      if (!allowedHosts.has(parsed.hostname.toLowerCase())) return false;
      if (!parsed.pathname.toLowerCase().endsWith(".csv")) return false;
      return true;
    } catch {
      return false;
    }
  }

  let csvUrl: string | null = null;
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (href && isAllowedCsvHref(href)) {
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
    logger.warn({ err: stderr.trim() }, "[SponsorListFetcher] Scrapling stderr:");
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
    logger.warn(
      { err: primaryErr.message },
      "[SponsorListFetcher] Cheerio scraper failed, trying Scrapling fallback:",
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
 * Tries Firecrawl first (if configured), then cheerio, then Scrapling as fallback.
 * Throws if only the HTML fallback is available — the monitor job requires the full CSV.
 */
export async function discoverCsvUrl(): Promise<string> {
  // Try Firecrawl first if API key is configured
  const firecrawlResult = await discoverViaFirecrawl(GOV_UK_PAGE_URL);
  if (firecrawlResult) {
    return firecrawlResult;
  }
  
  let result;
  try {
    result = await findCsvUrl();
  } catch (err: any) {
    logger.warn("[SponsorListFetcher] Both Scrapers failed. Attempting Direct URL Fallback.");
    // Try to construct today's URL or fallback
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const fallbackUrl = `https://assets.publishing.service.gov.uk/media/register-of-licensed-sponsors-workers/${today}_Worker_and_Temporary_Worker.csv`;
    sendAdminAlert(
      "⚠️ CheckByAI: All scrapers failed, using URL fallback",
      `<p>Cheerio and Scrapling both failed. Attempting to use guessed URL:</p>
       <pre>${fallbackUrl}</pre>
       <p>Error was: ${err.message}</p>`
    ).catch(() => {});
    return fallbackUrl;
  }
  
  const url = typeof result === "string" ? result : result.url;
  if (!url) {
    throw new Error(
      "[SponsorListFetcher] CSV URL discovery failed — Scrapling returned HTML fallback only. " +
      "The monitor job requires the full CSV. Check gov.uk for page structure changes.",
    );
  }
  return url;
}

// NOTE: this module deliberately has no CSV column-resolution logic of its own.
// All header→index mapping lives in sponsorCsvColumns.ts (shared by csvArchiver
// and csvFingerprintBuilder); CSV parsing goes through csvArchiver.parseCsvFile.
// A private legacy-only resolver that used to live here was removed after the
// May 2026 GOV.UK format change — do not reintroduce one.

/**
 * Validates and returns HTML records from Scrapling fallback.
 * Filters out records with empty organisation names and logs a critical warning
 * that only ~1,000 records are available from HTML fallback (not the full CSV).
 */
function validateAndProcessHtmlRecords(records: SponsorRecord[], warning?: string): SponsorRecord[] {
  if (warning) {
    logger.warn({ err: warning }, "[SponsorListFetcher] CRITICAL HTML FALLBACK WARNING:");
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

// ── Streaming functions (new) ─────────────────────────────────────────────────

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

  logger.info(
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
