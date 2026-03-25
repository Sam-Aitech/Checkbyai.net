-- Migration: 0013_support_tickets
-- Purpose: Support ticket system for Pro Dashboard — users submit queries,
--          admins reply. Linked to users with cascade delete.

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id"          BIGSERIAL PRIMARY KEY,
  "user_id"     VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject"     TEXT NOT NULL,
  "message"     TEXT NOT NULL,
  "status"      VARCHAR NOT NULL DEFAULT 'open',
  "admin_reply" TEXT,
  "replied_at"  TIMESTAMP,
  "created_at"  TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_support_tickets_user_id" ON "support_tickets" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_status"  ON "support_tickets" ("status");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_created" ON "support_tickets" ("created_at" DESC);
