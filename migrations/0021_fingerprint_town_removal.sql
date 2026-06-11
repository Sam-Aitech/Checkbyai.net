-- ============================================================
-- Migration 0021: Fingerprint town-segment removal
--
-- Context: In May 2026 GOV.UK changed the register CSV layout to
--   Sponsor Licence Number, Organisation Name, TierRating,
--   Migrant Classification, Sponsor Status
-- The Town/City column no longer exists, so the runtime fingerprint
-- (normalizedName|normalizedTown|route) is now generated as
-- (normalizedName||route) with an empty middle segment.
--
-- Stored fingerprints still carry the old town segment, so no row in
-- the database can ever match a fingerprint generated from the new
-- feed. This migration rewrites every stored fingerprint from
--   name|town|route  →  name||route
-- and deduplicates rows that collapse onto the same new fingerprint
-- (same company name + route previously listed in multiple towns).
--
-- The rewrite is idempotent: fingerprints already in name||route form
-- are unchanged by the regexp.
-- ============================================================

BEGIN;

-- ── Helper expression used throughout ────────────────────────────────────────
-- regexp_replace(fp, '^([^|]*)\|[^|]*\|', '\1||')
--   "acme ltd|london|skilled worker" → "acme ltd||skilled worker"
--   "acme ltd||skilled worker"       → unchanged (idempotent)

-- ── 1. sponsor_canonical (unique fingerprint) ────────────────────────────────
-- Deduplicate first: rows collapsing to the same new fingerprint keep the
-- "best" row — live status preferred, then earliest first_seen, then lowest id.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
      ORDER BY
        (status NOT IN ('REMOVED_REVOKED')) DESC,
        first_seen ASC,
        id ASC
    ) AS rn
  FROM sponsor_canonical
)
DELETE FROM sponsor_canonical sc
USING ranked r
WHERE sc.id = r.id AND r.rn > 1;

UPDATE sponsor_canonical
SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
WHERE fingerprint ~ '^[^|]*\|[^|]+\|';

-- ── 2. sponsor_changes (non-unique) ──────────────────────────────────────────
UPDATE sponsor_changes
SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
WHERE fingerprint IS NOT NULL
  AND fingerprint ~ '^[^|]*\|[^|]+\|';

-- ── 3. company_watches (non-unique) ──────────────────────────────────────────
UPDATE company_watches
SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
WHERE fingerprint IS NOT NULL
  AND fingerprint ~ '^[^|]*\|[^|]+\|';

-- ── 4. sponsor_enrichment (unique fingerprint) ───────────────────────────────
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
      ORDER BY id ASC
    ) AS rn
  FROM sponsor_enrichment
)
DELETE FROM sponsor_enrichment se
USING ranked r
WHERE se.id = r.id AND r.rn > 1;

UPDATE sponsor_enrichment
SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
WHERE fingerprint ~ '^[^|]*\|[^|]+\|';

-- ── 5. sponsor_licence_timeline (unique fingerprint+recorded_date+source) ────
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||'),
        recorded_date,
        source
      ORDER BY id ASC
    ) AS rn
  FROM sponsor_licence_timeline
)
DELETE FROM sponsor_licence_timeline t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

UPDATE sponsor_licence_timeline
SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
WHERE fingerprint ~ '^[^|]*\|[^|]+\|';

-- ── 6. enrichment_queue (unique fingerprint+job_type) ────────────────────────
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||'),
        job_type
      ORDER BY id ASC
    ) AS rn
  FROM enrichment_queue
)
DELETE FROM enrichment_queue q
USING ranked r
WHERE q.id = r.id AND r.rn > 1;

UPDATE enrichment_queue
SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
WHERE fingerprint ~ '^[^|]*\|[^|]+\|';

-- ── 7. job_listings (non-unique) ─────────────────────────────────────────────
UPDATE job_listings
SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
WHERE fingerprint ~ '^[^|]*\|[^|]+\|';

-- ── 8. job_alert_preferences (unique user_id+fingerprint) ────────────────────
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        user_id,
        regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
      ORDER BY id ASC
    ) AS rn
  FROM job_alert_preferences
)
DELETE FROM job_alert_preferences p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

UPDATE job_alert_preferences
SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
WHERE fingerprint ~ '^[^|]*\|[^|]+\|';

-- ── 9. sponsor_staging (transient ETL table, non-unique) ─────────────────────
UPDATE sponsor_staging
SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
WHERE fingerprint ~ '^[^|]*\|[^|]+\|';

-- ── 10. sponsor_list (legacy; dropped by 0011 in some environments) ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sponsor_list') THEN
    UPDATE sponsor_list
    SET fingerprint = regexp_replace(fingerprint, '^([^|]*)\|[^|]*\|', '\1||')
    WHERE fingerprint IS NOT NULL
      AND fingerprint ~ '^[^|]*\|[^|]+\|';
  END IF;
END $$;

COMMIT;
