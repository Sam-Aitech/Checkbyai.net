-- ============================================================
-- Migration 0003: Sponsor Status Overhaul
--
-- Fixes:
--   1. Adds pg_trgm for database-backed fuzzy search fallback
--      (eliminates blank results when Fuse index is cold/empty)
--   2. Adds granted_at DATE to track when a company first
--      appeared on the register (enables "Newly Granted" badge)
--   3. Adds removed_at TIMESTAMPTZ to timestamp confirmed removals
--   4. Migrates status values from 2-state (ACTIVE | NOT_LISTED)
--      to 4-state model:
--        ACTIVE          — currently on register, established
--        NEWLY_GRANTED   — appeared in today's CSV, was not known
--        GRACE_PERIOD    — absent 1 day (waiting for confirmation)
--        REMOVED_REVOKED — absent 2+ consecutive days, confirmed
--   5. Creates sponsor_status_summary VIEW to fix the admin stats
--      query that was querying for status = 'REMOVED' (wrong value,
--      always returned 0).
--   6. Adds fingerprint column to sponsor_changes for direct
--      canonical linkage and faster notification lookups.
--   7. Adds GIN trigram indexes for pg_trgm search.
--   8. Adds composite partial index for the sync engine hot path.
-- ============================================================

BEGIN;

-- ── Step 1: Install pg_trgm ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Step 2: Add granted_at to sponsor_canonical ──────────────────────────────
-- Nullable first so we can backfill, then set NOT NULL + DEFAULT.
ALTER TABLE sponsor_canonical
  ADD COLUMN IF NOT EXISTS granted_at DATE;

-- Backfill: treat first_seen as the grant date for all existing records.
UPDATE sponsor_canonical
  SET granted_at = first_seen
  WHERE granted_at IS NULL;

ALTER TABLE sponsor_canonical
  ALTER COLUMN granted_at SET NOT NULL,
  ALTER COLUMN granted_at SET DEFAULT CURRENT_DATE;

-- ── Step 3: Add removed_at to sponsor_canonical ──────────────────────────────
ALTER TABLE sponsor_canonical
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

-- ── Step 4: Migrate status values ────────────────────────────────────────────
-- NOT_LISTED (consecutive_misses >= 2) → REMOVED_REVOKED (confirmed)
-- NOT_LISTED (consecutive_misses  = 1) → GRACE_PERIOD    (first absence)
-- NOT_LISTED (consecutive_misses  = 0) → GRACE_PERIOD    (edge case guard)
UPDATE sponsor_canonical
SET
  status     = CASE
                 WHEN status = 'NOT_LISTED' AND consecutive_misses >= 2 THEN 'REMOVED_REVOKED'
                 WHEN status = 'NOT_LISTED'                             THEN 'GRACE_PERIOD'
                 ELSE status
               END,
  removed_at = CASE
                 WHEN status = 'NOT_LISTED' AND consecutive_misses >= 2 THEN NOW()
                 ELSE NULL
               END
WHERE status = 'NOT_LISTED';

-- ── Step 5: GIN trigram indexes for pg_trgm fallback search ─────────────────
-- These power SELECT ... WHERE current_name % $query ORDER BY similarity.
-- CONCURRENTLY = no table lock, safe on live DB.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sponsor_canonical_trgm_name
  ON sponsor_canonical USING GIN (current_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sponsor_canonical_trgm_city
  ON sponsor_canonical USING GIN (town_city gin_trgm_ops);

-- ── Step 6: Composite partial index for sync engine hot path ─────────────────
-- The reconcile() function loads all live records by status + fingerprint.
-- Partial index (only live statuses) stays small and fast.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sponsor_canonical_live_status
  ON sponsor_canonical (status, fingerprint)
  WHERE status IN ('ACTIVE', 'NEWLY_GRANTED', 'GRACE_PERIOD');

-- ── Step 7: Index for granted_at queries ─────────────────────────────────────
-- Used by dashboard "Newly Granted Today" panel and notification targeting.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sponsor_canonical_granted_at
  ON sponsor_canonical (granted_at DESC)
  WHERE status = 'NEWLY_GRANTED';

-- ── Step 8: Add fingerprint to sponsor_changes ───────────────────────────────
ALTER TABLE sponsor_changes
  ADD COLUMN IF NOT EXISTS fingerprint TEXT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sponsor_changes_fingerprint
  ON sponsor_changes (fingerprint)
  WHERE fingerprint IS NOT NULL;

-- ── Step 9: Fix admin stats view ─────────────────────────────────────────────
-- The old stats query used `status = 'REMOVED'` — no row ever had that value.
-- Replace with a proper view that covers all 4 status values.
CREATE OR REPLACE VIEW sponsor_status_summary AS
SELECT
  COUNT(*)                                                                       AS total,
  COUNT(*) FILTER (WHERE status = 'ACTIVE')                                      AS active,
  COUNT(*) FILTER (WHERE status = 'NEWLY_GRANTED')                               AS newly_granted,
  COUNT(*) FILTER (WHERE status = 'GRACE_PERIOD')                                AS grace_period,
  COUNT(*) FILTER (WHERE status = 'REMOVED_REVOKED')                             AS removed_revoked,
  COUNT(*) FILTER (WHERE status = 'NEWLY_GRANTED'
                   AND granted_at = CURRENT_DATE)                                AS granted_today,
  COUNT(*) FILTER (WHERE status = 'REMOVED_REVOKED'
                   AND removed_at >= NOW() - INTERVAL '24 hours')                AS revoked_today
FROM sponsor_canonical;

COMMIT;
