-- DEFERRED: DO NOT APPLY before 2026-04-20 and before removing all
-- sponsor_list references from server/utils/sponsorListFetcher.ts.
--
-- sponsor_list was retired 2026-03-20. Superseded by:
--   - sponsor_canonical  (per-company live state)
--   - csv_archive        (daily CSV snapshots)
--   - diff_results       (detected changes per run)
--
-- Pre-drop checklist:
--   1. Remove sponsorList imports and all db.insert/select/delete usages
--      from server/utils/sponsorListFetcher.ts
--   2. Remove the sponsorList table definition from shared/schema.ts
--   3. Remove the SponsorListEntry type export from shared/schema.ts
--   4. Apply this migration to dev, verify, then apply to production.

DROP TABLE IF EXISTS "sponsor_list";
