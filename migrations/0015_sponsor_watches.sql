-- Migration: Add sponsor_watches table for reactivation notifications
-- Users can "watch" a company and be notified when its licence is reactivated/granted.

CREATE TABLE IF NOT EXISTS "sponsor_watches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_name" text NOT NULL,
  "company_number" text,
  "status" varchar NOT NULL DEFAULT 'pending_activation',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "notified_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_sponsor_watches_user_id" ON "sponsor_watches" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_sponsor_watches_status" ON "sponsor_watches" ("status");
CREATE INDEX IF NOT EXISTS "idx_sponsor_watches_company_name" ON "sponsor_watches" ("company_name");
