-- ============================================================
-- Migration 0004: CSV Archive & Diff Results
--
-- Adds two tables that underpin the new qsv + csvdiff pipeline:
--
--   csv_archive  — one row per day, pointing to the validated
--                  flat-file on disk. Replaces the sponsor_list
--                  row-per-record approach (45M rows/year avoided).
--
--   diff_results — stores the output of csvdiff for each run:
--                  added/removed counts and optional path to the
--                  raw diff JSON for audit/replay purposes.
--
-- Both tables are purely additive — no existing schema is changed.
-- ============================================================

-- ── Table 1: csv_archive ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS csv_archive (
  id              SERIAL        PRIMARY KEY,
  snapshot_date   DATE          NOT NULL UNIQUE,
  file_path       TEXT          NOT NULL,          -- absolute path to qsv-cleaned CSV on disk
  record_count    INTEGER       NOT NULL,           -- total rows (excluding header)
  checksum_sha256 TEXT          NOT NULL,           -- SHA-256 of the clean CSV for integrity checks
  source_url      TEXT,                             -- original Gov.uk download URL
  is_valid        BOOLEAN       NOT NULL DEFAULT true,   -- false if qsv validation failed
  downloaded_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Most queries look up by date (e.g. "give me yesterday's CSV path")
CREATE INDEX IF NOT EXISTS idx_csv_archive_date
  ON csv_archive (snapshot_date DESC);

-- ── Table 2: diff_results ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diff_results (
  id                     SERIAL        PRIMARY KEY,
  run_date               DATE          NOT NULL,
  added_count            INTEGER       NOT NULL DEFAULT 0,
  removed_count          INTEGER       NOT NULL DEFAULT 0,
  attribute_change_count INTEGER       NOT NULL DEFAULT 0,  -- rows in both Additions + Deletions
  diff_duration_ms       INTEGER,                            -- how long csvdiff took
  diff_json_path         TEXT,                               -- path to raw diff.json for replay/audit
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diff_results_run_date
  ON diff_results (run_date DESC);
