-- ============================================================
-- Migration 0023: Add webhook columns to notification_preferences
--
-- Context: Phase 2 of notification engine upgrade adds webhook
-- channel support. Previously the webhook URL was (incorrectly)
-- read from the `email` column. Now it has its own column.
-- ============================================================

BEGIN;

ALTER TABLE notification_preferences
  ADD COLUMN webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN webhook_url VARCHAR;

COMMIT;
