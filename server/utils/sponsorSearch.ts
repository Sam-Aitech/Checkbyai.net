import Fuse, { type IFuseOptions } from "fuse.js";
import { db } from "../db";
import { sponsorList } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

interface SponsorSearchRecord {
  organisationName: string;
  townCity: string | null;
  county: string | null;
  typeRating: string | null;
  route: string | null;
}

export interface SponsorSearchResult {
  organisationName: string;
  townCity: string | null;
  county: string | null;
  typeRating: string | null;
  route: string | null;
  matchScore: number;
}

let fuseIndex: Fuse<SponsorSearchRecord> | null = null;
let indexSnapshotDate: string | null = null;

const FUSE_OPTIONS: IFuseOptions<SponsorSearchRecord> = {
  keys: [
    { name: "organisationName", weight: 0.7 },
    { name: "townCity", weight: 0.3 },
  ],
  threshold: 0.3,
  includeScore: true,
  shouldSort: true,
};

export async function rebuildSponsorIndex(): Promise<void> {
  const latestDateResult = await db
    .select({ snapshotDate: sponsorList.snapshotDate })
    .from(sponsorList)
    .orderBy(desc(sponsorList.snapshotDate))
    .limit(1);

  if (latestDateResult.length === 0) {
    console.log("[SponsorSearch] No snapshot data found. Index not built.");
    fuseIndex = null;
    indexSnapshotDate = null;
    return;
  }

  const snapshotDate = latestDateResult[0].snapshotDate;

  if (snapshotDate === indexSnapshotDate && fuseIndex) {
    console.log(`[SponsorSearch] Index already up to date for ${snapshotDate}.`);
    return;
  }

  const records = await db
    .select({
      organisationName: sponsorList.organisationName,
      townCity: sponsorList.townCity,
      county: sponsorList.county,
      typeRating: sponsorList.typeRating,
      route: sponsorList.route,
    })
    .from(sponsorList)
    .where(eq(sponsorList.snapshotDate, snapshotDate));

  fuseIndex = new Fuse(records, FUSE_OPTIONS);
  indexSnapshotDate = snapshotDate;
  console.log(
    `[SponsorSearch] Index built with ${records.length} records from snapshot ${snapshotDate}.`,
  );
}

export function searchSponsors(query: string, limit: number = 20): SponsorSearchResult[] {
  if (!fuseIndex) {
    return [];
  }

  const results = fuseIndex.search(query, { limit });

  return results.map((r) => ({
    organisationName: r.item.organisationName,
    townCity: r.item.townCity,
    county: r.item.county,
    typeRating: r.item.typeRating,
    route: r.item.route,
    matchScore: Math.round((1 - (r.score ?? 1)) * 100),
  }));
}

export function isIndexReady(): boolean {
  return fuseIndex !== null;
}
