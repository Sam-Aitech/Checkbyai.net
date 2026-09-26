/**
 * Cutover safety net for `npm run db:migrate` (no DB required):
 *  1. Our seed-script hashes must be byte-identical to drizzle-orm's own
 *     `readMigrationFiles` (else migrate would re-apply seeded entries).
 *  2. Every object a journaled migration creates must be covered by the
 *     seed script's CHECKS (else prod could be marked applied while
 *     missing objects).
 *  3. No journaled migration may use CONCURRENTLY (migrate runs inside one
 *     transaction — PG rejects it outright) or the non-existent
 *     `ADD COLUMN/CONSTRAINT IF NOT EXISTS` syntax.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  CHECKS,
  MIGRATIONS_DIR,
  computeMigrationHash,
  readJournalEntries,
  type ExistenceCheck,
} from "../scripts/seed-migration-history";

const entries = readJournalEntries();
const sqlOf = (tag: string) => readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), "utf-8");

/** Executable SQL only: journaled files use `--` line comments, never `--` inside strings. */
const codeOf = (tag: string) =>
  sqlOf(tag)
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

function tablesIn(sql: string): string[] {
  return [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"/g)].map((m) => m[1]);
}
function indexesIn(sql: string): string[] {
  return [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"(\w+)"/g)].map((m) => m[1]);
}
function columnsIn(sql: string): Array<[string, string]> {
  return [...sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/g)].map((m) => [m[1], m[2]]);
}
function constraintsIn(sql: string): string[] {
  return [...sql.matchAll(/ADD CONSTRAINT "(\w+)"/g)].map((m) => m[1]);
}
function extensionsIn(sql: string): string[] {
  return [...sql.matchAll(/CREATE EXTENSION IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
}

function covered(tag: string): ExistenceCheck[] {
  const checks = CHECKS[tag];
  expect(checks, `CHECKS entry missing for journal tag ${tag}`).toBeDefined();
  return checks ?? [];
}
const hasTable = (checks: ExistenceCheck[], name: string) =>
  checks.some((c) => c.kind === "table" && c.name === name);
const hasTableAbsent = (checks: ExistenceCheck[], name: string) =>
  checks.some((c) => c.kind === "tableAbsent" && c.name === name);
const hasColumn = (checks: ExistenceCheck[], table: string, column: string) =>
  checks.some((c) => c.kind === "column" && c.table === table && c.column === column);
const hasIndex = (checks: ExistenceCheck[], name: string) =>
  checks.some((c) => c.kind === "index" && c.name === name);
const hasFk = (checks: ExistenceCheck[], name: string) => checks.some((c) => c.kind === "fk" && c.name === name);
const hasConstraint = (checks: ExistenceCheck[], name: string) =>
  checks.some((c) => (c.kind === "fk" || c.kind === "constraint") && c.name === name);
const hasExtension = (checks: ExistenceCheck[], name: string) =>
  checks.some((c) => c.kind === "extension" && c.name === name);

describe("seed-migration-history hash compatibility", () => {
  const theirs = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR });

  it.each(entries.map((e) => [e.tag, e.when]))("hash(%s) matches drizzle-orm", (tag, when) => {
    const mine = computeMigrationHash(tag as string);
    const match = theirs.find((m) => m.folderMillis === when);
    expect(match, `drizzle-orm has no entry with folderMillis ${when}`).toBeDefined();
    expect(mine).toBe(match?.hash);
  });
});

describe("CHECKS coverage", () => {
  it("0000 covers all tables, constraints and indexes", () => {
    const tag = "0000_minor_wolf_cub";
    const sql = sqlOf(tag);
    const checks = covered(tag);
    for (const t of tablesIn(sql)) expect(hasTable(checks, t)).toBe(true);
    for (const c of constraintsIn(sql)) expect(hasConstraint(checks, c)).toBe(true);
    for (const i of indexesIn(sql)) expect(hasIndex(checks, i)).toBe(true);
  });

  it("0024 covers all tables (except sponsor_list, owned by 0030) and added columns", () => {
    const tag = "0024_catchup";
    const sql = sqlOf(tag);
    const checks = covered(tag);
    for (const t of tablesIn(sql)) {
      if (t === "sponsor_list") continue;
      expect(hasTable(checks, t)).toBe(true);
    }
    for (const [table, column] of columnsIn(sql)) expect(hasColumn(checks, table, column)).toBe(true);
    for (const c of constraintsIn(sql)) expect(hasConstraint(checks, c)).toBe(true);
    // Indexes deliberately unchecked for 0024 — see CHECKS comment.
  });

  it("0025 covers table, fks and indexes", () => {
    const tag = "0025_verification_audit_log";
    const checks = covered(tag);
    expect(hasTable(checks, "verification_audit_log")).toBe(true);
    for (const c of constraintsIn(sqlOf(tag))) expect(hasConstraint(checks, c)).toBe(true);
    for (const i of indexesIn(sqlOf(tag))) expect(hasIndex(checks, i)).toBe(true);
  });

  it("0026 covers its index", () => {
    const checks = covered("0026_verification_document_hash_index");
    expect(hasIndex(checks, "idx_verification_document_hash")).toBe(true);
  });

  it("0027 covers extension and all indexes", () => {
    const tag = "0027_trgm_perf_indexes";
    const sql = sqlOf(tag);
    const checks = covered(tag);
    for (const e of extensionsIn(sql)) expect(hasExtension(checks, e)).toBe(true);
    for (const i of indexesIn(sql)) expect(hasIndex(checks, i)).toBe(true);
  });

  it("0028 covers its index", () => {
    expect(hasIndex(covered("0028_notif_idempotency"), "idx_notif_log_idem")).toBe(true);
  });

  it("0029 covers table, fk and index", () => {
    const tag = "0029_pdf_verify_uploads";
    const checks = covered(tag);
    expect(hasTable(checks, "pdf_verify_uploads")).toBe(true);
    for (const c of constraintsIn(sqlOf(tag))) expect(hasConstraint(checks, c)).toBe(true);
    for (const i of indexesIn(sqlOf(tag))) expect(hasIndex(checks, i)).toBe(true);
  });

  it("0030 asserts sponsor_list absence", () => {
    const tag = "0030_drop_sponsor_list";
    expect(sqlOf(tag)).toMatch(/DROP TABLE IF EXISTS "sponsor_list"/);
    expect(hasTableAbsent(covered(tag), "sponsor_list")).toBe(true);
  });
});

describe("migrate-in-transaction safety", () => {
  it.each(entries.map((e) => e.tag))("%s uses no CONCURRENTLY", (tag) => {
    expect(codeOf(tag)).not.toMatch(/CONCURRENTLY/);
  });

  it.each(entries.map((e) => e.tag))("%s uses no ADD ... IF NOT EXISTS", (tag) => {
    // PostgreSQL has no such syntax — it is a hard syntax error, not a no-op.
    expect(codeOf(tag)).not.toMatch(/ADD\s+(?:COLUMN\s+)?IF NOT EXISTS/);
    expect(codeOf(tag)).not.toMatch(/ADD\s+CONSTRAINT\s+IF NOT EXISTS/);
  });

  it.each(entries.map((e) => e.tag))("%s file exists for journal tag", (tag) => {
    expect(() => sqlOf(tag)).not.toThrow();
  });
});

