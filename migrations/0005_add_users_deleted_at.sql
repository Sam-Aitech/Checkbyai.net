-- Add soft-delete column to users table
-- Used by server/storage.ts deleteUser() and getUser() for soft-delete logic
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
