# Proof 4 — EXPLAIN (ANALYZE, BUFFERS) before/after for real sponsor queries

## What changed
- `migrations/0024_sponsor_directory_route_trgm.sql` (from the earlier
  refactor): GIN trigram on `sponsor_canonical.route` (the only directory
  filter with zero index coverage) + partial btree on `removed_at` for the
  directory-stats `COUNT FILTER … removed_at >= NOW() - INTERVAL '7 days'`
  aggregation. Rejected as N/A: `(licence_status, rating_tier,
  last_updated_at)` — those columns do not exist (`status`, `type_rating`,
  no `last_updated_at`).
- `scripts/db/explain-sponsors.sh` (new): harness capturing
  `EXPLAIN (ANALYZE, BUFFERS)` for the four real shapes —
  Q1 directory `status + route ILIKE %…%` + `ORDER BY/LIMIT 50`,
  Q2 directory stats aggregation, Q3 fallback trigram similarity search,
  Q4 revoked trigram search — before (0024 indexes dropped) and after
  (0024 applied), plus the `pg_indexes` listing.

## Verified in this environment
- Script reviewed for query-shape fidelity against `server/routes/sponsors.ts`
  (directory filters + CASE ordering) and `server/utils/sponsorSearch.ts`
  (fallback `%` similarity + status filter, revoked search).
- Not executable here: no postgres/psql/Docker in this environment.

## Live runbook (operator: staging with production-like volume, ≥100k rows)
1. `DATABASE_URL=<staging> sh scripts/db/explain-sponsors.sh`
2. Inspect `docs/perf-evidence/explain/before/*.txt` vs `after/*.txt`.

## Pass criteria
- Q1 selects `idx_sponsor_canonical_trgm_route` (Bitmap Index Scan) after;
  buffers-read drops vs before (before: seq scan or filter-only plan).
- Q2 selects `idx_sponsor_canonical_removed_at` for the removed-this-week
  filter arm; overall aggregation cheaper.
- Q3/Q4 still select the 0003 trigram indexes (`_trgm_name/_trgm_city`) —
  regression check that 0024 changed nothing for them.
- Any `Seq Scan on sponsor_canonical` remaining on Q1/Q2 = fail, revise index.

## Evidence (commit the txt files before sign-off)
- [ ] `explain/before/{q1..q4,indexes}.txt`
- [ ] `explain/after/{q1..q4,indexes}.txt`
- [ ] usage table pasted here
