import Fuse, { type IFuseOptions } from "fuse.js";
import { db } from "../db";
import { sponsorCanonical } from "@shared/schema";
import { inArray, sql } from "drizzle-orm";

interface SponsorSearchRecord {
  fingerprint: string;
  organisationName: string;
  townCity: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
  grantedAt: string | null;
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
  grantedAt: string | null;
  isNew: boolean;          // true when status === 'NEWLY_GRANTED'
  historicalNames: string[];
  source: "index" | "db"; // "index" = Fuse.js, "db" = pg_trgm fallback
}

// ── Index state ───────────────────────────────────────────────────────────────
let fuseIndex: Fuse<SponsorSearchRecord> | null = null;
let indexRecordCount = 0;  // guards against empty-index false-positives
let indexBuiltAt: number = 0;

// Single rebuild promise — deduplicates all concurrent callers onto one DB fetch.
// Without this, N concurrent requests at cold-start each trigger a full table scan.
let rebuildPromise: Promise<void> | null = null;

const FUSE_OPTIONS: IFuseOptions<SponsorSearchRecord> = {
  keys: [
    { name: "organisationName", weight: 0.6 },
    { name: "historicalNames",  weight: 0.2 },
    { name: "townCity",         weight: 0.2 },
  ],
  threshold: 0.3,
  includeScore: true,
  shouldSort: true,
};

// ── Index build ───────────────────────────────────────────────────────────────

/**
 * Rebuilds the in-memory Fuse index from sponsor_canonical.
 * Only indexes ACTIVE and NEWLY_GRANTED records — GRACE_PERIOD and
 * REMOVED_REVOKED companies are intentionally excluded from search results
 * so users cannot accidentally rely on a revoked sponsor's licence status.
 */
export async function rebuildSponsorIndex(): Promise<void> {
  const buildStart = Date.now();
  const records = await db
    .select({
      fingerprint:      sponsorCanonical.fingerprint,
      organisationName: sponsorCanonical.currentName,
      townCity:         sponsorCanonical.townCity,
      typeRating:       sponsorCanonical.typeRating,
      route:            sponsorCanonical.route,
      status:           sponsorCanonical.status,
      grantedAt:        sponsorCanonical.grantedAt,
      historicalNames:  sponsorCanonical.historicalNames,
    })
    .from(sponsorCanonical)
    .where(inArray(sponsorCanonical.status, ["ACTIVE", "NEWLY_GRANTED"]));

  const searchRecords: SponsorSearchRecord[] = records.map((r) => ({
    fingerprint:      r.fingerprint,
    organisationName: r.organisationName,
    townCity:         r.townCity,
    typeRating:       r.typeRating,
    route:            r.route,
    status:           r.status,
    grantedAt:        r.grantedAt,
    historicalNames:  r.historicalNames || [],
  }));

  fuseIndex = new Fuse(searchRecords, FUSE_OPTIONS);
  indexRecordCount = searchRecords.length;
  indexBuiltAt = Date.now();
  console.log(
    `[SponsorSearch] Index rebuilt: ${indexRecordCount} records ` +
    `(ACTIVE + NEWLY_GRANTED only) in ${Date.now() - buildStart}ms`,
  );
}

/**
 * Ensures the index is ready before serving a search request.
 *
 * All concurrent callers that arrive while a rebuild is in progress await
 * the *same* promise rather than each kicking off their own full-table scan.
 * This collapses N parallel cold-start DB hits into exactly 1.
 */
export async function ensureIndexReady(): Promise<void> {
  if (fuseIndex !== null && indexRecordCount > 0) return; // fast path — already warm
  if (rebuildPromise) return rebuildPromise;               // deduplicate concurrent callers
  rebuildPromise = rebuildSponsorIndex().finally(() => {
    rebuildPromise = null;
  });
  return rebuildPromise;
}

export function isIndexReady(): boolean {
  return fuseIndex !== null && indexRecordCount > 0;
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchOptions {
  status?: string;   // e.g. "ACTIVE" | "NEWLY_GRANTED" | "REMOVED_REVOKED" | "GRACE_PERIOD"
  town?: string;     // partial, case-insensitive
  page?: number;     // 1-based
  limit?: number;
}

export interface PagedSearchResult {
  results: SponsorSearchResult[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Fuse.js in-memory fuzzy search with optional status/town filtering and pagination.
 * Oversamples at 5× the requested limit before filtering so post-filter pages stay full.
 * Returns null if the index is cold/empty — caller should fall back to searchSponsorsFallback().
 */
export function searchSponsors(
  query: string,
  options: SearchOptions = {},
): PagedSearchResult | null {
  if (!fuseIndex || indexRecordCount === 0) return null;

  const { status, town, page = 1, limit = 20 } = options;
  const oversample = Math.min(limit * 5, 500);

  let hits = fuseIndex.search(query, { limit: oversample });

  if (status) {
    hits = hits.filter((r) => r.item.status === status);
  }
  if (town) {
    const t = town.toLowerCase();
    hits = hits.filter((r) => (r.item.townCity ?? "").toLowerCase().includes(t));
  }

  const total = hits.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * limit;
  const pageHits = hits.slice(offset, offset + limit);

  return {
    results: pageHits.map((r) => ({
      fingerprint:      r.item.fingerprint,
      organisationName: r.item.organisationName,
      townCity:         r.item.townCity,
      typeRating:       r.item.typeRating,
      route:            r.item.route,
      status:           r.item.status,
      matchScore:       Math.round((1 - (r.score ?? 1)) * 100),
      grantedAt:        r.item.grantedAt,
      isNew:            r.item.status === "NEWLY_GRANTED",
      historicalNames:  r.item.historicalNames,
      source:           "index",
    })),
    total,
    page: safePage,
    totalPages,
  };
}

/**
 * PostgreSQL pg_trgm trigram similarity search with optional status/town filtering and pagination.
 *
 * Used when the Fuse index has not yet been built (server cold start,
 * first boot before any sync has run, or after a failed rebuild).
 * Requires migration 0003 (CREATE EXTENSION pg_trgm +
 * GIN indexes on current_name and town_city).
 */
export async function searchSponsorsFallback(
  query: string,
  options: SearchOptions = {},
): Promise<PagedSearchResult> {
  const { status, town, page = 1, limit = 20 } = options;
  const offset = (Math.max(1, page) - 1) * limit;

  // Build dynamic WHERE clauses
  const statusFilter = status
    ? sql`AND status = ${status}`
    : sql`AND status IN ('ACTIVE', 'NEWLY_GRANTED')`;

  const townFilter = town
    ? sql`AND town_city ILIKE ${"%" + town + "%"}`
    : sql``;

  try {
    const [dataRows, countRows] = await Promise.all([
      db.execute(sql`
        SELECT
          fingerprint,
          current_name        AS "organisationName",
          town_city           AS "townCity",
          type_rating         AS "typeRating",
          route,
          status,
          granted_at          AS "grantedAt",
          historical_names    AS "historicalNames",
          GREATEST(
            similarity(current_name, ${query}),
            COALESCE(
              (SELECT MAX(similarity(hn, ${query}))
                 FROM UNNEST(historical_names) AS hn),
              0
            )
          ) AS match_score
        FROM sponsor_canonical
        WHERE
          (
            current_name % ${query}
            OR EXISTS (
              SELECT 1 FROM UNNEST(historical_names) AS hn
              WHERE hn % ${query}
            )
          )
          ${statusFilter}
          ${townFilter}
        ORDER BY match_score DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM sponsor_canonical
        WHERE
          (
            current_name % ${query}
            OR EXISTS (
              SELECT 1 FROM UNNEST(historical_names) AS hn
              WHERE hn % ${query}
            )
          )
          ${statusFilter}
          ${townFilter}
      `),
    ]);

    const total: number = (countRows.rows[0] as any)?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      results: (dataRows.rows as any[]).map((r) => ({
        fingerprint:      r.fingerprint,
        organisationName: r.organisationName,
        townCity:         r.townCity ?? null,
        typeRating:       r.typeRating ?? null,
        route:            r.route ?? null,
        status:           r.status,
        matchScore:       Math.round((parseFloat(r.match_score) || 0) * 100),
        grantedAt:        r.grantedAt ?? null,
        isNew:            r.status === "NEWLY_GRANTED",
        historicalNames:  r.historicalNames || [],
        source:           "db",
      })),
      total,
      page: Math.max(1, page),
      totalPages,
    };
  } catch (err: unknown) {
    // pg_trgm extension not installed yet (migration pending) — return empty
    // rather than crashing the request handler.
    console.error("[SponsorSearch] pg_trgm fallback failed:", err instanceof Error ? err.message : err);
    return { results: [], total: 0, page: 1, totalPages: 1 };
  }
}
