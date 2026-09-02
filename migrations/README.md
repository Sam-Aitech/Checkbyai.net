# Migrations

`meta/_journal.json` was missing until 2026-08-24, so `npm run db:migrate` was
non-functional and Drizzle never tracked which of `0001`–`0023` actually ran.
`0001`–`0023` are kept on disk as historical record but are **not** referenced
by the journal — they are superseded by `0024_catchup.sql`, which was generated
via `drizzle-kit generate` as a full diff between the original `0000` snapshot
and current `shared/schema.ts`. It is purely additive (no DROP/ALTER-DROP
statements) and creates every table/column/index the app expects but that
never had a corresponding migration (`sponsor_canonical`, `job_locks`,
`daily_digest`, `paid_submissions`, etc.).

## Fresh environment (new DB)

`npm run db:migrate` now works normally — it applies `0000` then `0024_catchup`.

## Existing production DB

Production already has this schema because `server/index.ts` runs boot-time
DDL patches (`applyDataFixbacks()`, around lines 299–410) to paper over
the drift. Running `db:migrate` there for the first time will try to
`CREATE TABLE`/`ALTER TABLE` things that already exist and fail, because the
`__drizzle_migrations` tracking table has never recorded anything.

Before running `db:migrate` against prod, seed the tracking table so Drizzle
considers `0000` and `0024_catchup` already applied:

```sql
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
-- hash values must match the sha256 of each migration file's contents,
-- as computed by drizzle-kit. Do not hand-roll these — instead run
-- `drizzle-kit migrate` with --dry-run once implemented, or apply via a
-- one-off script that reads migrations/meta/_journal.json and computes
-- the same hash drizzle-kit uses, then inserts rows for 0000 and 0024_catchup
-- before enabling this workflow for prod deploys.
```

This has not been run against production — it needs a deploy-time decision
and DB credentials this session did not have.

## CREATE INDEX CONCURRENTLY is not usable here

`npm run db:migrate` (`drizzle-kit migrate`) wraps every pending migration's
statements in one `session.transaction(...)` — confirmed against
`node_modules/drizzle-orm/pg-core/dialect.js`'s `migrate()`. PostgreSQL
rejects `CREATE INDEX CONCURRENTLY` inside a transaction block outright, so
any migration file using it will abort the entire pending batch, not just
itself. `0027_trgm_perf_indexes.sql` and `0028_notif_idempotency.sql` were
written non-concurrently for this reason — each takes a brief write lock on
its target table while building. If a future migration genuinely needs a
non-blocking concurrent index build on a hot table, it must be applied
outside `db:migrate` entirely (a one-off script against a fresh, non-pooled,
non-transactional connection), not added to this journal.
