-- ============================================================
-- Migration 0024: Directory route search + stats indexes
--
-- Audit (items 3–4 follow-up):
--   - pg_trgm + GIN(current_name, town_city) already exist (0003).
--   - Compound (status, current_name/town_city/type_rating) exist (0014).
--   - Proposed (licence_status, rating_tier, last_updated_at) does not
--     apply: actual columns are status, type_rating, and there is no
--     last_updated_at (see granted_at/removed_at/first_seen/last_seen).
--
-- Gaps closed here:
--   1. /api/sponsors/directory?route=... uses route ILIKE %...%,
--      the only directory filter with no index at all. GIN trigram
--      lets Postgres resolve leading-wildcard ILIKE without a scan.
--   2. Directory stats COUNT FILTER ... removed_at >= NOW()-7d
--      aggregates the whole table; partial btree on removed_at
--      narrows it to recently-removed rows (cached 600s server-side,
--      but still one seq scan per cache miss on ~100k rows).
--
-- All builds use CONCURRENTLY (no table locks) and IF NOT EXISTS,
-- following the 0014 pattern of bare statements (CONCURRENTLY
-- cannot run inside a transaction block).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sponsor_canonical_trgm_route
  ON sponsor_canonical USING GIN (route gin_trgm_ops)
  WHERE route IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sponsor_canonical_removed_at
  ON sponsor_canonical (removed_at DESC)
  WHERE status = 'REMOVED_REVOKED' AND removed_at IS NOT NULL;
