import Fuse, { type IFuseOptions } from "fuse.js";
import { db } from "../db";
import { sponsorCanonical } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

interface SponsorSearchRecord {
  fingerprint: string;
  organisationName: string;
  townCity: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
  historicalNames: string[];
}

export interface SponsorSearchResult {
  fingerprint: string;
  organisationName: string;
  townCity: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
  matchScore: number;
  historicalNames: string[];
}

let fuseIndex: Fuse<SponsorSearchRecord> | null = null;
let indexBuiltAt: number = 0;

const FUSE_OPTIONS: IFuseOptions<SponsorSearchRecord> = {
  keys: [
    { name: "organisationName", weight: 0.6 },
    { name: "historicalNames", weight: 0.2 },
    { name: "townCity", weight: 0.2 },
  ],
  threshold: 0.3,
  includeScore: true,
  shouldSort: true,
};

export async function rebuildSponsorIndex(): Promise<void> {
  const records = await db
    .select({
      fingerprint: sponsorCanonical.fingerprint,
      organisationName: sponsorCanonical.currentName,
      townCity: sponsorCanonical.townCity,
      typeRating: sponsorCanonical.typeRating,
      route: sponsorCanonical.route,
      status: sponsorCanonical.status,
      historicalNames: sponsorCanonical.historicalNames,
    })
    .from(sponsorCanonical)
    .where(inArray(sponsorCanonical.status, ["ACTIVE", "NOT_LISTED"]));

  const searchRecords: SponsorSearchRecord[] = records.map((r) => ({
    fingerprint: r.fingerprint,
    organisationName: r.organisationName,
    townCity: r.townCity,
    typeRating: r.typeRating,
    route: r.route,
    status: r.status,
    historicalNames: r.historicalNames || [],
  }));

  fuseIndex = new Fuse(searchRecords, FUSE_OPTIONS);
  indexBuiltAt = Date.now();
  console.log(
    `[SponsorSearch] Index built with ${searchRecords.length} canonical records.`,
  );
}

export function searchSponsors(query: string, limit: number = 20): SponsorSearchResult[] {
  if (!fuseIndex) {
    return [];
  }

  const results = fuseIndex.search(query, { limit });

  return results.map((r) => ({
    fingerprint: r.item.fingerprint,
    organisationName: r.item.organisationName,
    townCity: r.item.townCity,
    typeRating: r.item.typeRating,
    route: r.item.route,
    status: r.item.status,
    matchScore: Math.round((1 - (r.score ?? 1)) * 100),
    historicalNames: r.item.historicalNames,
  }));
}

export function isIndexReady(): boolean {
  return fuseIndex !== null;
}
