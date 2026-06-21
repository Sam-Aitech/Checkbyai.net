-- Migration: Normalize sponsor_canonical status casing
-- Root cause: some status values were stored with inconsistent casing
-- (e.g. "active" instead of "ACTIVE"), which broke ALL queries using
-- WHERE status IN ('ACTIVE', ...) since PostgreSQL string comparison
-- is case-sensitive by default.
--
-- Affects: search index, nightly stats, active sponsor count,
-- recently-revoked list, seed initial digest.
--
-- After running this migration, manually trigger:
--   POST /api/admin/sponsor-monitor/rebuild-index
--   POST /api/admin/daily-digest/refresh

UPDATE "sponsor_canonical"
SET "status" = UPPER("status")
WHERE "status" <> UPPER("status");
