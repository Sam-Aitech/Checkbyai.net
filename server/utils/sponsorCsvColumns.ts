/**
 * sponsorCsvColumns.ts
 *
 * Single source of truth for mapping GOV.UK register CSV headers to column
 * indexes. The Home Office has shipped at least two layouts:
 *
 *   Legacy (pre May 2026):
 *     Organisation Name,Town/City,County,Type & Rating,Route
 *
 *   Current (May 2026 onwards):
 *     Sponsor Licence Number,Organisation Name,TierRating,
 *     Migrant Classification,Sponsor Status
 *
 * Both layouts must resolve. When the register schema drifts again, update
 * the matchers here — csvArchiver and csvFingerprintBuilder both consume
 * this module, so the mapping cannot silently diverge between the archive
 * parser and the fingerprint builder (that divergence risk contributed to
 * the 2026-05-20 mass-removal incident).
 */

export interface SponsorCsvColumnIndexes {
  nameIdx: number;
  townIdx: number;
  countyIdx: number;
  typeIdx: number;
  routeIdx: number;
  statusIdx: number;
  licenceTypeIdx: number;
  ratingIdx: number;
  lastUpdatedIdx: number;
  licenceNumberIdx: number;
}

export function resolveSponsorCsvColumns(header: string[]): SponsorCsvColumnIndexes {
  const h = header.map((s) => s.trim().toLowerCase());
  const find = (...predicates: Array<(c: string) => boolean>): number => {
    for (const predicate of predicates) {
      const idx = h.findIndex(predicate);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  return {
    nameIdx: find((c) => c.includes("organisation") && c.includes("name")),
    townIdx: find((c) => c.includes("town") || c.includes("city")),
    countyIdx: find((c) => c.includes("county")),
    typeIdx: find(
      // Legacy: "Type & Rating"
      (c) => c.includes("type") && c.includes("rating"),
      // Current: "TierRating" / "Tier Rating"
      (c) => c.includes("tier") && c.includes("rating"),
    ),
    routeIdx: find(
      // Legacy: "Route"
      (c) => c.includes("route"),
      // Current: "Migrant Classification"
      (c) => c.includes("classification"),
    ),
    statusIdx: find((c) => c.includes("status")),
    licenceTypeIdx: find((c) => c.includes("licence") && c.includes("type")),
    // Must not match "TierRating" — that column is already claimed by typeIdx,
    // and aliasing both onto it double-parses one column. With -1 here,
    // deriveSponsorRowEnums falls back to typeRating, the correct source.
    ratingIdx: find((c) => c.includes("rating") && !c.includes("type") && !c.includes("tier")),
    lastUpdatedIdx: find((c) => c.includes("last") && c.includes("updated")),
    licenceNumberIdx: find((c) => c.includes("licence") && c.includes("number")),
  };
}
