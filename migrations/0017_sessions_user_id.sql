-- Migration: Add user_id column to sessions table for user-based session management
-- Sprint 3 security hardening (SEC-029)

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_id" varchar;
CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" ("user_id");
