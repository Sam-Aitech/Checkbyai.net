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

export type ChangeType = "REMOVED" | "ADDED" | "DOWNGRADED" | "UPGRADED" | "ROUTE_CHANGE";

export interface SponsorChange {
  organisationName: string;
  changeType: ChangeType;
  previousValue: string | null;
  newValue: string | null;
}

interface SnapshotEntry {
  organisationName: string;
  organisationNameNormalized: string;
  typeRating: string | null;
  route: string | null;
}

function classifyRatingChange(
  prevRating: string,
  newRating: string,
): ChangeType | null {
  const prevLower = prevRating.toLowerCase();
  const newLower = newRating.toLowerCase();

  if (prevLower === newLower) return null;

  const prevIsA = prevLower.includes("a-rating") || prevLower.includes("a rating");
  const prevIsB = prevLower.includes("b-rating") || prevLower.includes("b rating");
  const newIsA = newLower.includes("a-rating") || newLower.includes("a rating");
  const newIsB = newLower.includes("b-rating") || newLower.includes("b rating");

  if (prevIsA && newIsB) return "DOWNGRADED";
  if (prevIsB && newIsA) return "UPGRADED";

  return null;
}

export function detectChanges(
  previous: Map<string, SnapshotEntry>,
  current: Map<string, SnapshotEntry>,
): SponsorChange[] {
  const changes: SponsorChange[] = [];
  const warnings: string[] = [];

  Array.from(previous.entries()).forEach(([normName, prevRecord]) => {
    if (!current.has(normName)) {
      changes.push({
        organisationName: prevRecord.organisationName,
        changeType: "REMOVED",
        previousValue: prevRecord.typeRating,
        newValue: null,
      });
    }
  });

  Array.from(current.entries()).forEach(([normName, currRecord]) => {
    if (!previous.has(normName)) {
      changes.push({
        organisationName: currRecord.organisationName,
        changeType: "ADDED",
        previousValue: null,
        newValue: currRecord.typeRating,
      });
    }
  });

  Array.from(previous.entries()).forEach(([normName, prevRecord]) => {
    const currRecord = current.get(normName);
    if (!currRecord) return;

    const prevRating = (prevRecord.typeRating ?? "").trim();
    const currRating = (currRecord.typeRating ?? "").trim();
    if (prevRating && currRating && prevRating !== currRating) {
      const ratingChange = classifyRatingChange(prevRating, currRating);
      if (ratingChange) {
        changes.push({
          organisationName: prevRecord.organisationName,
          changeType: ratingChange,
          previousValue: prevRating,
          newValue: currRating,
        });
      } else {
        warnings.push(
          `Ambiguous rating change for "${prevRecord.organisationName}": "${prevRating}" -> "${currRating}". Not flagging as change.`,
        );
      }
    }

    const prevRoute = (prevRecord.route ?? "").trim();
    const currRoute = (currRecord.route ?? "").trim();
    if (prevRoute && currRoute && prevRoute !== currRoute) {
      changes.push({
        organisationName: prevRecord.organisationName,
        changeType: "ROUTE_CHANGE",
        previousValue: prevRoute,
        newValue: currRoute,
      });
    }
  });

  const counts: Record<ChangeType, number> = {
    REMOVED: 0,
    ADDED: 0,
    DOWNGRADED: 0,
    UPGRADED: 0,
    ROUTE_CHANGE: 0,
  };
  for (const c of changes) counts[c.changeType]++;

  console.log(
    `[SponsorMonitor] Diff complete. Previous: ${previous.size} orgs, Current: ${current.size} orgs. ` +
      `Changes detected: ${changes.length} total — ` +
      `REMOVED: ${counts.REMOVED}, ADDED: ${counts.ADDED}, ` +
      `DOWNGRADED: ${counts.DOWNGRADED}, UPGRADED: ${counts.UPGRADED}, ` +
      `ROUTE_CHANGE: ${counts.ROUTE_CHANGE}`,
  );

  if (warnings.length > 0) {
    console.warn(
      `[SponsorMonitor] ${warnings.length} ambiguous change(s) skipped:\n` +
        warnings.map((w) => `  - ${w}`).join("\n"),
    );
  }

  const removalRatio = previous.size > 0 ? counts.REMOVED / previous.size : 0;
  if (removalRatio > 0.1 && counts.REMOVED > 100) {
    console.warn(
      `[SponsorMonitor] WARNING: Unusually high removal count (${counts.REMOVED} of ${previous.size}, ${(removalRatio * 100).toFixed(1)}%). ` +
        `This may indicate a data format change rather than genuine revocations. Manual review recommended.`,
    );
  }

  return changes;
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
