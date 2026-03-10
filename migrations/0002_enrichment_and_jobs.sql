-- Migration 0002: Company Enrichment & Job Alert tables
-- Run: psql $DATABASE_URL -f migrations/0002_enrichment_and_jobs.sql
-- Safe to run on live production (CONCURRENTLY = no table lock where applicable)

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 1: sponsor_enrichment
-- Caches Companies House data scraped for each watched sponsor.
-- Keyed by fingerprint (same key used in sponsorCanonical).
-- TTL enforced in application logic (7 day re-scrape).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sponsor_enrichment (
  id                    SERIAL PRIMARY KEY,
  fingerprint           VARCHAR(500) NOT NULL UNIQUE,
  company_number        VARCHAR(20),
  nature_of_business    TEXT,
  registered_address    TEXT,
  website_url           VARCHAR(500),
  scraped_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  scrape_status         VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'success' | 'failed' | 'not_found'
  last_attempted        TIMESTAMP WITH TIME ZONE,
  CONSTRAINT chk_scrape_status CHECK (scrape_status IN ('pending','success','failed','not_found'))
);

CREATE INDEX IF NOT EXISTS idx_enrichment_fingerprint
  ON sponsor_enrichment (fingerprint);

CREATE INDEX IF NOT EXISTS idx_enrichment_scraped_at
  ON sponsor_enrichment (scraped_at);

CREATE INDEX IF NOT EXISTS idx_enrichment_status
  ON sponsor_enrichment (scrape_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 2: job_listings
-- Stores deduplicated job listings found across job boards for watched sponsors.
-- content_hash ensures the same job from the same board is never duplicated.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_listings (
  id              SERIAL PRIMARY KEY,
  fingerprint     VARCHAR(500) NOT NULL,
  title           VARCHAR(500) NOT NULL,
  location        VARCHAR(300),
  salary          VARCHAR(200),
  source_board    VARCHAR(50) NOT NULL,
  -- 'company' | 'linkedin' | 'indeed' | 'cvlibrary' | 'google'
  source_url      TEXT NOT NULL,
  content_hash    VARCHAR(64) NOT NULL UNIQUE,
  -- SHA-256 of (fingerprint + title + location + source_board)
  first_seen      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_source_board CHECK (source_board IN ('company','linkedin','indeed','cvlibrary','google'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint
  ON job_listings (fingerprint);

CREATE INDEX IF NOT EXISTS idx_jobs_first_seen
  ON job_listings (first_seen DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_active
  ON job_listings (is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint_active
  ON job_listings (fingerprint, is_active, first_seen DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 3: job_alert_preferences
-- Per-user per-company opt-in for job opening alerts.
-- Pro plan only — enforced in application logic.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_alert_preferences (
  id              SERIAL PRIMARY KEY,
  user_id         VARCHAR(255) NOT NULL,
  fingerprint     VARCHAR(500) NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_job_prefs_user_id
  ON job_alert_preferences (user_id);

CREATE INDEX IF NOT EXISTS idx_job_prefs_fingerprint
  ON job_alert_preferences (fingerprint) WHERE enabled = TRUE;
