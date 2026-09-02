-- NOTE: originally authored as `CREATE UNIQUE INDEX CONCURRENTLY`, but this
-- project's migration runner wraps every pending migration in a single
-- transaction (see 0027's note) and CONCURRENTLY cannot run inside one.
-- Non-concurrent is also strictly safer here: if duplicate (user_id,
-- change_id, channel) rows with success=true already exist, a concurrent
-- unique index silently ends up INVALID (never enforcing) with no error —
-- this migration will instead fail loudly, which is the correct signal to
-- deduplicate notif_log before retrying.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_notif_log_idem" ON "notif_log" ("user_id", "change_id", "channel") WHERE "success" = true;
