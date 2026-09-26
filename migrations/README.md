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

`npm run db:migrate` applies journal entries `0000` + `0024`–`0030` in order.
All journaled migrations are idempotent (`IF NOT EXISTS` / `IF EXISTS` /
`DO … EXCEPTION WHEN duplicate_*`), so re-running is always safe.

## Existing production DB (drift cutover)

Production grew its schema via boot-time DDL (`applyDataFixbacks()` in
`server/index.ts`) while `drizzle.__drizzle_migrations` stayed empty, so an
unseeded `db:migrate` would re-apply everything. Two layers make the cutover
safe (both run automatically in `start:with-migrate`, which Docker uses):

1. **Seed** — `npm run db:seed-history` (`scripts/seed-migration-history.ts`
   `--execute`) checks each journal entry's expected objects against the live
   DB and inserts tracking rows `(hash = sha256 of file bytes,
   created_at = journal when)` only for fully-present entries. Anything
   missing stays pending. Dry-run first any time:
   `npx tsx scripts/seed-migration-history.ts` (default mode writes nothing).
2. **Idempotent SQL** — every journaled migration tolerates already-existing
   objects, so partially-drifted entries self-heal when migrate applies them.

Manual cutover (one-off, with prod `DATABASE_URL`):

```sh
npx tsx scripts/seed-migration-history.ts              # inspect plan
npx tsx scripts/seed-migration-history.ts --execute    # write tracking rows
npm run db:migrate                                     # apply leftovers
```

Notes:

- The seed hashes use drizzle-orm's exact algorithm; `tests/seed-migration-history.test.ts`
  asserts byte-equality against drizzle-orm's own `readMigrationFiles`, plus
  CHECKS coverage of every created object and a ban on `CONCURRENTLY` /
  `ADD … IF NOT EXISTS` (invalid PG syntax) in journaled files.
- `0030_drop_sponsor_list` drops the legacy `sponsor_list` table via migrate
  on DBs that still have it (the seed leaves that entry pending there).
- `0001`–`0023` and `0011_drop_sponsor_list.sql` remain historical record
  only — never journaled, never executed.

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
