-- New-generation notification audit log (Part 4 / Part 5).
-- uuid PK avoids int-sequence contention.
-- success boolean replaces the multi-value status column for simpler analytics.
-- Supersedes notif_engine_log (kept for backwards-compat; will be dropped post-Part-5).
CREATE TABLE IF NOT EXISTS "notif_log" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"              varchar NOT NULL REFERENCES "users"("id"),
  "change_id"            integer REFERENCES "sponsor_changes"("id"),
  "event_type"           varchar NOT NULL,
  "channel"              varchar NOT NULL DEFAULT 'email',
  "company_name"         text NOT NULL,
  "success"              boolean NOT NULL,
  "provider_message_id"  varchar,
  "error_details"        text,
  "sent_at"              timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_notif_log_user_sent" ON "notif_log"("user_id", "sent_at");
