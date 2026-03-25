-- Migration: 0012_subscription_audit_log
-- Purpose: Track every subscription status change with source, actor, and reason.
--          Covers both Stripe webhook events and admin overrides.

CREATE TABLE IF NOT EXISTS "subscription_audit_log" (
  "id"               BIGSERIAL PRIMARY KEY,
  "user_id"          VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "changed_by"       VARCHAR,                          -- admin userId, 'stripe', or 'system'
  "source"           VARCHAR NOT NULL,                 -- 'stripe_webhook' | 'admin_override' | 'system'
  "previous_status"  VARCHAR NOT NULL,
  "new_status"       VARCHAR NOT NULL,
  "reason"           TEXT,                             -- optional free-text note
  "metadata"         JSONB DEFAULT '{}'::jsonb,        -- stripe event id, deactivated_watches, etc.
  "created_at"       TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX "idx_sub_audit_user_id"   ON "subscription_audit_log" ("user_id");
CREATE INDEX "idx_sub_audit_created"   ON "subscription_audit_log" ("created_at" DESC);
CREATE INDEX "idx_sub_audit_source"    ON "subscription_audit_log" ("source");
