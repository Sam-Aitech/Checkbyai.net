-- Migration: Add is_test column to sponsor_changes
-- Sprint 4 quality fix (QA-005)

ALTER TABLE "sponsor_changes" ADD COLUMN IF NOT EXISTS "is_test" boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS "idx_sponsor_changes_is_test" ON "sponsor_changes" ("is_test");
