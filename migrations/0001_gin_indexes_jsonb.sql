-- Migration: 0001_gin_indexes_jsonb.sql
-- Purpose: Add GIN (Generalized Inverted Index) indexes on critical JSONB columns
--          to eliminate O(N) full table scans in the CoS verification pipeline.
--
-- BACKGROUND:
--   The HITL (Human-in-the-Loop) knowledge loader in pdfAnalyzer.ts fetches ALL
--   rows from verification_results and filters in application code. As this table
--   grows past 10,000 rows, every admin verification triggers a full sequential
--   scan. GIN indexes allow PostgreSQL to resolve JSONB key-path lookups in O(log N)
--   via a B-tree over the GIN posting lists.
--
-- SAFETY: Uses CREATE INDEX CONCURRENTLY so the table is NOT locked during the build.
--         This is safe to run on a live production database.

-- 1. GIN index on verification_results.metadata
--    Enables fast queries like: WHERE metadata @> '{"producer": "Adobe Acrobat"}' 
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vr_metadata_gin
  ON verification_results USING gin (metadata jsonb_path_ops);

-- 2. GIN index on verification_results.analysis_details
--    Enables fast queries by forensic check results embedded in analysis JSON
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vr_analysis_gin
  ON verification_results USING gin (analysis_details jsonb_path_ops);

-- 3. GIN index on trusted_patterns.metadata
--    Enables fast HITL producer-matching lookups instead of full table scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tp_metadata_gin
  ON trusted_patterns USING gin (metadata jsonb_path_ops);

-- 4. GIN index on trusted_patterns.patterns
--    Enables fast lookups when matching document structure patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tp_patterns_gin
  ON trusted_patterns USING gin (patterns jsonb_path_ops);

-- 5. Composite index on verification_results (adminStatus, verifiedAt) for HITL admin queries
--    This dramatically speeds up the admin portal query: WHERE admin_status = 'fake' ORDER BY verified_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vr_admin_status_date
  ON verification_results (admin_status, verified_at DESC)
  WHERE admin_status IN ('fake', 'approved');
