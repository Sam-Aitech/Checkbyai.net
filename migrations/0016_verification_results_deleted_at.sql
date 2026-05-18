-- Migration: Add deleted_at column to verification_results for soft-delete
-- Sprint 1 security hardening (SEC-010)

ALTER TABLE "verification_results" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
CREATE INDEX IF NOT EXISTS "idx_verification_results_deleted_at" ON "verification_results" ("deleted_at");
