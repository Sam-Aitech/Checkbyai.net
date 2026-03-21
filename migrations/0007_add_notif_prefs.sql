-- Add per-event-type notification preferences to users table.
-- Stored as jsonb so the notification engine can read it without an extra join.
-- null = all event types enabled (backwards-compatible default).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notif_prefs" jsonb;
