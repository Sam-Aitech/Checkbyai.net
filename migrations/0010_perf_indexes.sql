-- Performance indexes for Phase 5.
-- 1. users.deleted_at: speeds up soft-delete filtering and admin cleanup queries.
-- 2. notif_log.company_name: speeds up per-company notification lookups.

CREATE INDEX IF NOT EXISTS "idx_users_deleted_at"
  ON "users"("deleted_at");

CREATE INDEX IF NOT EXISTS "idx_notif_log_company_name"
  ON "notif_log"("company_name");
