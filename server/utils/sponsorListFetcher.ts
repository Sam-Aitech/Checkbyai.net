import { parse } from "csv-parse/sync";
import { db } from "../db";
import { sponsorList } from "@shared/schema";
import { eq, desc, lt, sql } from "drizzle-orm";

const GOV_UK_PAGE_URL =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

const USER_AGENT =
  "Mozilla/5.0 (compatible; COSVerificationBot/1.0; +https://cos-verify.replit.app)";

export interface SponsorRecord {
  organisationName: string;
  townCity: string;
  county: string;
  typeRating: string;
  route: string;
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
 * Bulk inserts sponsor records into the database in batches.
 */
export async function storeSnapshot(records: SponsorRecord[], date: string): Promise<void> {
  const batchSize = 500;
  const formattedRecords = records.map(r => ({
    organisationName: r.organisationName,
    organisationNameNormalized: normalizeName(r.organisationName),
    townCity: r.townCity,
    county: r.county,
    typeRating: r.typeRating,
    route: r.route,
    snapshotDate: date,
  }));

  for (let i = 0; i < formattedRecords.length; i += batchSize) {
    const batch = formattedRecords.slice(i, i + batchSize);
    await db.insert(sponsorList).values(batch).onConflictDoNothing();
  }
}

/**
 * Returns the most recent snapshot date from the database.
 */
export async function getLatestSnapshotDate(): Promise<string | null> {
  const result = await db
    .select({ snapshotDate: sponsorList.snapshotDate })
    .from(sponsorList)
    .orderBy(desc(sponsorList.snapshotDate))
    .limit(1);
  
  return result.length > 0 ? result[0].snapshotDate : null;
}

/**
 * Retrieves all records from the latest snapshot and returns them as a Map.
 */
export async function getPreviousSnapshot(): Promise<Map<string, typeof sponsorList.$inferSelect>> {
  const latestDate = await getLatestSnapshotDate();
  if (!latestDate) return new Map();

  const records = await db
    .select()
    .from(sponsorList)
    .where(eq(sponsorList.snapshotDate, latestDate));

  const map = new Map<string, typeof sponsorList.$inferSelect>();
  for (const record of records) {
    map.set(record.organisationNameNormalized, record);
  }
  return map;
}

/**
 * Deletes snapshot records older than the specified number of days.
 */
export async function cleanupOldSnapshots(daysToKeep: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const formattedDate = cutoffDate.toISOString().split('T')[0];

  const result = await db
    .delete(sponsorList)
    .where(lt(sponsorList.snapshotDate, formattedDate));
  
  // Drizzle doesn't return count directly for all drivers, but this works for PG
  return 0; // Returning 0 as placeholder since exact count isn't critical for the UI here
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

async function findCsvUrl(): Promise<string> {
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

  const html = await response.text();

  const csvLinkMatch = html.match(
    /href=["'](https:\/\/assets\.publishing\.service\.gov\.uk[^"']*\.csv)["']/i,
  );

  if (!csvLinkMatch || !csvLinkMatch[1]) {
    throw new Error(
      "Could not find a CSV download link on the gov.uk sponsor register page. " +
        "The page structure may have changed. Expected a link to assets.publishing.service.gov.uk ending in .csv.",
    );
  }

  return csvLinkMatch[1];
}

export async function downloadAndParseSponsorList(): Promise<SponsorRecord[]> {
  const csvUrl = await findCsvUrl();

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

  const header = records[0].map((h) => h.trim().toLowerCase());

  const nameIdx = header.findIndex(
    (h) => h.includes("organisation") && h.includes("name"),
  );
  const townIdx = header.findIndex(
    (h) => h.includes("town") || h.includes("city"),
  );
  const countyIdx = header.findIndex((h) => h.includes("county"));
  const typeIdx = header.findIndex(
    (h) => h.includes("type") && h.includes("rating"),
  );
  const routeIdx = header.findIndex((h) => h.includes("route"));

  if (nameIdx === -1) {
    throw new Error(
      `Could not find "Organisation Name" column in CSV header. Found columns: ${header.join(", ")}. The CSV format may have changed.`,
    );
  }

  const dataRows = records.slice(1);
  const sponsors: SponsorRecord[] = [];

  for (const row of dataRows) {
    const orgName = (row[nameIdx] ?? "").trim();
    if (!orgName) continue;

    sponsors.push({
      organisationName: orgName,
      townCity: (townIdx >= 0 ? row[townIdx] ?? "" : "").trim(),
      county: (countyIdx >= 0 ? row[countyIdx] ?? "" : "").trim(),
      typeRating: (typeIdx >= 0 ? row[typeIdx] ?? "" : "").trim(),
      route: (routeIdx >= 0 ? row[routeIdx] ?? "" : "").trim(),
    });
  }

  if (sponsors.length === 0) {
    throw new Error(
      "CSV was parsed but contained no valid sponsor records. All rows may have empty organisation names.",
    );
  }

  return sponsors;
}
