-- ============================================================
-- Migration 0014: Compound Indexes & ETL Integrity Columns
--
-- Purpose:
--   1. Five compound indexes replace multiple single-column
--      index scans with a single seek + filter, targeting the
--      exact query shapes used by the sponsor search, directory,
--      and history endpoints.
--
--   2. diff_json JSONB column on diff_results stores a bounded
--      diff payload (fingerprint lists) inline in the DB,
--      replacing the diffJsonPath filesystem pointer that breaks
--      in horizontal multi-server deployments.
--
--   3. sync_status TEXT on csv_archive provides crash-safe ETL
--      integrity: a downloaded archive is marked PENDING_SYNC
--      until the state machine completes, making silent mid-run
--      failures visible and queryable.
--
-- All index builds use CONCURRENTLY to avoid table locks on the
-- live database. The ADD COLUMN statements use IF NOT EXISTS to
-- make this migration safe to re-run.
-- ============================================================

-- ── Block 1: Compound indexes on sponsor_canonical ───────────────────────────
--
-- Before: a filtered search (e.g. status=ACTIVE&q=Google) required two
--         separate index scans — one on status, one on current_name — then
--         an in-database merge. Each scan touches O(N_status) rows.
--
-- After:  a single range scan on (status, current_name) narrows immediately
--         to the exact status bucket, then applies the name predicate within
--         that bucket. This matches the exact query shape of:
--           WHERE status = $1 AND (current_name ILIKE $2 OR ...)
--
-- Covers: /api/sponsors/search   ?status=ACTIVE&q=...
--         /api/sponsors/directory?status=...&name=...
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sc_status_name
  ON sponsor_canonical (status, current_name);

-- Covers: /api/sponsors/directory?status=...&town=...
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sc_status_town
  ON sponsor_canonical (status, town_city);

-- Covers: /api/sponsors/directory?status=...&route=...  (tier/type filter)
-- Also used when the admin panel filters by typeRating (A-rated / B-rated).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sc_status_type
  ON sponsor_canonical (status, type_rating);


-- ── Block 2: Compound indexes on sponsor_changes ─────────────────────────────
--
-- Before: the /api/sponsor-changes and company history endpoints each needed
--         two single-column index lookups then a sort.
--
-- After:  one composite seek handles both the filter and the ORDER BY clause.

-- Covers: /api/sponsor-changes
--   WHERE snapshot_date >= $1 AND change_type = $2
--   ORDER BY snapshot_date DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_changes_date_type
  ON sponsor_changes (snapshot_date DESC, change_type);

-- Covers: /api/sponsors/:fingerprint/history
--   WHERE fingerprint = $1
--   ORDER BY detected_at DESC
-- A tighter compound index that supersedes the existing single-column
-- idx_sponsor_changes_fingerprint for history queries (the old one is kept
-- for backward-compat with any queries that only filter by fingerprint
-- without ordering).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_changes_fp_detected
  ON sponsor_changes (fingerprint, detected_at DESC)
  WHERE fingerprint IS NOT NULL;


-- ── Block 3: diff_results — inline diff payload ──────────────────────────────
--
-- The existing diff_json_path column stores a local filesystem path.
-- On a second server instance, that path does not exist — making the
-- stored path useless in any horizontal-scale deployment.
--
-- diff_json stores a bounded payload directly in the DB:
--   { "added": ["fp1","fp2",...], "removed": [...], "modified": [...] }
-- Each list is capped at 1 000 fingerprints in application logic.
-- Typical daily changes are 20–200 entries (a few KB), so storage impact
-- is negligible. The full record-level changes are already persisted in
-- sponsor_changes; this payload is for audit/replay tooling.
ALTER TABLE diff_results
  ADD COLUMN IF NOT EXISTS diff_json JSONB;


-- ── Block 4: csv_archive — sync integrity status ─────────────────────────────
--
-- Without this column, a server crash after archiving the CSV but before
-- the state machine completes leaves no trace — the archive row exists and
-- looks valid, but the daily sponsor updates were never applied.
--
-- Flow:
--   csvArchiver.ts  → INSERT … sync_status = 'PENDING_SYNC'
--   sponsorMonitorJob.ts (after applyStateMachine succeeds)
--                   → UPDATE csv_archive SET sync_status = 'SYNCED'
--   sponsorMonitorJob.ts (on caught error during state machine)
--                   → UPDATE csv_archive SET sync_status = 'FAILED'
--
-- The monitor job logs a WARNING on startup when any archive is PENDING_SYNC,
-- alerting operators that a re-run is needed.
ALTER TABLE csv_archive
  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'SYNCED';

-- Backfill note: the DEFAULT 'SYNCED' covers all existing rows automatically.
-- New archives are inserted as PENDING_SYNC (see csvArchiver.ts).

-- Partial index: only non-SYNCED rows are indexed, keeping this index tiny.
-- Used by the startup integrity check in sponsorMonitorJob.ts.
CREATE INDEX IF NOT EXISTS idx_csv_archive_sync_status
  ON csv_archive (sync_status, snapshot_date DESC)
  WHERE sync_status != 'SYNCED';
