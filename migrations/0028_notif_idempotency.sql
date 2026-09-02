CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "idx_notif_log_idem" ON "notif_log" ("user_id", "change_id", "channel") WHERE "success" = true;
