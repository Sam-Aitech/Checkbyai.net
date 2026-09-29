#!/usr/bin/env tsx
/**
 * Seed `drizzle.__drizzle_migrations` for migrations whose effects are
 * already present in the database (prod drift cutover).
 *
 * Background: `meta/_journal.json` was missing until 2026-08-24, so prod
 * grew its schema via boot-time DDL (`applyDataFixbacks()`) instead of
 * `drizzle-kit migrate`, and the tracking table is empty there. Running
 * `db:migrate` unseeded would re-apply everything and fail on objects that
 * already exist (Docker `start:with-migrate` runs migrate on every boot).
 *
 * How applied-ness works (verified against drizzle-orm@0.45
 * `migrator.js` + `pg-core/dialect.js`, which is what `drizzle-kit migrate`
 * delegates to):
 *   - hash       = sha256 of the migration file's exact bytes (utf-8)
 *   - created_at = the journal entry's `when` value
 *   - an entry is skipped iff max(created_at in tracking) >= entry.when
 * So inserting (hash, when) rows for already-present migrations makes
 * migrate skip exactly those entries. `computeMigrationHash` below uses the
 * identical algorithm; `tests/seed-migration-history.test.ts` asserts
 * byte-equality against drizzle-orm's own `readMigrationFiles`.
 *
 * Safety model: an entry is seeded ONLY if every object in its CHECKS list
 * is verified present in the live DB. Anything missing stays pending and
 * `db:migrate` applies it (all journaled migrations are idempotent:
 * IF NOT EXISTS / DO ... EXCEPTION WHEN duplicate_* — CONCURRENTLY is
 * forbidden because migrate runs inside one transaction).
 *
 * Usage:
 *   npx tsx scripts/seed-migration-history.ts            # dry-run (default)
 *   npx tsx scripts/seed-migration-history.ts --execute  # write rows
 *   npm run db:seed-history                              # --execute shorthand
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "@neondatabase/serverless";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATIONS_DIR = join(ROOT, "migrations");
const JOURNAL_PATH = join(MIGRATIONS_DIR, "meta", "_journal.json");

export interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export type ExistenceCheck =
  | { kind: "table"; name: string }
  | { kind: "tableAbsent"; name: string }
  | { kind: "column"; table: string; column: string }
  | { kind: "index"; name: string }
  | { kind: "fk"; name: string }
  | { kind: "constraint"; name: string }
  | { kind: "extension"; name: string };

/** Objects that must exist for an entry to count as already-applied. */
export const CHECKS: Record<string, ExistenceCheck[]> = {
  "0000_minor_wolf_cub": [
    { kind: "table", name: "feedback" },
    { kind: "table", name: "ip_verifications" },
    { kind: "table", name: "sessions" },
    { kind: "table", name: "trusted_patterns" },
    { kind: "table", name: "users" },
    { kind: "table", name: "verification_results" },
    { kind: "fk", name: "feedback_verification_id_verification_results_id_fk" },
    { kind: "fk", name: "feedback_user_id_users_id_fk" },
    { kind: "fk", name: "verification_results_user_id_users_id_fk" },
    { kind: "index", name: "IDX_session_expire" },
  ],
  // 0024 creates 34 tables (incl. sponsor_list, covered by 0030 instead) and
  // 24 columns. Index presence is NOT checked: boot DDL builds several of
  // these concurrently under the same names, and a missing non-critical
  // index is a perf gap, not breakage — the app runs fine today.
  "0024_catchup": [
    ...[
      "ai_generation_logs",
      "company_watches",
      "csv_archive",
      "daily_digest",
      "diff_results",
      "enrichment_queue",
      "expert_requests",
      "global_ai_rules",
      "incident_tickets",
      "ingestion_jobs",
      "job_alert_preferences",
      "job_listings",
      "job_locks",
      "job_trigger_audit",
      "monitor_job_runs",
      "notif_engine_log",
      "notif_log",
      "notification_log",
      "notification_preferences",
      "paid_submissions",
      "processed_checkouts",
      "push_subscriptions",
      "shadow_parity_reports",
      "shadow_run_results",
      "sponsor_canonical",
      "sponsor_changes",
      "sponsor_enrichment",
      "sponsor_licence_timeline",
      "sponsor_staging",
      "sponsor_watches",
      "subscription_audit_log",
      "support_tickets",
      "system_settings",
    ].map((name): ExistenceCheck => ({ kind: "table", name })),
    { kind: "column", table: "trusted_patterns", column: "ai_instructions" },
    { kind: "column", table: "trusted_patterns", column: "last_updated" },
    { kind: "column", table: "users", column: "username" },
    { kind: "column", table: "users", column: "hashed_password" },
    { kind: "column", table: "users", column: "credits" },
    { kind: "column", table: "users", column: "verification_limit" },
    { kind: "column", table: "users", column: "total_verifications_used" },
    { kind: "column", table: "users", column: "is_restricted" },
    { kind: "column", table: "users", column: "restriction_reason" },
    { kind: "column", table: "users", column: "cos_check_approved" },
    { kind: "column", table: "users", column: "cos_check_subscription" },
    { kind: "column", table: "users", column: "ip_exempt" },
    { kind: "column", table: "users", column: "cos_beta_enabled" },
    { kind: "column", table: "users", column: "cos_beta_limit" },
    { kind: "column", table: "users", column: "deleted_at" },
    { kind: "column", table: "users", column: "notif_prefs" },
    { kind: "column", table: "verification_results", column: "receipt_id" },
    { kind: "column", table: "verification_results", column: "document_hash" },
    { kind: "column", table: "verification_results", column: "admin_status" },
    { kind: "column", table: "verification_results", column: "admin_feedback" },
    { kind: "column", table: "verification_results", column: "admin_reviewed_by" },
    { kind: "column", table: "verification_results", column: "admin_reviewed_at" },
    { kind: "column", table: "verification_results", column: "accuracy_score" },
    { kind: "column", table: "verification_results", column: "deleted_at" },
    // UNIQUE constraints (pg_constraint, any contype):
    { kind: "constraint", name: "users_username_unique" },
    { kind: "constraint", name: "verification_results_receipt_id_unique" },
    // Foreign keys added by 0024:
    ...[
      "company_watches_user_id_users_id_fk",
      "expert_requests_user_id_users_id_fk",
      "global_ai_rules_created_by_users_id_fk",
      "job_trigger_audit_triggered_by_users_id_fk",
      "notif_engine_log_user_id_users_id_fk",
      "notif_engine_log_change_id_sponsor_changes_id_fk",
      "notif_log_user_id_users_id_fk",
      "notif_log_change_id_sponsor_changes_id_fk",
      "notification_log_user_id_users_id_fk",
      "notification_log_change_id_sponsor_changes_id_fk",
      "notification_preferences_user_id_users_id_fk",
      "paid_submissions_user_id_users_id_fk",
      "paid_submissions_assigned_to_users_id_fk",
      "push_subscriptions_user_id_users_id_fk",
      "shadow_parity_reports_shadow_run_id_shadow_run_results_id_fk",
      "shadow_run_results_triggered_by_users_id_fk",
      "sponsor_watches_user_id_users_id_fk",
      "subscription_audit_log_user_id_users_id_fk",
      "support_tickets_user_id_users_id_fk",
      "verification_results_admin_reviewed_by_users_id_fk",
    ].map((name): ExistenceCheck => ({ kind: "fk", name })),
  ],
  "0025_verification_audit_log": [
    { kind: "table", name: "verification_audit_log" },
    { kind: "fk", name: "verification_audit_log_verification_id_verification_results_id_fk" },
    { kind: "fk", name: "verification_audit_log_actor_id_users_id_fk" },
    { kind: "index", name: "idx_verif_audit_verification_id" },
    { kind: "index", name: "idx_verif_audit_actor_id" },
    { kind: "index", name: "idx_verif_audit_created" },
  ],
  "0026_verification_document_hash_index": [{ kind: "index", name: "idx_verification_document_hash" }],
  "0027_trgm_perf_indexes": [
    { kind: "extension", name: "pg_trgm" },
    { kind: "index", name: "idx_sc_trgm_hist" },
    { kind: "index", name: "idx_sc_trgm_route" },
    { kind: "index", name: "idx_changes_trgm_org" },
    { kind: "index", name: "idx_changes_detected_desc" },
    { kind: "index", name: "idx_sc_trgm_name_gin" },
    { kind: "index", name: "idx_sc_trgm_city_gin" },
  ],
  "0028_notif_idempotency": [{ kind: "index", name: "idx_notif_log_idem" }],
  "0029_pdf_verify_uploads": [
    { kind: "table", name: "pdf_verify_uploads" },
    { kind: "fk", name: "pdf_verify_uploads_user_id_users_id_fk" },
    { kind: "index", name: "idx_pdf_verify_uploads_created_at" },
  ],
  // 0030 is DROP TABLE IF EXISTS: applied means the table is GONE. If
  // sponsor_list still exists, the entry stays pending and migrate drops it.
  "0030_drop_sponsor_list": [{ kind: "tableAbsent", name: "sponsor_list" }],
};

export function readJournalEntries(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf-8")) as {
    entries: JournalEntry[];
  };
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

/**
 * drizzle-orm `readMigrationFiles` equivalent:
 * sha256 over the file's exact utf-8 bytes.
 */
export function computeMigrationHash(tag: string): string {
  const sql = readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`)).toString();
  return createHash("sha256").update(sql).digest("hex");
}

interface Presence {
  tables: Set<string>;
  columns: Set<string>;
  indexes: Set<string>;
  fks: Set<string>;
  constraints: Set<string>;
  extensions: Set<string>;
}

async function loadPresence(pool: Pool): Promise<Presence> {
  const tableNames = new Set<string>();
  const columnKeys = new Set<string>();
  const indexNames = new Set<string>();
  const fkNames = new Set<string>();
  const conNames = new Set<string>();
  const extNames = new Set<string>();
  for (const checks of Object.values(CHECKS)) {
    for (const c of checks) {
      if (c.kind === "table" || c.kind === "tableAbsent") tableNames.add(c.name);
      else if (c.kind === "column") columnKeys.add(`${c.table}.${c.column}`);
      else if (c.kind === "index") indexNames.add(c.name);
      else if (c.kind === "fk") fkNames.add(c.name);
      else if (c.kind === "constraint") conNames.add(c.name);
      else extNames.add(c.name);
    }
  }

  const tablesRes = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [[...tableNames]],
  );
  const foundTables = new Set(tablesRes.rows.map((r: { table_name: string }) => r.table_name));

  const columnsRes = await pool.query(
    `SELECT table_name || '.' || column_name AS key FROM information_schema.columns
     WHERE table_schema = 'public' AND (table_name || '.' || column_name) = ANY($1)`,
    [[...columnKeys]],
  );
  const foundColumns = new Set(columnsRes.rows.map((r: { key: string }) => r.key));

  const indexesRes = await pool.query(
    `SELECT c.relname FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'i' AND c.relname = ANY($1)`,
    [[...indexNames]],
  );
  const foundIndexes = new Set(indexesRes.rows.map((r: { relname: string }) => r.relname));

  const fksRes = await pool.query(`SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname = ANY($1)`, [
    [...fkNames],
  ]);
  const foundFks = new Set(fksRes.rows.map((r: { conname: string }) => r.conname));

  const conRes = await pool.query(`SELECT conname FROM pg_constraint WHERE conname = ANY($1)`, [[...conNames]]);
  const foundCon = new Set(conRes.rows.map((r: { conname: string }) => r.conname));

  const extRes = await pool.query(`SELECT extname FROM pg_extension WHERE extname = ANY($1)`, [[...extNames]]);
  const foundExt = new Set(extRes.rows.map((r: { extname: string }) => r.extname));

  return { tables: foundTables, columns: foundColumns, indexes: foundIndexes, fks: foundFks, constraints: foundCon, extensions: foundExt };
}

function checkSatisfied(check: ExistenceCheck, presence: Presence): boolean {
  switch (check.kind) {
    case "table":
      return presence.tables.has(check.name);
    case "tableAbsent":
      return !presence.tables.has(check.name);
    case "column":
      return presence.columns.has(`${check.table}.${check.column}`);
    case "index":
      return presence.indexes.has(check.name);
    case "fk":
      return presence.fks.has(check.name);
    case "constraint":
      return presence.constraints.has(check.name);
    case "extension":
      return presence.extensions.has(check.name);
  }
}

export interface EntryPlan {
  entry: JournalEntry;
  hash: string;
  alreadyRecorded: boolean;
  missing: string[];
  willSeed: boolean;
}

async function buildPlan(pool: Pool): Promise<EntryPlan[]> {
  const entries = readJournalEntries();
  const presence = await loadPresence(pool);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  // Read-only in dry-run too — CREATE TABLE IF NOT EXISTS would write, so
  // only probe. to_regclass-free approach: try selecting, tolerate 42P01.
  let recorded = new Set<string>();
  try {
    const res = await pool.query(`SELECT hash FROM drizzle.__drizzle_migrations`);
    recorded = new Set(res.rows.map((r: { hash: string }) => r.hash));
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42P01") throw err;
  }
  return entries.map((entry) => {
    const hash = computeMigrationHash(entry.tag);
    const checks = CHECKS[entry.tag] ?? [];
    const missing = checks.filter((c) => !checkSatisfied(c, presence)).map(describeCheck);
    return {
      entry,
      hash,
      alreadyRecorded: recorded.has(hash),
      missing,
      willSeed: missing.length === 0 && !recorded.has(hash),
    };
  });
}

function describeCheck(check: ExistenceCheck): string {
  switch (check.kind) {
    case "table":
      return `table ${check.name}`;
    case "tableAbsent":
      return `table ${check.name} still exists`;
    case "column":
      return `column ${check.table}.${check.column}`;
    case "index":
      return `index ${check.name}`;
    case "fk":
      return `fk ${check.name}`;
    case "constraint":
      return `constraint ${check.name}`;
    case "extension":
      return `extension ${check.name}`;
  }
}

async function runCli(args: string[]): Promise<void> {
  const execute = args.includes("--execute");
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: tsx scripts/seed-migration-history.ts [--execute]");
    console.log("  default: dry-run — connect, check, print plan, write nothing.");
    console.log("  --execute: insert tracking rows for fully-present migrations.");
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL must be set.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const plan = await buildPlan(pool);
    let seeded = 0;
    let pending = 0;
    for (const item of plan) {
      const label = `${item.entry.tag} (idx ${item.entry.idx})`;
      if (item.alreadyRecorded) {
        console.log(`RECORDED ${label} — tracking row exists, migrate will skip`);
      } else if (item.missing.length > 0) {
        pending += 1;
        console.log(`PENDING  ${label} — missing: ${item.missing.join(", ")}`);
      } else if (execute) {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
        await pool.query(
          `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
             id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
           )`,
        );
        await pool.query(`INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)`, [
          item.hash,
          item.entry.when,
        ]);
        seeded += 1;
        console.log(`SEEDED   ${label} — inserted tracking row`);
      } else {
        console.log(`WOULD-SEED ${label} — all objects present (re-run with --execute)`);
      }
    }
    console.log(
      execute
        ? `Done: ${seeded} seeded, ${pending} left pending for db:migrate.`
        : `Dry-run: ${plan.filter((p) => p.willSeed).length} would seed, ${pending} pending. Nothing written.`,
    );
    if (!execute && pending > 0) {
      console.log("Next: run `npm run db:migrate` to apply pending entries (all are idempotent).");
    }
  } finally {
    await pool.end();
  }
}

const invokedAsCli = (() => {
  try {
    return !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedAsCli) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error("seed-migration-history failed:", err);
    process.exit(1);
  });
}
