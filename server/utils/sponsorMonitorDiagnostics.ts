/**
 * sponsorMonitorDiagnostics.ts
 *
 * Aggregated health checks for the sponsor monitor ETL pipeline.
 *
 * Used by:
 *   - GET  /api/admin/sponsor-monitor/diagnostics  (admin dashboard view)
 *   - POST /api/admin/sponsor-monitor/force-unlock   (zombie lock termination)
 *
 * Why a single utility file: the diagnostics endpoint must answer
 * "WHY is no sponsor change visible on the frontend?" — which requires
 * inspecting every layer of the pipeline in one shot (cron, lock, binary,
 * CSV, state machine, cache, redis, python backend, queue).
 *
 * Every check is wrapped in safeCall() so a single failing component
 * never causes the entire endpoint to 500 — degraded reporting is more
 * useful to the operator than a hard failure.
 */

import { sql, desc, eq, gte, count, and, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  monitorJobRuns,
  csvArchive,
  sponsorChanges,
  sponsorCanonical,
  dailyDigest,
} from "@shared/schema";
import { checkBinaryHealth, type BinaryHealthReport } from "./binaryRunner";
import { isJobRunning, isWeekday, SPONSOR_MONITOR_LOCK_KEY } from "./sponsorMonitorJob";
import { isExpectedPublishDay } from "./ukBankHolidays";
import { getCutoverStatusSnapshot, type CutoverStatus } from "./scheduler";
import { getRedis } from "./redisClient";
import { getIndexHealth } from "./sponsorSearch";
import { isQueueAvailable } from "../services/jobQueue";
import { logger } from "./logger";

const log = logger.child({ module: "SponsorMonitorDiagnostics" });

// ── Types ────────────────────────────────────────────────────────────────────

export type CheckLevel = "ok" | "warn" | "fail" | "unknown";

export interface CheckResult<T = unknown> {
  level: CheckLevel;
  ok: boolean;
  value: T | null;
  error?: string;
}

export interface LockHolderInfo {
  pid: number;
  state: string | null;
  idleSeconds: number | null;
  query: string | null;
  applicationName: string | null;
}

export interface ForceUnlockReport {
  holder: LockHolderInfo | null;
  zombieTerminated: boolean;
  reason:
    | "no_lock_held"
    | "zombie_terminated_idle"
    | "zombie_terminated_too_long"
    | "active_cleared"
    | "terminated_by_query";
  message: string;
}

// ── safeCall wrapper ─────────────────────────────────────────────────────────

/**
 * Runs an async check and converts any thrown error into a CheckResult
 * with level="fail". Never re-throws — the diagnostics endpoint must
 * always return a useful response even when individual components fail.
 */
async function safeCall<T>(label: string, fn: () => Promise<T>): Promise<CheckResult<T>> {
  try {
    const value = await fn();
    return { level: "ok", ok: true, value };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ label, err: msg }, "Diagnostics check failed");
    return { level: "fail", ok: false, value: null, error: msg };
  }
}

// ── Individual checks ────────────────────────────────────────────────────────

/**
 * Who owns the cron? Inline cron claims ownership if
 * CUTOVER_SPONSOR_MONITOR is not "true"/"1". Central scheduler owns it
 * otherwise. The diagnostic warns if neither is registered (e.g. when
 * the central scheduler disabled itself or the inline cron was skipped).
 */
export async function checkCronOwnership(): Promise<CheckResult<{
  owner: string;
  cutoverEnabled: boolean;
  reason?: string;
  schedule?: string;
}>> {
  return safeCall("cronOwnership", async () => {
    const cutoverValue = (process.env.CUTOVER_SPONSOR_MONITOR ?? "false").trim().toLowerCase();
    const cutoverEnabled = cutoverValue === "true" || cutoverValue === "1";

    const allSchedules: CutoverStatus[] = getCutoverStatusSnapshot();
    const sponsorSchedule = allSchedules.find((s) => s.job === "SPONSOR_MONITOR");

    if (!sponsorSchedule) {
      return {
        level: "fail" as CheckLevel,
        owner: "unknown",
        cutoverEnabled,
        reason: "SPONSOR_MONITOR not registered in scheduler",
      };
    }

    return {
      level: "ok" as CheckLevel,
      owner: sponsorSchedule.owner,
      schedule: sponsorSchedule.schedule,
      cutoverEnabled,
    };
  });
}

/**
 * Advisory lock state — who holds the sponsor monitor lock, how long
 * has their connection been idle, what query is running?
 *
 * This is THE most common failure mode: a zombie connection holding
 * the lock from a crashed run will block all subsequent runs forever.
 */
export async function checkAdvisoryLock(): Promise<CheckResult<{
  locked: boolean;
  holder: LockHolderInfo | null;
}>> {
  return safeCall("advisoryLock", async () => {
    const result = await db.execute(sql`
      SELECT pl.pid,
             pa.state,
             EXTRACT(EPOCH FROM (now() - pa.state_change))::int AS "idleSeconds",
             pa.query,
             pa.application_name AS "applicationName",
             pa.usename,
             EXTRACT(EPOCH FROM (now() - pa.xact_start))::int AS "xactAgeSeconds"
      FROM   pg_locks pl
      LEFT JOIN pg_stat_activity pa ON pa.pid = pl.pid
      WHERE  pl.locktype = 'advisory'
        AND  pl.classid  = (${SPONSOR_MONITOR_LOCK_KEY}::bigint >> 32)::int
        AND  pl.objid    = (${SPONSOR_MONITOR_LOCK_KEY}::bigint & x'ffffffff'::bigint)::int
        AND  pl.granted  = true
      LIMIT  1
    `);

    const row = result.rows[0] as unknown as
      | (LockHolderInfo & { xactAgeSeconds: number; usename: string | null })
      | undefined;

    if (!row) {
      return { locked: false, holder: null };
    }

    const holder: LockHolderInfo = {
      pid: row.pid,
      state: row.state ?? null,
      idleSeconds: row.idleSeconds ?? null,
      query: row.query ?? null,
      applicationName: row.applicationName ?? null,
    };

    return { locked: true, holder };
  });
}

/**
 * Last 7 monitor job runs from monitorJobRuns table.
 * Surfaces failure patterns, durations, and any stuck "running" entries.
 */
export async function checkRecentRuns(): Promise<CheckResult<{
  runs: Array<typeof monitorJobRuns.$inferSelect>;
  lastSuccess: {
    runDate: string;
    completedAt: Date | null;
    changesDetected: number;
    hoursAgo: number | null;
  } | null;
  stuckRunning: {
    runDate: string;
    startedAt: Date | null;
    hoursRunning: number;
  } | null;
}>> {
  return safeCall("recentRuns", async () => {
    const rows = await db
      .select()
      .from(monitorJobRuns)
      .orderBy(desc(monitorJobRuns.startedAt))
      .limit(7);

    const now = Date.now();
    const lastSuccess = rows.find((r) => r.status === "success");
    const lastSuccessHoursAgo = lastSuccess?.completedAt
      ? Math.floor((now - new Date(lastSuccess.completedAt).getTime()) / (1000 * 60 * 60))
      : null;

    const stuckRunning = rows.find(
      (r) => r.status === "running" && r.startedAt && now - new Date(r.startedAt).getTime() > 2 * 60 * 60 * 1000,
    );

    return {
      runs: rows,
      lastSuccess: lastSuccess
        ? {
            runDate: lastSuccess.runDate,
            completedAt: lastSuccess.completedAt,
            changesDetected: lastSuccess.changesDetected ?? 0,
            hoursAgo: lastSuccessHoursAgo,
          }
        : null,
      stuckRunning: stuckRunning
        ? {
            runDate: stuckRunning.runDate,
            startedAt: stuckRunning.startedAt,
            hoursRunning: Math.floor(
              (now - new Date(stuckRunning.startedAt!).getTime()) / (1000 * 60 * 60),
            ),
          }
        : null,
    };
  });
}

/**
 * ETL integrity — count of archives stuck at PENDING_SYNC (downloaded
 * but state machine never ran) or FAILED (state machine errored).
 * Any count > 0 means operator intervention is required.
 */
export async function checkArchiveIntegrity(): Promise<CheckResult<{
  pendingSyncCount: number;
  failedCount: number;
  invalidCount: number;
  latestArchive: {
    snapshotDate: string;
    recordCount: number | null;
    syncStatus: string | null;
    isValid: boolean | null;
    downloadedAt: Date | null;
  } | null;
  daysSinceLatest: number | null;
}>> {
  return safeCall("archiveIntegrity", async () => {
    const [pendingRow] = await db
      .select({ value: count() })
      .from(csvArchive)
      .where(eq(csvArchive.syncStatus, "PENDING_SYNC"));

    const [failedRow] = await db
      .select({ value: count() })
      .from(csvArchive)
      .where(eq(csvArchive.syncStatus, "FAILED"));

    const [invalidRow] = await db
      .select({ value: count() })
      .from(csvArchive)
      .where(eq(csvArchive.isValid, false));

    const latestArchive = await db
      .select({
        snapshotDate: csvArchive.snapshotDate,
        recordCount: csvArchive.recordCount,
        syncStatus: csvArchive.syncStatus,
        isValid: csvArchive.isValid,
        downloadedAt: csvArchive.downloadedAt,
      })
      .from(csvArchive)
      .orderBy(desc(csvArchive.snapshotDate))
      .limit(1);

    const latest = latestArchive[0] ?? null;
    const daysSinceLatest = latest?.snapshotDate
      ? Math.floor(
          (Date.now() - new Date(latest.snapshotDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      pendingSyncCount: pendingRow?.value ?? 0,
      failedCount: failedRow?.value ?? 0,
      invalidCount: invalidRow?.value ?? 0,
      latestArchive: latest,
      daysSinceLatest,
    };
  });
}

/**
 * Data freshness — total change events in last 7 and 30 days, plus
 * "today's" change count. A period of zero changes with a successful
 * job is plausible (no Home Office updates), but a period of zero
 * changes with a stale job is the smoking gun.
 */
export async function checkChangeProduction(): Promise<CheckResult<{
  changesLast7Days: number;
  changesLast30Days: number;
  changesToday: number;
  canonicalRecordCount: number;
  nullRemovedAtCount: number;
  strandedGracePeriodCount: number;
}>> {
  return safeCall("changeProduction", async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const today = new Date().toISOString().split("T")[0];

    const [last7] = await db
      .select({ value: count() })
      .from(sponsorChanges)
      .where(gte(sponsorChanges.detectedAt, sevenDaysAgo));

    const [last30] = await db
      .select({ value: count() })
      .from(sponsorChanges)
      .where(gte(sponsorChanges.detectedAt, thirtyDaysAgo));

    const [todayCount] = await db
      .select({ value: count() })
      .from(sponsorChanges)
      .where(eq(sponsorChanges.snapshotDate, today));

    const [canonicalRow] = await db
      .select({ value: count() })
      .from(sponsorCanonical);

    const [nullRemovedAtRow] = await db
      .select({ value: count() })
      .from(sponsorCanonical)
      .where(and(eq(sponsorCanonical.status, "REMOVED_REVOKED"), isNull(sponsorCanonical.removedAt)));

    const [strandedGracePeriodRow] = await db
      .select({ value: count() })
      .from(sponsorCanonical)
      .where(and(eq(sponsorCanonical.status, "GRACE_PERIOD"), gte(sponsorCanonical.consecutiveMisses, 2)));

    return {
      changesLast7Days: last7?.value ?? 0,
      changesLast30Days: last30?.value ?? 0,
      changesToday: todayCount?.value ?? 0,
      canonicalRecordCount: canonicalRow?.value ?? 0,
      nullRemovedAtCount: nullRemovedAtRow?.value ?? 0,
      strandedGracePeriodCount: strandedGracePeriodRow?.value ?? 0,
    };
  });
}

/**
 * Digest health — how many rows have displayedOnLanding=true, what is
 * the latest digest's staleness, and whether there's a mismatch between
 * changes and display status (data hidden from homepage).
 */
export async function checkDigestHealth(): Promise<CheckResult<{
  displayedOnLandingCount: number;
  latestDigestDate: string | null;
  latestDigestDaysAgo: number | null;
  latestDigestHasChanges: boolean;
  latestDigestDisplayed: boolean;
  mismatch: boolean;  // true if hasChanges but !displayedOnLanding
  digestCount: number;
}>> {
  return safeCall("digestHealth", async () => {
    const [landingCount] = await db
      .select({ value: count() })
      .from(dailyDigest)
      .where(eq(dailyDigest.displayedOnLanding, true));

    const latest = await db
      .select({
        snapshotDate: dailyDigest.snapshotDate,
        addedCount: dailyDigest.addedCount,
        updatedCount: dailyDigest.updatedCount,
        removedCount: dailyDigest.removedCount,
        displayedOnLanding: dailyDigest.displayedOnLanding,
      })
      .from(dailyDigest)
      .orderBy(desc(dailyDigest.snapshotDate))
      .limit(1);

    const [totalCount] = await db
      .select({ value: count() })
      .from(dailyDigest);

    const latestDigest = latest[0] ?? null;
    const latestDigestDaysAgo = latestDigest?.snapshotDate
      ? Math.floor(
          (Date.now() - new Date(latestDigest.snapshotDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    const hasChanges = latestDigest
      ? (latestDigest.addedCount ?? 0) > 0 ||
        (latestDigest.updatedCount ?? 0) > 0 ||
        (latestDigest.removedCount ?? 0) > 0
      : false;

    return {
      displayedOnLandingCount: landingCount?.value ?? 0,
      latestDigestDate: latestDigest?.snapshotDate ?? null,
      latestDigestDaysAgo,
      latestDigestHasChanges: hasChanges,
      latestDigestDisplayed: latestDigest?.displayedOnLanding ?? false,
      mismatch: hasChanges && !(latestDigest?.displayedOnLanding ?? false),
      digestCount: totalCount?.value ?? 0,
    };
  });
}

/**
 * Redis cache health — is the client connected, how many keys in our
 * Redis cache health — is the client connected, how many keys in our
 * sponsor-related namespaces, ping latency.
 */
export async function checkRedisHealth(): Promise<CheckResult<{
  connected: boolean;
  pingLatencyMs?: number;
  watchesCacheKeys?: number;
  sponsorsCacheKeys?: number;
  rateLimitKeys?: number;
  changesCacheTtlSeconds?: number | null;
  searchIndexTtlSeconds?: number | null;
  error?: string;
}>> {
  return safeCall("redisHealth", async () => {
    const client = getRedis();
    if (!client) {
      return { connected: false, error: "Redis client not initialized (degraded mode)" };
    }

    const pingStart = Date.now();
    const pingResult = await client.ping().catch((err: unknown) => {
      throw new Error(err instanceof Error ? err.message : String(err));
    });
    const pingLatencyMs = Date.now() - pingStart;

    let watchesKeys = 0;
    let sponsorsKeys = 0;
    let rlKeys = 0;
    try {
      const watchesScan = await scanCount(client, "watches:*");
      const sponsorsScan = await scanCount(client, "sponsors:*");
      const rlScan = await scanCount(client, "rl:*");
      watchesKeys = watchesScan;
      sponsorsKeys = sponsorsScan;
      rlKeys = rlScan;
    } catch (scanErr: unknown) {
      log.warn({ err: scanErr }, "Redis SCAN failed (non-fatal)");
    }

    // Per-key freshness: TTL for the main sponsor cache keys
    let changesKeyTtl: number | null = null;
    let searchKeyTtl: number | null = null;
    try {
      changesKeyTtl = await client.ttl("sponsors:changes");
      searchKeyTtl = await client.ttl("sponsors:search");
    } catch (ttlErr: unknown) {
      log.warn({ err: ttlErr }, "Redis TTL check failed (non-fatal)");
    }

    return {
      connected: pingResult === "PONG",
      pingLatencyMs,
      watchesCacheKeys: watchesKeys,
      sponsorsCacheKeys: sponsorsKeys,
      rateLimitKeys: rlKeys,
      changesCacheTtlSeconds: changesKeyTtl,
      searchIndexTtlSeconds: searchKeyTtl,
    };
  });
}

async function scanCount(client: ReturnType<typeof getRedis>, pattern: string): Promise<number> {
  if (!client) return 0;
  let cursor = "0";
  let total = 0;
  do {
    const [next, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    total += keys.length;
  } while (cursor !== "0");
  return total;
}

/**
 * Python ETL sidecar health — hits the /health endpoint exposed by
 * backend/main.py (the FastAPI service). 2s timeout.
 */
export async function checkPythonBackend(): Promise<CheckResult<{
  online: boolean;
  url: string;
  status?: number;
  reason?: string;
  body?: unknown;
}>> {
  return safeCall("pythonBackend", async () => {
    const url = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      if (!res.ok) {
        return {
          online: false,
          url,
          status: res.status,
          reason: `Non-OK status ${res.status}`,
        };
      }
      const body: unknown = await res.json().catch(() => ({}));
      return {
        online: true,
        url,
        status: res.status,
        body,
      };
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * Binary health (qsv + csvdiff) — wrapped in a level classification.
 * csvdiff missing is a hard fail (the diff phase is load-bearing).
 * qsv missing is a warn (graceful degradation still allows the job
 * to run, just without the count guard).
 */
export async function checkBinaries(): Promise<
  CheckResult<BinaryHealthReport & { level: CheckLevel }>
> {
  return safeCall("binaries", async () => {
    const health = await checkBinaryHealth();
    let level: CheckLevel = "ok";
    if (!health.csvdiff.installed) level = "fail";
    else if (!health.qsv.installed) level = "warn";
    return { ...health, level };
  });
}

/**
 * BullMQ / job queue availability.
 */
export async function checkQueueHealth(): Promise<CheckResult<{
  available: boolean;
  redisConnected: boolean;
}>> {
  return safeCall("queueHealth", async () => {
    return {
      available: isQueueAvailable(),
      redisConnected: getRedis() !== null,
    };
  });
}

/**
 * In-memory Fuse.js search index health — is it ready, how many
 * records does it hold, when was it last built, and is a rebuild
 * currently in progress?
 */
export async function checkSearchIndexHealth(): Promise<CheckResult<{
  ready: boolean;
  recordCount: number;
  lastBuilt: string | null;
  buildInProgress: boolean;
  dbConnected: boolean;
}>> {
  return safeCall("searchIndexHealth", async () => {
    return getIndexHealth();
  });
}

// ── Aggregator ───────────────────────────────────────────────────────────────

export interface DiagnosticsReport {
  timestamp: string;
  overall: CheckLevel;
  jobRunning: boolean;
  cron: CheckResult<{
    owner: string;
    cutoverEnabled: boolean;
    reason?: string;
    schedule?: string;
  }>;
  lock: CheckResult<{ locked: boolean; holder: LockHolderInfo | null }>;
  recentRuns: CheckResult<{
    runs: Array<typeof monitorJobRuns.$inferSelect>;
    lastSuccess: {
      runDate: string;
      completedAt: Date | null;
      changesDetected: number;
      hoursAgo: number | null;
    } | null;
    stuckRunning: {
      runDate: string;
      startedAt: Date | null;
      hoursRunning: number;
    } | null;
  }>;
  archiveIntegrity: CheckResult<{
    pendingSyncCount: number;
    failedCount: number;
    invalidCount: number;
    latestArchive: {
      snapshotDate: string;
      recordCount: number | null;
      syncStatus: string | null;
      isValid: boolean | null;
      downloadedAt: Date | null;
    } | null;
    daysSinceLatest: number | null;
  }>;
  changeProduction: CheckResult<{
    changesLast7Days: number;
    changesLast30Days: number;
    changesToday: number;
    canonicalRecordCount: number;
    nullRemovedAtCount: number;
    strandedGracePeriodCount: number;
  }>;
  binaries: CheckResult<BinaryHealthReport & { level: CheckLevel }>;
  redis: CheckResult<{
    connected: boolean;
    pingLatencyMs?: number;
    watchesCacheKeys?: number;
    sponsorsCacheKeys?: number;
    rateLimitKeys?: number;
    changesCacheTtlSeconds?: number | null;
    searchIndexTtlSeconds?: number | null;
    error?: string;
  }>;
  pythonBackend: CheckResult<{
    online: boolean;
    url: string;
    status?: number;
    reason?: string;
    body?: unknown;
  }>;
  queue: CheckResult<{
    available: boolean;
    redisConnected: boolean;
  }>;
  digest: CheckResult<{
    displayedOnLandingCount: number;
    latestDigestDate: string | null;
    latestDigestDaysAgo: number | null;
    latestDigestHasChanges: boolean;
    latestDigestDisplayed: boolean;
    mismatch: boolean;
    digestCount: number;
  }>;
  searchIndex: CheckResult<{
    ready: boolean;
    recordCount: number;
    lastBuilt: string | null;
    buildInProgress: boolean;
    dbConnected: boolean;
  }>;
  weekdayExpectedRun: boolean;
  nextExpectedRunUtc: string | null;
  recommendations: string[];
}

/**
 * Computes the next expected sponsor monitor run in UTC.
 * Cron: "30 0 * * 1-5" → weekdays at 00:30 UTC.
 */
function computeNextExpectedRunUtc(now: Date = new Date()): string | null {
  if (!isWeekday() && now.getUTCDay() !== 0 && now.getUTCDay() !== 6) return null;
  // Walk forward up to 7 days, looking for a weekday 00:30 UTC
  for (let i = 0; i < 7; i++) {
    const candidate = new Date(now);
    candidate.setUTCDate(now.getUTCDate() + i);
    candidate.setUTCHours(0, 30, 0, 0);
    const day = candidate.getUTCDay();
    if (day >= 1 && day <= 5 && candidate.getTime() > now.getTime()) {
      return candidate.toISOString();
    }
  }
  return null;
}

/**
 * Build the full diagnostics report. Runs every check in parallel,
 * classifies overall health, and produces operator recommendations.
 */
export async function buildDiagnosticsReport(): Promise<DiagnosticsReport> {
  const [
    cron,
    lock,
    recentRuns,
    archiveIntegrity,
    changeProduction,
    binaries,
    redisHealth,
    pythonBackend,
    queueHealth,
    digestHealth,
    searchIndexHealth,
    jobRunning,
  ] = await Promise.all([
    checkCronOwnership(),
    checkAdvisoryLock(),
    checkRecentRuns(),
    checkArchiveIntegrity(),
    checkChangeProduction(),
    checkBinaries(),
    checkRedisHealth(),
    checkPythonBackend(),
    checkQueueHealth(),
    checkDigestHealth(),
    checkSearchIndexHealth(),
    safeCall("isJobRunning", () => isJobRunning()),
  ]);

  // Bank-holiday-aware: a plain weekday check would flag every UK bank
  // holiday as a missed/stuck run, even though GOV.UK doesn't publish that
  // day. Computed once and reused below.
  const weekdayExpectedRun = await isExpectedPublishDay(new Date().toISOString().split("T")[0]);

  const recommendations: string[] = [];

  // ── Recommendations ────────────────────────────────────────────────────────
  if (binaries.level === "fail") {
    recommendations.push(
      "csvdiff binary is missing — the diff phase will throw. Run: npm run setup:binaries",
    );
  }
  if (binaries.value && binaries.value.qsv && !binaries.value.qsv.installed) {
    recommendations.push(
      "qsv binary missing — record count guard disabled. Run: npm run setup:binaries",
    );
  }

  if (lock.value?.locked) {
    const idleSec = lock.value.holder?.idleSeconds ?? 0;
    const state = lock.value.holder?.state ?? "unknown";
    if (state === "idle" || state === "idle in transaction") {
      if (idleSec > 600) {
        recommendations.push(
          `Advisory lock held by zombie connection PID ${lock.value.holder?.pid} (idle ${idleSec}s). POST /api/admin/sponsor-monitor/force-unlock to terminate.`,
        );
      } else {
        recommendations.push(
          `Advisory lock held by idle PID ${lock.value.holder?.pid} (${idleSec}s) — likely normal in-window.`,
        );
      }
    } else {
      recommendations.push(
        `Advisory lock held by ACTIVE PID ${lock.value.holder?.pid} (state=${state}) — job is genuinely running.`,
      );
    }
  }

  if (archiveIntegrity.value) {
    const ai = archiveIntegrity.value;
    if (ai.pendingSyncCount > 0) {
      recommendations.push(
        `${ai.pendingSyncCount} archive(s) stuck at PENDING_SYNC — state machine never ran. Trigger a manual re-run.`,
      );
    }
    if (ai.failedCount > 0) {
      recommendations.push(
        `${ai.failedCount} archive(s) marked FAILED — check monitorJobRuns.errorMessage.`,
      );
    }
    if (ai.daysSinceLatest !== null && ai.daysSinceLatest > 2 && weekdayExpectedRun) {
      recommendations.push(
        `Latest archive is ${ai.daysSinceLatest} day(s) old on a weekday — ETL likely failing silently.`,
      );
    }
  }

  if (recentRuns.value?.stuckRunning) {
    recommendations.push(
      `A monitor_job_runs row has been 'running' for ${recentRuns.value.stuckRunning.hoursRunning}h — crash-recovery needed.`,
    );
  }

  if (pythonBackend.value && pythonBackend.value.online === false) {
    recommendations.push(
      "Python ETL backend offline — CSV URL discovery falls back to cheerio/scrapling. Check docker compose.",
    );
  }

  if (redisHealth.value && redisHealth.value.connected === false) {
    recommendations.push(
      "Redis cache disconnected — caching disabled and rate limits use in-process MemoryStore (per-pod only).",
    );
  }

  if (digestHealth.value && digestHealth.value.mismatch) {
    recommendations.push(
      "Latest daily digest has changes but displayedOnLanding is false — homepage showing stale landing data. Run admin refresh or check nightly job transaction logic.",
    );
  }

  if (digestHealth.value && digestHealth.value.latestDigestDaysAgo !== null && digestHealth.value.latestDigestDaysAgo > 2 && weekdayExpectedRun) {
    recommendations.push(
      `Latest digest is ${digestHealth.value.latestDigestDaysAgo} day(s) old on a weekday — digest generation may be stuck.`,
    );
  }

  if (searchIndexHealth.value && !searchIndexHealth.value.ready) {
    recommendations.push(
      "In-memory Fuse.js search index is not ready — sponsor search will fall back to SQL. POST /api/admin/sponsor-monitor/rebuild-index to warm it.",
    );
  }

  if (searchIndexHealth.value && searchIndexHealth.value.lastBuilt !== null) {
    const hoursSinceBuild = Math.floor(
      (Date.now() - new Date(searchIndexHealth.value.lastBuilt).getTime()) / (1000 * 60 * 60),
    );
    if (hoursSinceBuild > 24) {
      recommendations.push(
        `Search index last rebuilt ${hoursSinceBuild}h ago — consider a daily rebuild to reflect the latest data.`,
      );
    }
  }

  if (redisHealth.value && redisHealth.value.changesCacheTtlSeconds !== null && redisHealth.value.changesCacheTtlSeconds !== undefined) {
    if (redisHealth.value.changesCacheTtlSeconds >= 0 && redisHealth.value.changesCacheTtlSeconds < 60) {
      recommendations.push(
        `sponsors:changes cache TTL is only ${redisHealth.value.changesCacheTtlSeconds}s — cache is about to expire, next request hits the DB.`,
      );
    }
  }

  if (changeProduction.value) {
    const cp = changeProduction.value;
    if (cp.nullRemovedAtCount > 0) {
      recommendations.push(
        `${cp.nullRemovedAtCount} REMOVED_REVOKED sponsor(s) missing removedAt timestamp — state machine update incomplete.`,
      );
    }
    if (cp.strandedGracePeriodCount > 0) {
      recommendations.push(
        `${cp.strandedGracePeriodCount} sponsor(s) stranded in GRACE_PERIOD with consecutiveMisses >= 2 — state machine transition missed.`,
      );
    }
  }

  // ── Overall level ─────────────────────────────────────────────────────────
  let overall: CheckLevel = "ok";
  if (
    binaries.level === "fail" ||
    lock.value?.locked === true ||
    archiveIntegrity.value?.pendingSyncCount ||
    archiveIntegrity.value?.failedCount ||
    recentRuns.value?.stuckRunning ||
    (digestHealth.value && digestHealth.value.mismatch) ||
    (changeProduction.value && (changeProduction.value.nullRemovedAtCount > 0 || changeProduction.value.strandedGracePeriodCount > 0))
  ) {
    overall = "fail";
  } else if (
    recommendations.length > 0 ||
    binaries.level === "warn" ||
    (pythonBackend.value && pythonBackend.value.online === false) ||
    (searchIndexHealth.value && !searchIndexHealth.value.ready) ||
    (digestHealth.value && digestHealth.value.latestDigestDaysAgo !== null && digestHealth.value.latestDigestDaysAgo > 2 && weekdayExpectedRun)
  ) {
    overall = "warn";
  }

  return {
    timestamp: new Date().toISOString(),
    overall,
    jobRunning: jobRunning.value === true,
    cron,
    lock,
    recentRuns,
    archiveIntegrity,
    changeProduction,
    binaries,
    redis: redisHealth,
    pythonBackend,
    queue: queueHealth,
    digest: digestHealth,
    searchIndex: searchIndexHealth,
    weekdayExpectedRun,
    nextExpectedRunUtc: computeNextExpectedRunUtc(),
    recommendations,
  };
}

// ── Force-unlock ─────────────────────────────────────────────────────────────

/**
 * Aggressive lock release: finds the advisory lock holder and either:
 *   1. If the holder is IDLE > 10 minutes, terminate the session (zombie).
 *   2. If the holder is active, just clear locks on this connection.
 *   3. If no holder found, no-op.
 *
 * Returns a structured report so the admin can see exactly what was done.
 */
export async function forceReleaseSponsorMonitorLock(): Promise<ForceUnlockReport> {
  const lockCheck = await checkAdvisoryLock();
  if (!lockCheck.ok || !lockCheck.value?.locked || !lockCheck.value.holder) {
    // No lock visible from our connection — try clearing our own advisory
    // locks in case the lock is held by another pooled connection.
    try {
      await db.execute(sql`SELECT pg_advisory_unlock_all()`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        holder: null,
        zombieTerminated: false,
        reason: "no_lock_held",
        message: `No lock found; advisory_unlock_all on current connection completed. (${msg})`,
      };
    }
    return {
      holder: null,
      zombieTerminated: false,
      reason: "no_lock_held",
      message: "No lock was held — nothing to release.",
    };
  }

  const holder = lockCheck.value.holder;
  const isIdle =
    holder.state === "idle" || holder.state === "idle in transaction";
  const idleSec = holder.idleSeconds ?? 0;

  // ZOMBIE: idle for > 10 minutes → terminate the session.
  if (isIdle && idleSec > 600) {
    try {
      await db.execute(sql`SELECT pg_terminate_backend(${holder.pid})`);
      log.warn(
        { pid: holder.pid, idleSeconds: idleSec, state: holder.state },
        "[ForceUnlock] Terminated zombie connection holding sponsor monitor advisory lock.",
      );
      return {
        holder,
        zombieTerminated: true,
        reason: "zombie_terminated_idle",
        message: `Terminated PID ${holder.pid} (state=${holder.state}, idle ${idleSec}s). Lock should be released within 1s.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err, pid: holder.pid }, "[ForceUnlock] pg_terminate_backend failed");
      return {
        holder,
        zombieTerminated: false,
        reason: "zombie_terminated_idle",
        message: `Failed to terminate PID ${holder.pid}: ${msg}`,
      };
    }
  }

  // ZOMBIE: long-running transaction (> 30 min) → terminate
  try {
    const xactResult = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (now() - xact_start))::int AS xact_age
      FROM   pg_stat_activity
      WHERE  pid = ${holder.pid}
    `);
    const xactAge = (xactResult.rows[0] as unknown as { xact_age: number } | undefined)?.xact_age ?? 0;
    if (xactAge > 1800) {
      await db.execute(sql`SELECT pg_terminate_backend(${holder.pid})`);
      log.warn(
        { pid: holder.pid, xactAgeSeconds: xactAge },
        "[ForceUnlock] Terminated connection with long-running transaction holding sponsor monitor advisory lock.",
      );
      return {
        holder,
        zombieTerminated: true,
        reason: "zombie_terminated_too_long",
        message: `Terminated PID ${holder.pid} (transaction age ${xactAge}s). Lock should be released within 1s.`,
      };
    }
  } catch (err: unknown) {
    log.warn({ err }, "[ForceUnlock] xact age check failed (non-fatal)");
  }

  // ACTIVE: job is genuinely running — don't kill it. Just clear our
  // own advisory locks (this is what the existing release-lock does).
  try {
    await db.execute(sql`SELECT pg_advisory_unlock_all()`);
  } catch (err: unknown) {
    log.warn({ err }, "[ForceUnlock] pg_advisory_unlock_all failed");
  }
  log.info(
    { pid: holder.pid, state: holder.state, idleSeconds: idleSec },
    "[ForceUnlock] Active lock holder — not terminated. Cleared current connection's locks.",
  );
  return {
    holder,
    zombieTerminated: false,
    reason: "active_cleared",
    message: `Lock holder PID ${holder.pid} appears active (state=${holder.state}, idle=${idleSec}s). Cleared this connection's locks. Manual intervention required if the holder is hung.`,
  };
}
