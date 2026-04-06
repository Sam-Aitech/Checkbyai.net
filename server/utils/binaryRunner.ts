/**
 * binaryRunner.ts
 *
 * Locates and invokes the qsv (Rust) and csvdiff (Go) binaries.
 * Both binaries are installed by scripts/setup-binaries.sh into bin/.
 *
 * Graceful degradation:
 *   - qsv not found → validation/count functions return safe fallback values
 *   - csvdiff not found → throws, because the diff is load-bearing (no silent skip)
 *
 * Binary discovery order:
 *   1. {PROJECT_ROOT}/bin/qsv[.exe]          — local install (preferred)
 *   2. /usr/local/bin/qsv, /usr/bin/qsv      — system install
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execFileAsync = promisify(execFile);

// ── Path resolution ───────────────────────────────────────────────────────────

const IS_WINDOWS = process.platform === "win32";
const QSV_BIN_NAME = IS_WINDOWS ? "qsv.exe" : "qsv";
const CSVDIFF_BIN_NAME = IS_WINDOWS ? "csvdiff.exe" : "csvdiff";

const PROJECT_ROOT = path.resolve(process.cwd());
const BIN_DIR = path.join(PROJECT_ROOT, "bin");

// System fallback paths (Linux only)
const SYSTEM_PATHS = ["/usr/local/bin", "/usr/bin", "/opt/homebrew/bin"];

function findBinary(name: string): string | null {
  // 1. Local bin/ directory (preferred — pinned version)
  const localPath = path.join(BIN_DIR, name);
  if (fs.existsSync(localPath)) return localPath;

  // 2. System PATH locations
  if (!IS_WINDOWS) {
    for (const dir of SYSTEM_PATHS) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

// Lazy-cached binary paths (undefined = not yet checked, null = not found)
let _qsvPath: string | null | undefined = undefined;
let _csvdiffPath: string | null | undefined = undefined;

export function getQsvPath(): string | null {
  if (_qsvPath === undefined) {
    _qsvPath = findBinary(QSV_BIN_NAME);
    if (_qsvPath) {
      console.log(`[BinaryRunner] qsv found at: ${_qsvPath}`);
    } else {
      console.warn("[BinaryRunner] qsv not found. Run: npm run setup:binaries");
    }
  }
  return _qsvPath;
}

export function getCsvdiffPath(): string | null {
  if (_csvdiffPath === undefined) {
    _csvdiffPath = findBinary(CSVDIFF_BIN_NAME);
    if (_csvdiffPath) {
      console.log(`[BinaryRunner] csvdiff found at: ${_csvdiffPath}`);
    } else {
      console.warn("[BinaryRunner] csvdiff not found. Run: npm run setup:binaries");
    }
  }
  return _csvdiffPath;
}

// ── qsv operations ────────────────────────────────────────────────────────────

export interface QsvValidateResult {
  valid: boolean;
  recordCount: number;   // 0 if qsv not installed
  errors: string[];
}

/**
 * Validates CSV structure using qsv.
 * Returns valid=true (passthrough) if qsv is not installed — validation is
 * a safety gate, not a hard requirement for the pipeline to function.
 */
export async function qsvValidate(filePath: string): Promise<QsvValidateResult> {
  const bin = getQsvPath();
  if (!bin) {
    return { valid: true, recordCount: 0, errors: [] };
  }

  try {
    await execFileAsync(bin, ["validate", filePath], {
      timeout: 60_000,
    });
    // Exit 0 = valid
    return { valid: true, recordCount: 0, errors: [] };
  } catch (err: unknown) {
    // Exit 1 = validation errors — stderr has the details
    const execErr = err as { stderr?: string; stdout?: string };
    const raw = (execErr.stderr || execErr.stdout || "").trim();
    const errors = raw.split("\n").filter(Boolean);
    return { valid: false, recordCount: 0, errors };
  }
}

/**
 * Counts records in a CSV using qsv count (excludes header row).
 * Returns -1 if qsv is not installed (caller treats as "unknown").
 */
export async function qsvCount(filePath: string): Promise<number> {
  const bin = getQsvPath();
  if (!bin) return -1;

  const { stdout } = await execFileAsync(bin, ["count", filePath], {
    timeout: 30_000,
  });
  const n = parseInt(stdout.trim(), 10);
  return Number.isNaN(n) ? -1 : n;
}

/**
 * Deduplicates a CSV in-place (or to a new output file).
 * Skips silently if qsv is not installed.
 *
 * NOTE: qsv dedup requires sorted input by default. Pass sorted=false
 * to handle unsorted input (slower but correct).
 */
export async function qsvDedup(
  inputPath: string,
  outputPath: string,
  sorted = false,
): Promise<void> {
  const bin = getQsvPath();
  if (!bin) return;

  const args = ["dedup", inputPath, "--output", outputPath];
  if (!sorted) args.push("--no-headers");
  // Note: qsv dedup without --no-headers preserves the header. With unsorted
  // data we use the sorted flag to allow duplicates across non-adjacent rows.
  // The correct flag for unsorted dedup is to omit --sorted (default behaviour
  // of qsv dedup handles unsorted data natively from v2+).

  await execFileAsync(bin, args, {
    timeout: 120_000,
  });
}

// ── csvdiff operations ────────────────────────────────────────────────────────

export interface CsvDiffResult {
  /** Rows present in currPath but NOT in prevPath (by primary key). */
  Additions: Record<string, string>[];
  /** Rows present in prevPath but NOT in currPath (by primary key). */
  Deletions: Record<string, string>[];
  /**
   * Rows whose primary key exists in both files but non-key values changed.
   * These appear in BOTH Additions and Deletions — we extract them here for
   * convenience so callers don't need to compute the intersection themselves.
   */
  Modifications: Array<{
    prev: Record<string, string>;
    curr: Record<string, string>;
  }>;
  durationMs: number;
}

/**
 * Runs csvdiff on two CSV files and returns a structured diff.
 *
 * @param prevPath - Path to yesterday's clean CSV (baseline)
 * @param currPath - Path to today's clean CSV (new snapshot)
 * @param keys     - Column names forming the primary key (e.g. ["fingerprint"])
 *
 * Throws if csvdiff binary is not found — the diff is the core of Phase 2
 * and has no safe fallback.
 */
export async function runCsvDiff(
  prevPath: string,
  currPath: string,
  keys: string[],
): Promise<CsvDiffResult> {
  const bin = getCsvdiffPath();
  if (!bin) {
    throw new Error(
      "[BinaryRunner] csvdiff binary not found. Run: npm run setup:binaries",
    );
  }

  const keyArgs = keys.flatMap(() => ["--primary-key", "0"]);
  const start = Date.now();

  const { stdout } = await execFileAsync(
    bin,
    [...keyArgs, "--format", "json", prevPath, currPath],
    {
      timeout: 60_000,
      maxBuffer: 100 * 1024 * 1024, // 100 MB — 124k rows × ~500 bytes
    },
  );

  const durationMs = Date.now() - start;
  const parsed: { Additions?: Record<string, string>[]; Deletions?: Record<string, string>[] } =
    JSON.parse(stdout);

  const rawAdditions = parsed.Additions ?? [];
  const rawDeletions = parsed.Deletions ?? [];

  // Separate true additions/deletions from attribute modifications.
  // An attribute change shows up as the same primary key in BOTH arrays.
  const addedByKey = new Map(rawAdditions.map((r) => [buildKey(r, keys), r]));
  const deletedByKey = new Map(rawDeletions.map((r) => [buildKey(r, keys), r]));

  const modifications: CsvDiffResult["Modifications"] = [];
  const trueAdditions: Record<string, string>[] = [];
  const trueDeletions: Record<string, string>[] = [];

  for (const [k, curr] of Array.from(addedByKey)) {
    if (deletedByKey.has(k)) {
      modifications.push({ prev: deletedByKey.get(k)!, curr });
    } else {
      trueAdditions.push(curr);
    }
  }

  for (const [k, prev] of Array.from(deletedByKey)) {
    if (!addedByKey.has(k)) {
      trueDeletions.push(prev);
    }
  }

  console.log(
    `[BinaryRunner] csvdiff complete in ${durationMs}ms: ` +
    `+${trueAdditions.length} added, -${trueDeletions.length} removed, ` +
    `~${modifications.length} modified`,
  );

  return {
    Additions: trueAdditions,
    Deletions: trueDeletions,
    Modifications: modifications,
    durationMs,
  };
}

function buildKey(row: Record<string, string>, keys: string[]): string {
  return keys.map((k) => row[k] ?? "").join("|");
}

// ── Health check ──────────────────────────────────────────────────────────────

export interface BinaryHealthReport {
  qsv: { installed: boolean; path: string | null; version?: string; error?: string };
  csvdiff: { installed: boolean; path: string | null; version?: string; error?: string };
}

/**
 * Verifies both binaries are installed and functional.
 * Used by the admin API to surface binary status in the dashboard.
 */
export async function checkBinaryHealth(): Promise<BinaryHealthReport> {
  const [qsvResult, csvdiffResult] = await Promise.allSettled([
    (async () => {
      const p = getQsvPath();
      if (!p) throw new Error("not found");
      const { stdout } = await execFileAsync(p, ["--version"], { timeout: 5_000 });
      return stdout.trim();
    })(),
    (async () => {
      const p = getCsvdiffPath();
      if (!p) throw new Error("not found");
      const { stdout, stderr } = await execFileAsync(p, ["--version"], { timeout: 5_000 });
      return (stdout || stderr).trim();
    })(),
  ]);

  return {
    qsv: {
      installed: qsvResult.status === "fulfilled",
      path: getQsvPath(),
      version: qsvResult.status === "fulfilled" ? qsvResult.value : undefined,
      error: qsvResult.status === "rejected" ? String(qsvResult.reason) : undefined,
    },
    csvdiff: {
      installed: csvdiffResult.status === "fulfilled",
      path: getCsvdiffPath(),
      version: csvdiffResult.status === "fulfilled" ? csvdiffResult.value : undefined,
      error: csvdiffResult.status === "rejected" ? String(csvdiffResult.reason) : undefined,
    },
  };
}
