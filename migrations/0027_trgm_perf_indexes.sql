CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sc_trgm_hist" ON "sponsor_canonical" USING gin ((array_to_string("historical_names", ' ')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sc_trgm_route" ON "sponsor_canonical" USING gin ("route" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_changes_trgm_org" ON "sponsor_changes" USING gin ("organisation_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_changes_detected_desc" ON "sponsor_changes" USING btree ("detected_at" DESC) WHERE "is_test" = false;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sc_trgm_name_gin" ON "sponsor_canonical" USING gin ("current_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sc_trgm_city_gin" ON "sponsor_canonical" USING gin ("town_city" gin_trgm_ops);
