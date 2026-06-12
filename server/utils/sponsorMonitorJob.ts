import cron from "node-cron";
import { db } from "../db";
import { dailyDigest, monitorJobRuns, diffResults, sponsorCanonical, csvArchive } from "@shared/schema";
import { eq, sql, and, inArray, gte } from "drizzle-orm";
import { discoverCsvUrl, generateFingerprint, type SponsorChange } from "./sponsorListFetcher";
import { ensureTodaysArchive, getArchiveForDate, parseCsvFile } from "./csvArchiver";
import { runCsvDiff, getCsvdiffPath, type CsvDiffResult } from "./binaryRunner";
import { applyStateMachine } from "./sponsorStateMachine";
import { rebuildSponsorIndex } from "./sponsorSearch";
import { cacheFlushPattern } from "./redisClient";
import { notifyUsersOfEvent, processQueuedEngineEvents } from "../services/notificationEngine";
import { getNotificationQueue, NOTIFICATION_JOB } from "../services/jobQueue";
import { generateHeadline, type RawDigestData } from "../services/aiDigest";
import { withRetry } from "./dbRetry";
import { sendAdminAlert } from "./adminAlert";
import { logger } from "./logger";
import { startJobRun, finishJobRun, type TriggerSource } from "./jobTelemetry";
import { match } from "ts-pattern";
import crypto from "crypto";
import { tryAcquireLock, releaseLock, isLockActive } from "./lockManager";

const log = logger.child({ module: "SponsorMonitorJob" });
// Why ts-pattern: ETL status branching must stay explicit/exhaustive so upstream
// data-format drifts are surfaced instead of silently swallowed.
// Priority 5 enum source of truth: shared/schema.ts sponsor_licence_timeline.licenceStatus.

// Distributed lock configuration
// Prevents duplicate execution across multiple server instances (horizontal scaling).
let lockHolderId: string | null = null;
const LOCK_LEASE_MS = 60 * 60 * 1000; // 60 minutes lease duration
export const SPONSOR_MONITOR_LOCK_KEY = 7483920; // Unique magic int for advisory lock

let lastRequestCheckTime = 0;
const REQUEST_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const BACKFILL_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Attempts to acquire a table-backed lock.
 * Returns true if the lock was acquired, false if another instance holds it.
 */
async function tryAcquireJobLock(): Promise<boolean> {
  try {
    if (!lockHolderId) {
      lockHolderId = crypto.randomUUID();
    }
    const acquired = await tryAcquireLock("sponsorMonitorJob", LOCK_LEASE_MS, lockHolderId);

    if (!acquired) {
      const today = new Date().toISOString().split("T")[0];
      const activeRun = await db
        .select({ id: monitorJobRuns.id, startedAt: monitorJobRuns.startedAt })
        .from(monitorJobRuns)
        .where(and(eq(monitorJobRuns.runDate, today), eq(monitorJobRuns.status, "running")))
        .limit(1);

      if (activeRun.length > 0 && activeRun[0].startedAt) {
        const runtimeMs = Date.now() - activeRun[0].startedAt.getTime();
        const MAX_RUNTIME_MS = 2 * 60 * 60 * 1000; // 2 hours
        if (runtimeMs > MAX_RUNTIME_MS) {
          log.error(
            { runtimeMs, runId: activeRun[0].id },
            `[SponsorMonitorJob] LOCK CONTENTION: Job has been in 'running' state for ${Math.round(runtimeMs/60000)} mins.`
          );

          // Auto-cleanup: force-delete stale table lock so next attempt succeeds.
          await db.execute(sql`DELETE FROM job_locks WHERE job_name = 'sponsorMonitorJob'`);
          log.warn(
            { runId: activeRun[0].id, runtimeMs },
            "[SponsorMonitorJob] Force-released stale job_locks entry after ghost detection.",
          );

          // Mark the ghost run as failed so idempotency check doesn't interfere.
          await db
            .update(monitorJobRuns)
            .set({
              status: "failed",
              errorMessage: `Auto-terminated ghost run after ${Math.round(runtimeMs / 60000)} min`,
            })
            .where(eq(monitorJobRuns.id, activeRun[0].id))
            .catch((err: unknown) =>
              log.warn({ err }, "[SponsorMonitorJob] Failed to mark ghost run as failed")
            );

          await sendAdminAlert(
            "ALERT: Sponsor Monitor Ghost Lock Auto-Terminated",
            `<p>Job for today was 'running' for ${Math.round(runtimeMs/60000)} mins without completion.</p>
             <p>Force-released stale <code>job_locks</code> entry and marked run as failed. Next retry will proceed normally.</p>`
          );

          // Retry lock acquisition now that the stale entry is cleared.
          return await tryAcquireLock("sponsorMonitorJob", LOCK_LEASE_MS, lockHolderId ?? crypto.randomUUID());
        }
      }
    }

    return acquired;
  } catch (err) {
    log.error({ err }, '[SponsorMonitorJob] Failed to acquire advisory lock');
    return false;
  }
}

async function releaseJobLock(): Promise<void> {
  if (lockHolderId) {
    await releaseLock("sponsorMonitorJob", lockHolderId);
    lockHolderId = null;
  }
}

// Export lock functions for use in routes and the BullMQ worker
export { tryAcquireJobLock, releaseJobLock };

interface LastRunInfo {
  date: string;
  success: boolean;
  recordsProcessed: number;
  changesDetected: number;
  changes: Record<string, number>;
  notificationsSent: number;
  error?: string;
}

let lastRunInfo: LastRunInfo | null = null;

async function sendAdminFailureAlert(errorMessage: string): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #8B0000 0%, #CC0000 100%); padding: 30px; border-radius: 10px 10px 0 0;">
        <h1 style="color: #ffffff; margin: 0; text-align: center; font-size: 22px;">Sponsor Monitor Job Failed</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="color: #333; font-size: 15px; line-height: 1.6;">The daily sponsor licence register check failed.</p>
        <div style="background: #fff3f3; padding: 15px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #CC0000;">
          <p style="color: #333; font-size: 14px; margin: 0; font-family: monospace; white-space: pre-wrap;">${errorMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        </div>
        <p style="color: #666; font-size: 14px;">You can manually trigger a rerun from the admin portal or via POST /api/admin/sponsor-monitor/run.</p>
        <p style="color: #999; font-size: 12px;">Timestamp: ${new Date().toISOString()}</p>
      </div>
    </div>
  `;
  await sendAdminAlert("ALERT: Daily sponsor monitor job failed", html);
  log.info("[SponsorMonitorJob] Admin failure alert sent.");
}

async function sendAdminJobCompleteEmail(result: {
  success: boolean;
  recordsProcessed: number;
  changesDetected?: number;
  changeSummary?: Record<string, number>;
  notificationsQueued: number;
  notificationsSent: number;
  notificationsSkipped: number;
  notificationsFailed: number;
  error?: string;
}, durationMs: number, source: string): Promise<void> {
  const isSuccess = result.success;
  const durationSec = (durationMs / 1000).toFixed(1);
  const changeCount = result.changesDetected ?? 0;
  const changeSummaryText = result.changeSummary && Object.keys(result.changeSummary).length > 0
    ? Object.entries(result.changeSummary).map(([k, v]) => `${k}: ${v}`).join(", ")
    : "None";

  const statusColor = isSuccess ? "#16a34a" : "#dc2626";
  const statusGradient = isSuccess
    ? "linear-gradient(135deg, #059669 0%, #16a34a 100%)"
    : "linear-gradient(135deg, #8B0000 0%, #CC0000 100%)";
  const statusLabel = isSuccess ? "Completed Successfully" : "Failed";
  const statusIcon = isSuccess ? "&#10004;" : "&#10008;";

  const subject = isSuccess
    ? `Sponsor Monitor: ${changeCount} change${changeCount !== 1 ? "s" : ""} detected (${durationSec}s)`
    : `ALERT: Sponsor monitor job failed`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${statusGradient}; padding: 30px; border-radius: 10px 10px 0 0;">
        <h1 style="color: #ffffff; margin: 0; text-align: center; font-size: 22px;">
          ${statusIcon} Sponsor Monitor Job ${statusLabel}
        </h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Status</td>
            <td style="padding: 8px 12px; color: ${statusColor}; font-weight: bold; border-bottom: 1px solid #f0f0f0;">${statusLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Trigger</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${source}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Duration</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${durationSec}s</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Records Processed</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${result.recordsProcessed.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Changes Detected</td>
            <td style="padding: 8px 12px; color: ${changeCount > 0 ? "#2563eb" : "#333"}; font-weight: ${changeCount > 0 ? "bold" : "normal"}; border-bottom: 1px solid #f0f0f0;">${changeCount}</td>
          </tr>
          ${changeCount > 0 ? `<tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Breakdown</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${changeSummaryText}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Notifications</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${result.notificationsQueued} queued, ${result.notificationsSent} sent, ${result.notificationsSkipped} skipped, ${result.notificationsFailed} failed</td>
          </tr>
        </table>
        ${result.error ? `<div style="background: #fff3f3; padding: 15px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #CC0000;">
          <p style="color: #333; font-size: 13px; margin: 0; font-family: monospace; white-space: pre-wrap;">${result.error.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        </div>` : ""}
        <p style="color: #999; font-size: 12px; margin-top: 16px; text-align: center;">
          ${new Date().toISOString()} &middot; checkbyai.net
        </p>
      </div>
    </div>`;

  try {
    await sendAdminAlert(subject, html);
    log.info(`[SponsorMonitorJob] Job ${isSuccess ? "success" : "failure"} email sent.`);
  } catch (err) {
    log.error({ err }, "[SponsorMonitorJob] Error sending job completion email");
  }
}


// ── First-run diff builder ─────────────────────────────────────────────────────

/**
 * Builds a synthetic "first run" CsvDiffResult where all records in today's raw CSV
 * are treated as Additions. Used when no yesterday archive exists (first ever run or
 * gap day). The state machine's Phase C handles Additions → NEW_LICENCE.
 */
async function buildFirstRunDiff(rawFilePath: string): Promise<CsvDiffResult> {
  const records = await parseCsvFile(rawFilePath);
  const additions: Record<string, string>[] = records.map((r) => ({
    fingerprint:        generateFingerprint(r.organisationName, r.townCity, r.route),
    "Organisation Name": r.organisationName,
    "Town/City":         r.townCity,
    "County":            r.county,
    "Type & Rating":     r.typeRating,
    "Route":             r.route,
  }));
  return { Additions: additions, Deletions: [], Modifications: [], durationMs: 0 };
}

/**
 * Builds a gap-day CsvDiffResult by comparing canonical DB records against
 * today's CSV. Used when yesterday's archive is missing from disk (container
 * restart, ephemeral storage) but canonical is already populated.
 *
 * Unlike buildFirstRunDiff (which blindly treats everything as new), this
 * correctly computes:
 *   Additions  — fingerprints in today's CSV not in canonical (NEW_LICENCE)
 *                or present as REMOVED_REVOKED (RE_ACTIVATED)
 *   Deletions  — fingerprints in canonical (ACTIVE/NEWLY_GRANTED/GRACE_PERIOD)
 *                absent from today's CSV (→ Phase D GRACE_PERIOD / REMOVED_REVOKED)
 *   Modifications — same fingerprint, different typeRating (UPGRADED/DOWNGRADED)
 *
 * Note: county is now stored in sponsor_canonical. County-only changes on
 * existing records are still not surfaced as discrete change events (low
 * business value), but new inserts will carry the correct county value.
 * Route changes always produce a new fingerprint (deletion + addition) and
 * are handled by Phase E rename detection, not Phase B.
 */
async function buildGapDayDiff(rawFilePath: string): Promise<CsvDiffResult> {
  const start = Date.now();
  log.info("Building gap-day diff from canonical DB vs today's CSV…");

  // 1. Load today's CSV and index by fingerprint
  const todayRecords = await parseCsvFile(rawFilePath);
  const todayByFp = new Map<string, typeof todayRecords[0]>();
  for (const r of todayRecords) {
    const fp = generateFingerprint(r.organisationName, r.townCity, r.route);
    todayByFp.set(fp, r);
  }

  // 2. Load all canonical records (all statuses so we can detect re-activations)
  const canonicalRows = await db
    .select({
      fingerprint: sponsorCanonical.fingerprint,
      currentName: sponsorCanonical.currentName,
      townCity:    sponsorCanonical.townCity,
      county:      sponsorCanonical.county,
      typeRating:  sponsorCanonical.typeRating,
      route:       sponsorCanonical.route,
      status:      sponsorCanonical.status,
    })
    .from(sponsorCanonical);

  const canonicalByFp = new Map(canonicalRows.map((r) => [r.fingerprint, r]));

  // 3. Compute diff buckets
  const additions:     Record<string, string>[]        = [];
  const deletions:     Record<string, string>[]        = [];
  const modifications: CsvDiffResult["Modifications"] = [];

  // Scan today's CSV: detect new companies and attribute changes
  for (const [fp, r] of todayByFp) {
    const canonical = canonicalByFp.get(fp);

    if (!canonical) {
      // New company — never in canonical
      additions.push({
        fingerprint:         fp,
        "Organisation Name": r.organisationName,
        "Town/City":         r.townCity,
        "County":            r.county,
        "Type & Rating":     r.typeRating,
        "Route":             r.route,
      });
    } else {
      match((canonical.status ?? "").toUpperCase())
        .with("REMOVED_REVOKED", () => {
          // Re-appearing after removal — Phase C will RE_ACTIVATE
          additions.push({
            fingerprint:         fp,
            "Organisation Name": r.organisationName,
            "Town/City":         r.townCity,
            "County":            r.county,
            "Type & Rating":     r.typeRating,
            "Route":             r.route,
          });
        })
        .with("ACTIVE", "NEWLY_GRANTED", "GRACE_PERIOD", () => {
          // Company exists — check for typeRating change
          const prevRating = canonical.typeRating ?? "";
          if (prevRating !== r.typeRating) {
            modifications.push({
              prev: {
                fingerprint:         fp,
                "Organisation Name": canonical.currentName,
                "Town/City":         canonical.townCity ?? "",
                "County":            canonical.county ?? "",
                "Type & Rating":     prevRating,
                "Route":             canonical.route ?? "",
              },
              curr: {
                fingerprint:         fp,
                "Organisation Name": r.organisationName,
                "Town/City":         r.townCity,
                "County":            r.county,
                "Type & Rating":     r.typeRating,
                "Route":             r.route,
              },
            });
          }
        })
        .otherwise((unknownStatus) => {
          log.warn({ unknownStatus, fingerprint: fp }, "Unhandled canonical status in gap-day diff scan");
        });
    }
  }

  // Scan canonical: detect companies that left the register
  for (const [fp, canonical] of canonicalByFp) {
    const shouldSkip = match((canonical.status ?? "").toUpperCase())
      .with("REMOVED_REVOKED", () => true)
      .with("ACTIVE", "NEWLY_GRANTED", "GRACE_PERIOD", () => false)
      .otherwise((unknownStatus) => {
        log.warn({ unknownStatus, fingerprint: fp }, "Unhandled canonical status while scanning deletions");
        return false;
      });
    if (shouldSkip) continue; // already removed — skip
    if (!todayByFp.has(fp)) {
      // Missing from today's CSV — Phase D will move to GRACE_PERIOD
      deletions.push({
        fingerprint:         fp,
        "Organisation Name": canonical.currentName,
        "Town/City":         canonical.townCity ?? "",
        "County":            canonical.county ?? "",
        "Type & Rating":     canonical.typeRating ?? "",
        "Route":             canonical.route ?? "",
      });
    }
  }

  const elapsed = Date.now() - start;
  log.info(
    `Gap-day diff complete in ${elapsed}ms: ` +
    `+${additions.length} added, -${deletions.length} removed, ~${modifications.length} modified`,
  );

  return {
    Additions:     additions,
    Deletions:     deletions,
    Modifications: modifications,
    durationMs:    elapsed,
  };
}

/**
 * Persists diff metadata (row counts + duration + bounded payload) to diff_results.
 * Non-fatal: a failure here only loses audit data, not state machine correctness.
 *
 * diffJson stores up to 1 000 fingerprints per bucket so any server in a
 * horizontal cluster can read the payload from the DB rather than a local file.
 * Typical daily deltas are 20–200 entries (a few KB). The full record-level
 * changes are already persisted in sponsor_changes; this is for audit/replay.
 */
async function saveDiffResult(runDate: string, diff: CsvDiffResult): Promise<void> {
  try {
    const diffPayload = {
      added:    diff.Additions.map((r) => r["fingerprint"] as string).filter(Boolean).slice(0, 1000),
      removed:  diff.Deletions.map((r)  => r["fingerprint"] as string).filter(Boolean).slice(0, 1000),
      modified: diff.Modifications.map((r) => r.curr["fingerprint"] as string).filter(Boolean).slice(0, 1000),
    };
    await db.insert(diffResults).values({
      runDate,
      addedCount:           diff.Additions.length,
      removedCount:         diff.Deletions.length,
      attributeChangeCount: diff.Modifications.length,
      diffDurationMs:       diff.durationMs,
      diffJson:             diffPayload,
    }).onConflictDoNothing();
  } catch (err: unknown) {
    log.warn({ err }, "[SponsorMonitorJob] Failed to save diff result (non-fatal)");
  }
}

export async function runSponsorMonitorJob(
  source: string = "cron",
  notifyOnFailure = false,
  orchestration?: { correlationId?: string; triggerSource?: TriggerSource },
): Promise<{
  success: boolean;
  recordsProcessed: number;
  changes: Record<string, number>;
  notificationsSent: number;
  notificationsSkipped: number;
  notificationsFailed: number;
  notificationsQueued: number;
  isGapDay: boolean;
  error?: string;
}> {
   const result = {
      success: false,
      recordsProcessed: 0,
      notificationsSent: 0,
      notificationsSkipped: 0,
      notificationsFailed: 0,
      notificationsQueued: 0,
      isGapDay: false,
      changes: {} as Record<string, number>,
   };


  // ── Distributed lock acquisition (replaces in-process isRunning flag) ─────
  // pg_try_advisory_lock() is atomic: across any number of API server instances,
  // only ONE can acquire this lock at a time. If another pod is already running
  // the job, we get false immediately instead of running a duplicate pass.
  const lockAcquired = await tryAcquireJobLock();
  if (!lockAcquired) {
    const msg = "Another instance is already running the sponsor monitor job. Skipping.";
    log.warn(`[SponsorMonitorJob] ${msg}`);
    return { ...result, error: msg };
  }

  const triggerSource: TriggerSource = orchestration?.triggerSource ?? (source === "cron" ? "cron" : source === "queue" ? "queue" : "manual");
  const telemetry = startJobRun("sponsorMonitorJob", triggerSource, "inline", orchestration?.correlationId);
  const startTime = Date.now();
  const JOB_TIMEOUT_MS = 25 * 60 * 1000; // 25-minute hard ceiling
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Watchdog + lock-release wrapper ──────────────────────────────────────
  // Promise.race ensures that if runJobCore() stalls (e.g. a DB insert hangs),
  // the timeout rejects after 25 min. The finally block ALWAYS runs, releasing
  // the table-backed lock even on timeout.
  try {
    const watchdog = new Promise<never>((_, reject) => {
      watchdogTimer = setTimeout(
        () => reject(new Error(`Job timed out after ${JOB_TIMEOUT_MS / 60000} minutes. Table-backed lock released.`)),
        JOB_TIMEOUT_MS
      );
    });

    await Promise.race([runJobCore(), watchdog]);
    return result; // reached only when runJobCore() completes without throwing
  } catch (err: unknown) {
    // Handles: timeout, unexpected throws from runJobCore()
    // err?.message ?? String(err) ensures a non-null string even when the thrown
    // value is a plain string, null, undefined, or a non-standard error object.
    const errorMsg = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    log.error({ err }, errorMsg);
    if (notifyOnFailure) await sendAdminFailureAlert(errorMsg);
    const failDuration = Date.now() - startTime;
    const failTime = new Date();
    try {
      const today = new Date().toISOString().split("T")[0];
      await withRetry(async () => {
        await db.insert(monitorJobRuns).values({
          runDate: today,
          source,
          status: "failed",
          recordsProcessed: result.recordsProcessed,
          changesDetected: 0,
          durationMs: failDuration,
          errorMessage: errorMsg,
          isGapDay: result.isGapDay,
          completedAt: failTime,
        }).onConflictDoUpdate({
          target: monitorJobRuns.runDate,
          set: {
            status: "failed",
            errorMessage: errorMsg,
            durationMs: failDuration,
            isGapDay: result.isGapDay,
            completedAt: failTime,
          },
        });
      }, "Log job failure");
    } catch (logErr) {
      log.error({ err: logErr }, "[SponsorMonitorJob] Failed to log job failure");
    }
    if (notifyOnFailure) {
      sendAdminJobCompleteEmail(
        { success: false, recordsProcessed: result.recordsProcessed, notificationsQueued: result.notificationsQueued, notificationsSent: result.notificationsSent, notificationsSkipped: result.notificationsSkipped, notificationsFailed: result.notificationsFailed, error: errorMsg },
        failDuration,
        source
      ).catch((e) => log.error({ err: e }, '[SponsorMonitorJob] Failed to send admin failure alert email'));
    }
    Object.assign(result, { error: errorMsg });
    finishJobRun({ ...telemetry, jobName: "sponsorMonitorJob", triggerSource, runMode: "inline", result: "failed", failureReason: errorMsg });
    return result;
  } finally {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    await releaseJobLock();
    if (result.success) {
      finishJobRun({ ...telemetry, jobName: "sponsorMonitorJob", triggerSource, runMode: "inline", result: "success" });
    }
    lastRunInfo = {
      date: new Date().toISOString(),
      success: result.success,
      recordsProcessed: result.recordsProcessed,
      changesDetected: Object.values(result.changes).reduce((a, b) => a + b, 0),
      changes: result.changes,
      notificationsSent: result.notificationsSent,
      error: (result as any).error,
    };
  }

  // ── Inner job function ────────────────────────────────────────────────────
  // Mutates `result` in place. Unexpected throws bubble up to the outer catch.
  async function runJobCore(): Promise<void> {
    const today     = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

    log.info(`[SponsorMonitorJob] === Daily sponsor monitor check starting (triggered by: ${source}) ===`);

    // ── Pre-flight binary check ────────────────────────────────────────────────
    // csvdiff is load-bearing for the diff phase. Throw immediately if missing
    // to save 2+ minutes of CSV download + validation. Operators see this in
    // the alert and can run `npm run setup:binaries`.
    const csvdiffPath = getCsvdiffPath();
    if (!csvdiffPath) {
      const msg = "csvdiff binary is missing — cannot run diff phase. Run: npm run setup:binaries";
      log.error(`[SponsorMonitorJob] ${msg}`);
      await sendAdminAlert("ALERT: Sponsor Monitor Pre-Flight Failed", `<p>${msg}</p>`);
      throw new Error(msg);
    }

    // ── ETL integrity check (migration 0014) ───────────────────────────────────
    // Detect archives that were downloaded in a prior run but whose state machine
    // never completed (PENDING_SYNC). This happens when the server crashed between
    // the CSV download and the state machine write. Operators should re-trigger
    // the job manually to re-process these dates.
    const staleArchives = await db
      .select({ snapshotDate: csvArchive.snapshotDate, filePath: csvArchive.filePath })
      .from(csvArchive)
      .where(eq(csvArchive.syncStatus, "PENDING_SYNC"))
      .orderBy(csvArchive.snapshotDate);
    if (staleArchives.length > 0) {
      const staleDates = staleArchives.map((r) => r.snapshotDate).join(", ");
      log.warn(
        { staleDates },
        `[SponsorMonitorJob] Found ${staleArchives.length} PENDING_SYNC archive(s): ${staleDates}. Auto-reprocessing…`,
      );

      for (const stale of staleArchives) {
        // For each PENDING_SYNC date, rerun the state machine so changes
        // from that date are persisted and the archive advances to SYNCED.
        try {
          const archive = await getArchiveForDate(stale.snapshotDate);
          if (!archive) {
            log.warn({ date: stale.snapshotDate }, "PENDING_SYNC archive file missing — skipping auto-reprocess.");
            continue;
          }

          // Find the previous business day for csvdiff comparison.
          const prevDate = findPreviousBusinessDay(stale.snapshotDate);
          const prevArchive = await getArchiveForDate(prevDate);
          let diff: CsvDiffResult;

          if (prevArchive) {
            diff = await runCsvDiff(prevArchive.fingerprintedFilePath, archive.fingerprintedFilePath, ["fingerprint"]);
          } else {
            // No previous archive — build gap-day diff from canonical DB.
            diff = await buildGapDayDiff(archive.filePath);
          }

          // Run the state machine for this date.
          log.info({ date: stale.snapshotDate }, `[SponsorMonitorJob] Auto-reprocessing PENDING_SYNC archive…`);
          await applyStateMachine(diff, stale.snapshotDate, archive.fingerprintedFilePath);

          // Mark the archive as SYNCED.
          await db
            .update(csvArchive)
            .set({ syncStatus: "SYNCED" })
            .where(eq(csvArchive.snapshotDate, stale.snapshotDate))
            .catch((err: unknown) =>
              log.warn({ err, date: stale.snapshotDate }, "[SponsorMonitorJob] Failed to mark reprocessed archive SYNCED")
            );

          log.info({ date: stale.snapshotDate, additions: diff.Additions.length, deletions: diff.Deletions.length, modifications: diff.Modifications.length },
            `[SponsorMonitorJob] Auto-reprocess complete for ${stale.snapshotDate}.`);
        } catch (err: unknown) {
          log.error({ err, date: stale.snapshotDate }, "[SponsorMonitorJob] Auto-reprocess failed for PENDING_SYNC archive — continuing to today's run.");
          // Mark as FAILED so operator can investigate via diagnostics.
          await db
            .update(csvArchive)
            .set({ syncStatus: "FAILED" })
            .where(eq(csvArchive.snapshotDate, stale.snapshotDate))
            .catch((e: unknown) =>
              log.warn({ err: e, date: stale.snapshotDate }, "[SponsorMonitorJob] Failed to mark failed reprocess archive FAILED")
            );
        }
      }
    }

    // ── Idempotency check ──────────────────────────────────────────────────────
    const existingRun = await db
      .select({ id: monitorJobRuns.id, status: monitorJobRuns.status })
      .from(monitorJobRuns)
      .where(eq(monitorJobRuns.runDate, today))
      .limit(1);

    if (existingRun.length > 0 && existingRun[0].status === "success" && source === "cron") {
      const msg = `Reconciliation already completed successfully for ${today}. Skipping duplicate cron run.`;
      log.info(`[SponsorMonitorJob] ${msg}`);
      result.success = true;
      Object.assign(result, { error: msg });
      return;
    }

    // ── Phase 1: Discover CSV URL + archive today's file ──────────────────────
    // ensureTodaysArchive: download → qsv validate → count guard (≥100k) → DB register
    // Hard-throws on HTTP failure, truncated file, or zero bytes.
    const csvUrl = await discoverCsvUrl();
    log.info(`[SponsorMonitorJob] CSV URL discovered.`);
    const todayArchive = await ensureTodaysArchive(today, csvUrl);
    result.recordsProcessed = todayArchive.recordCount;

    // ── HTML-fallback guard (defense in depth) ────────────────────────────────
    // The archiver has a 100K record-count guard, but a partial record count
    // (e.g. 60K) could pass the archiver if the threshold is misconfigured, or
    // HTML-fallback data from a scraper failure could land in the archive via
    // cache. Abort if we have fewer than 50K records — the register normally
    // has ~140K sponsors.
    if (todayArchive.recordCount < 50_000) {
      const msg = `Refusing to run diff on suspiciously small archive: ${todayArchive.recordCount.toLocaleString()} records. ` +
                  `Likely HTML-fallback or truncated CSV.`;
      log.error(`[SponsorMonitorJob] ${msg}`);
      await sendAdminAlert(
        "ALERT: Sponsor Monitor Aborted — HTML Fallback Suspected",
        `<p>${msg}</p>
         <p>The nightly monitor has been aborted to prevent mass REMOVED_REVOKED for legitimate sponsors.</p>`,
      );
      // Mark archive as FAILED so the integrity check surfaces it. If this
      // write fails the archive stays PENDING_SYNC and will be re-attempted
      // on the next run — log it so the retry loop is explicable.
      await db
        .update(csvArchive)
        .set({ syncStatus: "FAILED" })
        .where(eq(csvArchive.snapshotDate, today))
        .catch((err: unknown) =>
          log.error({ err }, "[SponsorMonitorJob] Failed to mark archive FAILED — status remains PENDING_SYNC"),
        );
      throw new Error(msg);
    }

    // ── Phase 2: Load yesterday's archive for csvdiff ─────────────────────────
    const yesterdayArchive = await getArchiveForDate(yesterday);
    let diff: CsvDiffResult;

    if (!yesterdayArchive) {
      // No previous archive on disk. Distinguish true first run (canonical empty)
      // from gap day (archive lost, canonical already populated).
      const seedCheck = await db.select({ id: sponsorCanonical.id }).from(sponsorCanonical).limit(1);
      const isSeeded = seedCheck.length > 0;

      if (isSeeded) {
        // Gap day — archive file is missing (container restart / ephemeral disk)
        // but canonical has data. Diff canonical DB vs today's CSV to detect real changes.
        log.warn(
          `[SponsorMonitorJob] No archive for ${yesterday} but canonical is populated — ` +
          `running gap-day diff against DB. (Container restart or ephemeral disk issue.)`,
        );
        diff = await buildGapDayDiff(todayArchive.filePath);
        result.isGapDay = true;
      } else {
        // True first run — canonical is empty. Seed it with all today's records.
        log.info(
          `[SponsorMonitorJob] No archive for ${yesterday} and canonical is empty — ` +
          `first run detected. Treating all ${todayArchive.recordCount.toLocaleString()} records as NEW_LICENCE.`,
        );
        diff = await buildFirstRunDiff(todayArchive.filePath);
      }
    } else {
      // Standard night: diff yesterday vs today using the Go csvdiff binary.
      log.info(
        `[SponsorMonitorJob] Diffing ${yesterday} (${yesterdayArchive.recordCount.toLocaleString()}) ` +
        `vs ${today} (${todayArchive.recordCount.toLocaleString()}) …`,
      );
      diff = await runCsvDiff(
        yesterdayArchive.fingerprintedFilePath,
        todayArchive.fingerprintedFilePath,
        ["fingerprint"],
      );
      log.info(
        `[SponsorMonitorJob] csvdiff: +${diff.Additions.length} added, ` +
        `-${diff.Deletions.length} removed, ~${diff.Modifications.length} modified ` +
        `(${diff.durationMs}ms)`,
      );
    }

    // Save diff metadata to diff_results table (non-fatal).
    await saveDiffResult(today, diff);

    // ── Gap-day diff sanity check (Phase 2 P3) ─────────────────────────────
    // Gap-day diffs bypass csvdiff and run in JS, which can miss edge cases
    // (column-level changes, special-character mismatches). If the result
    // shows zero changes despite both sources having 124K+ records, that is
    // suspicious — alert the operator.
    if (result.isGapDay) {
      const totalChanges = diff.Additions.length + diff.Deletions.length + diff.Modifications.length;
      const csvRecordCount = todayArchive.recordCount;
      const canonicalCountResult = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM sponsor_canonical
      `);
      const canonicalCount = (canonicalCountResult.rows[0] as { cnt: number } | undefined)?.cnt ?? 0;
      if (csvRecordCount >= 124_000 && canonicalCount >= 124_000 && totalChanges === 0) {
        const msg = `Gap-day diff reported 0 changes despite CSV (${csvRecordCount.toLocaleString()}) and canonical (${canonicalCount.toLocaleString()}) both having 124K+ records. ` +
                    `This is suspicious — gap-day JS diff may have missed edge cases that csvdiff would have caught.`;
        log.error(`[SponsorMonitorJob] ${msg}`);
        await sendAdminAlert(
          "ALERT: Sponsor Monitor Gap-Day Zero-Diff Suspicious",
          `<p>${msg}</p>
           <p>The Home Office register normally has daily additions/removals. A zero-diff on a fully populated gap-day is statistically improbable.</p>
           <p>Action: Manually re-run the job when the previous archive becomes available, and verify the CSV is the current register.</p>`,
        ).catch((err: unknown) =>
          log.warn({ err }, "[SponsorMonitorJob] Failed to send gap-day zero-diff alert")
        );
      }
    }

    // ── Phase 3: State machine ─────────────────────────────────────────────────
    // applyStateMachine handles all DB writes (canonical + sponsorChanges) internally.
    // syncStatus is updated to SYNCED on success or FAILED on error so that the
    // ETL integrity check on the next run can detect incomplete state machine runs.
    log.info("[SponsorMonitorJob] Applying state machine…");
    let smResult: Awaited<ReturnType<typeof applyStateMachine>>;
    try {
      smResult = await applyStateMachine(diff, today, todayArchive.fingerprintedFilePath);
      // Mark this archive as fully processed — visible to all server instances.
      await db
        .update(csvArchive)
        .set({ syncStatus: "SYNCED" })
        .where(eq(csvArchive.snapshotDate, today))
        .catch((err: unknown) =>
          log.warn({ err }, "[SponsorMonitorJob] Failed to mark archive SYNCED (non-fatal)")
        );
    } catch (smErr: unknown) {
      // Mark the archive as FAILED so the integrity check surfaces it clearly.
      await db
        .update(csvArchive)
        .set({ syncStatus: "FAILED" })
        .where(eq(csvArchive.snapshotDate, today))
        .catch((err: unknown) =>
          log.warn({ err }, "[SponsorMonitorJob] Failed to mark archive FAILED (non-fatal)")
        );
      throw smErr; // re-throw so the outer catch logs + sends admin alert
    }

    await rebuildSponsorIndex();

    // Flush stale Redis cache so the next request picks up the fresh index data.
    // Retry up to 3 times with 500ms backoff. If all fail, log at error level
    // and record the last-flush timestamp so diagnostics can surface the gap.
    let flushed = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      flushed = await cacheFlushPattern("sponsors:*");
      if (flushed > 0) break;
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (flushed > 0) {
      log.info(`[SponsorMonitorJob] Flushed ${flushed} Redis cache keys after nightly rebuild.`);
    } else {
      log.error(
        `[SponsorMonitorJob] Redis cache flush failed after 3 attempts — stale 'sponsors:*' keys may persist. ` +
        `Next request will see outdated data until the next successful flush.`,
      );
    }

    const changeCounts: Record<string, number> = {};
    for (const change of smResult.changes) {
      changeCounts[change.changeType] = (changeCounts[change.changeType] || 0) + 1;
    }
    result.changes = changeCounts;

     // ── Notifications ──────────────────────────────────────────────────────────
     // Enqueue notifications via BullMQ. Checks per-event, per-channel
     // prefs (notif_prefs jsonb), applies rate limit (3/hr per user:company),
     // and sends immediately. Results logged to notif_log.
     const alertableChanges = smResult.changes.filter((c) => c.changeType !== "NAME_CHANGE");
     
     // First-run optimization: If there are over 10,000 changes, this is an initial 
     // database seed or a massive structural change. We should not attempt to dispatch 
     // notifications for every single one of them.
     if (alertableChanges.length > 10000) {
       log.info(`[SponsorMonitorJob] Skipping notifications for ${alertableChanges.length} alertable changes (first-run / mass update).`);
     } else if (alertableChanges.length > 0) {
       log.info(`[SponsorMonitorJob] Queueing notifications for ${alertableChanges.length} alertable changes…`);
       const notifQueue = getNotificationQueue();
       if (notifQueue) {
      const jobs = alertableChanges.map(change => ({
        name: NOTIFICATION_JOB,
        data: {
          id: change.id, // NotificationEngine expects 'id'
          organisationName: change.organisationName,
          changeType: change.changeType,
          previousValue: change.previousValue,
          newValue: change.newValue,
          snapshotDate: today
        }
      }));
         await notifQueue.addBulk(jobs);
         result.notificationsQueued = jobs.length;
       } else {
          log.info('[SponsorMonitorJob] Notification queue not available (Redis down); falling back to inline processing');
          // Fallback: process inline but with limits
          for (const change of alertableChanges.slice(0, 50)) { // Limit fallback to prevent overload
            const notifResult = await notifyUsersOfEvent(change).catch((err: any) => {
              log.error({ err },
                `[SponsorMonitorJob] Notification engine error for "${change.organisationName}"`,
              );
              return { sent: 0, skipped: 0, failed: 1 }; // Count failures
            });
            if (notifResult) {
              result.notificationsSent += notifResult.sent;
              result.notificationsSkipped += notifResult.skipped;
              result.notificationsFailed += notifResult.failed;
            }
          }
       }
      } else {
       log.info("[SponsorMonitorJob] No alertable changes today.");
      }

    // ── Notification failure alert (P2.2) ───────────────────────────────────
    // If more than 10% of notifications failed, surface to admin. This
    // primarily catches inline-fallback failures (Redis down → queue offline).
    // BullMQ workers log to notif_log asynchronously; those are surfaced via
    // diagnostics' checkQueueHealth() instead.
    const notifTotal = result.notificationsQueued + result.notificationsSent + result.notificationsFailed;
    if (notifTotal > 0) {
      const failureRate = result.notificationsFailed / notifTotal;
      if (failureRate > 0.10) {
        const pctStr = (failureRate * 100).toFixed(1);
        const msg = `Notification failure rate is ${pctStr}% (${result.notificationsFailed}/${notifTotal}) — exceeds 10% threshold.`;
        log.error(`[SponsorMonitorJob] ${msg}`);
        await sendAdminAlert(
          "ALERT: Sponsor Monitor Notification Failure Rate High",
          `<p>${msg}</p>
           <ul>
             <li><strong>Queued:</strong> ${result.notificationsQueued}</li>
             <li><strong>Sent:</strong> ${result.notificationsSent}</li>
             <li><strong>Failed:</strong> ${result.notificationsFailed}</li>
             <li><strong>Skipped:</strong> ${result.notificationsSkipped}</li>
           </ul>
           <p>Action: Check Resend dashboard for bounce/unsubscribe spikes, and verify Redis health via the diagnostics endpoint.</p>`,
        ).catch((err: unknown) =>
          log.warn({ err }, "[SponsorMonitorJob] Failed to send notification failure alert")
        );
      }
    }

    // ── Daily digest ────────────────────────────────────────────────────────────
    try {
      const addedCount   = (changeCounts["NEW_LICENCE"]    || 0) + (changeCounts["RE_ACTIVATED"] || 0);
      const updatedCount = (changeCounts["UPGRADED"]       || 0) + (changeCounts["DOWNGRADED"]   || 0)
                         + (changeCounts["ROUTE_CHANGE"]   || 0) + (changeCounts["NAME_CHANGE"]  || 0);
      const removedCount = changeCounts["REMOVED_REVOKED"] || 0;

      const removedCompanies = smResult.changes
        .filter((c) => c.changeType === "REMOVED_REVOKED")
        .slice(0, 10)
        .map((c) => c.organisationName);
      const addedCompanies = smResult.changes
        .filter((c) => c.changeType === "NEW_LICENCE" || c.changeType === "RE_ACTIVATED")
        .slice(0, 5)
        .map((c) => c.organisationName);

      const digestData: RawDigestData = {
        snapshotDate: today,
        addedCount,
        updatedCount,
        removedCount,
        removedCompanies,
        addedCompanies,
      };

      const headlineResult = await generateHeadline(digestData);
      const selectedVariantIndex = Math.floor(Math.random() * 3);

      // Only set displayedOnLanding: true when there are actual changes.
      // If no changes today, keep the previous active digest as the landing display
      // so the homepage shows meaningful data instead of all-zero counts.
      const hasChanges = addedCount > 0 || removedCount > 0 || updatedCount > 0;

      // Atomically swap displayedOnLanding — wrap the bulk-flip and insert
      // in a single transaction so the frontend never sees available:false
      // between the two operations.
      if (hasChanges) {
        await db.transaction(async (tx) => {
          await tx.update(dailyDigest).set({ displayedOnLanding: false });
          await tx.insert(dailyDigest).values({
            snapshotDate: today,
            addedCount,
            updatedCount,
            removedCount,
            headlineGenerated: headlineResult.headline,
            headlineVariants: headlineResult.variants,
            displayedOnLanding: true,
            selectedVariantIndex,
            aiModel: headlineResult.model,
          }).onConflictDoUpdate({
            target: dailyDigest.snapshotDate,
            set: {
              addedCount,
              updatedCount,
              removedCount,
              headlineGenerated: headlineResult.headline,
              headlineVariants: headlineResult.variants,
              displayedOnLanding: true,
              selectedVariantIndex,
              aiModel: headlineResult.model,
              generatedAt: new Date(),
            },
          });
        });
      } else {
        await db.insert(dailyDigest).values({
          snapshotDate: today,
          addedCount,
          updatedCount,
          removedCount,
          headlineGenerated: headlineResult.headline,
          headlineVariants: headlineResult.variants,
          displayedOnLanding: false,
          selectedVariantIndex,
          aiModel: headlineResult.model,
        }).onConflictDoUpdate({
          target: dailyDigest.snapshotDate,
          set: {
            addedCount,
            updatedCount,
            removedCount,
            headlineGenerated: headlineResult.headline,
            headlineVariants: headlineResult.variants,
            displayedOnLanding: false,
            selectedVariantIndex,
            aiModel: headlineResult.model,
            generatedAt: new Date(),
          },
        });
      }

      log.info(`[SponsorMonitorJob] Daily digest generated: "${headlineResult.headline}" (model: ${headlineResult.model})`);
    } catch (digestErr: any) {
      log.error({ err: digestErr }, "[SponsorMonitorJob] Failed to generate daily digest");
    }

    // ── Audit log ────────────────────────────────────────────────────────────────
    const finalDuration = Date.now() - startTime;
    const completionTime = new Date();
     await withRetry(async () => {
       await db.insert(monitorJobRuns).values({
         runDate: today,
         source,
         status: "success",
         recordsProcessed: result.recordsProcessed,
         changesDetected: smResult.changes.length,
         changeSummary: changeCounts,
         notificationsSent:   result.notificationsSent,
         notificationsSkipped: result.notificationsSkipped,
         notificationsFailed: result.notificationsFailed,
         notificationsQueued: result.notificationsQueued,
         isGapDay: result.isGapDay,
         durationMs: finalDuration,
         completedAt: completionTime,
       }).onConflictDoUpdate({
         target: monitorJobRuns.runDate,
         set: {
          // Do NOT overwrite `source` — preserve the original trigger source (e.g., "cron")
          // even when a retry (e.g., "startup-catchup") produces the successful run.
          status: "success",
          recordsProcessed: result.recordsProcessed,
          changesDetected: smResult.changes.length,
          changeSummary: changeCounts,
          notificationsSent:   result.notificationsSent,
          notificationsSkipped: result.notificationsSkipped,
          notificationsFailed: result.notificationsFailed,
          notificationsQueued: result.notificationsQueued,
          isGapDay: result.isGapDay,
          durationMs: finalDuration,
          completedAt: completionTime,
        },
      });
    }, "Log job success");

    result.success = true;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info(
      `[SponsorMonitorJob] === Job complete (${elapsed}s) ===\n` +
      `  Records processed: ${result.recordsProcessed.toLocaleString()}\n` +
      `  Changes detected: ${smResult.changes.length} total` +
      (Object.keys(changeCounts).length > 0
        ? ` (${Object.entries(changeCounts).map(([k, v]) => `${k}: ${v}`).join(", ")})`
        : "") + "\n" +
      `  Notifications: ${result.notificationsQueued} queued, ${result.notificationsSent} sent, ${result.notificationsSkipped} skipped, ${result.notificationsFailed} failed`,
    );

    sendAdminJobCompleteEmail(
      {
        success: true,
        recordsProcessed: result.recordsProcessed,
        changesDetected: smResult.changes.length,
        changeSummary: changeCounts,
        notificationsQueued: result.notificationsQueued,
        notificationsSent:   result.notificationsSent,
        notificationsSkipped: result.notificationsSkipped,
        notificationsFailed: result.notificationsFailed,
      },
      Date.now() - startTime,
      source,
    ).catch((e) => log.error({ err: e }, "[SponsorMonitorJob] Failed to send admin job completion email"));
  } // end runJobCore
}

export function getLastRunInfo(): LastRunInfo | null {
  return lastRunInfo;
}

async function seedInitialDigest(): Promise<void> {
  try {
    const existing = await db.select({ id: dailyDigest.id }).from(dailyDigest).limit(1);
    if (existing.length > 0) {
      log.info("[SponsorMonitorJob] Daily digest already has data, skipping seed.");
      return;
    }

    const stats = await db
      .select({
        total:   sql<number>`count(*)::int`,
        active:  sql<number>`count(*) filter (where ${sponsorCanonical.status} in ('ACTIVE','NEWLY_GRANTED'))::int`,
        revoked: sql<number>`count(*) filter (where ${sponsorCanonical.status} = 'REMOVED_REVOKED')::int`,
      })
      .from(sponsorCanonical);

    const { total, active, revoked } = stats[0] || { total: 0, active: 0, revoked: 0 };
    if (total === 0) {
      log.info("[SponsorMonitorJob] No sponsor data found, cannot seed digest.");
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    const headline = `${active.toLocaleString()} UK Sponsors Under Watch`;
    const variants = [
      {
        headline: `${active.toLocaleString()} UK Sponsors Tracked`,
        subheadline: `Monitoring the full Home Office register`,
        emotion: "informative",
        focus: "overview",
      },
      {
        headline: `${active.toLocaleString()} Active Sponsor Licences`,
        subheadline: `Checked nightly for revocations and changes`,
        emotion: "neutral",
        focus: "overview",
      },
      {
        headline: `Tracking ${active.toLocaleString()} UK Sponsors`,
        subheadline: `Real-time monitoring of the official register`,
        emotion: "informative",
        focus: "overview",
      },
    ];

    await db.insert(dailyDigest).values({
      snapshotDate: today,
      addedCount: active,
      updatedCount: 0,
      removedCount: revoked,
      headlineGenerated: headline,
      headlineVariants: variants,
      displayedOnLanding: true,
      selectedVariantIndex: 0,
      aiModel: "deterministic-seed",
    }).onConflictDoUpdate({
      target: dailyDigest.snapshotDate,
      set: {
        headlineGenerated: headline,
        headlineVariants: variants,
        displayedOnLanding: true,
      },
    });

    log.info(`[SponsorMonitorJob] Initial digest seeded: "${headline}" (${active} active, ${revoked} revoked sponsors)`);
  } catch (err: unknown) {
    log.error({ err }, "[SponsorMonitorJob] Failed to seed initial digest");
  }
}

function isWeekday(): boolean {
  const day = new Date().getUTCDay();
  return day >= 1 && day <= 5;
}

/** Returns the previous business day (Mon-Fri) for a given YYYY-MM-DD date. */
function findPreviousBusinessDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().split("T")[0];
}

export { isWeekday };

async function hasTodayJobSucceeded(): Promise<boolean | null> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const existing = await db
      .select({ id: monitorJobRuns.id, status: monitorJobRuns.status })
      .from(monitorJobRuns)
      .where(and(eq(monitorJobRuns.runDate, today), eq(monitorJobRuns.status, "success")))
      .limit(1);
    return existing.length > 0;
  } catch (err) {
    log.error({ err }, "[SponsorMonitorJob] Error checking today's job status");
    return null;
  }
}

/**
 * Returns the dates of the last N calendar days (including today) that were
 * weekdays (Mon–Fri UTC), newest first.
 */
function recentWeekdays(lookbackDays: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < lookbackDays; i++) {
    const check = new Date(d);
    check.setUTCDate(d.getUTCDate() - i);
    const day = check.getUTCDay();
    if (day >= 1 && day <= 5) {
      dates.push(check.toISOString().split("T")[0]);
    }
  }
  return dates; // newest first
}

/**
 * Startup catch-up: queries monitor_job_runs for the last 7 weekdays.
 * If any have no successful run recorded, triggers the job immediately
 * (using "today's" CSV, which always reflects the latest published register).
 *
 * Designed for Autoscale deployments where the in-process cron at 00:30 UTC
 * fires into a dead server. On every cold start we check and self-heal.
 */
async function checkMissedJobsAndCatchUp(source: string = "startup-catchup"): Promise<void> {
  try {
    const weekdays = recentWeekdays(7);
    if (weekdays.length === 0) return;

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);

    const successfulRuns = await db
      .select({ runDate: monitorJobRuns.runDate })
      .from(monitorJobRuns)
      .where(
        and(
          inArray(monitorJobRuns.runDate, weekdays),
          eq(monitorJobRuns.status, "success"),
        ),
      );

    const successDates = new Set(successfulRuns.map((r) => r.runDate));

    // Find the most recent missed weekday (weekdays[0] = today, [1] = yesterday, …)
    // Skip today if it's very early (before 00:35 UTC) — the cron will handle it.
    const nowUTCHour = new Date().getUTCHours();
    const nowUTCMin  = new Date().getUTCMinutes();
    const tooEarlyForToday = nowUTCHour === 0 && nowUTCMin < 35;

    const missed = weekdays.find((date, idx) => {
      if (idx === 0 && tooEarlyForToday) return false; // skip today before 00:35
      return !successDates.has(date);
    });

    if (!missed) {
      log.info(`[SponsorMonitorJob] ${source === "startup-catchup" ? "Startup catch-up" : "Backfill check"}: all recent weekday jobs are present.`);
      return;
    }

    const isStartup = source === "startup-catchup";
    log.warn(
      { missedDate: missed, successDates: [...successDates], source },
      `[SponsorMonitorJob] ${isStartup ? "Startup catch-up" : "Backfill check"}: no successful run found for ${missed} (and possibly earlier). Triggering now.`,
    );

    await sendAdminAlert(
      `ℹ️ CheckByAI: ${isStartup ? "Startup" : "Periodic"} catch-up triggered`,
      `<p>${isStartup ? "Server booted" : "Periodic 6-hour check"} detected a missed sponsor monitor job.</p>
       <p>Most recent missed weekday: <strong>${missed}</strong></p>
       <p>Successful runs found: ${[...successDates].join(", ") || "none in last 7 days"}</p>
       <p>Running now to fetch the latest register CSV and apply any accumulated changes.</p>`,
    ).catch(() => {});

    runSponsorMonitorJob(source, true).catch((err) => {
      log.error({ err }, `[SponsorMonitorJob] ${isStartup ? "Startup catch-up" : "Backfill"} job failed.`);
    });
  } catch (err) {
    log.error({ err }, "[SponsorMonitorJob] checkMissedJobsAndCatchUp failed.");
  }
}

export function startSponsorMonitorCron(): void {
  seedInitialDigest().catch((err) => {
    log.error({ err }, "[SponsorMonitorJob] Error in initial digest seed");
  });

  const sponsorCutover = (process.env.CUTOVER_SPONSOR_MONITOR ?? "false").trim().toLowerCase();
  if (sponsorCutover !== "true" && sponsorCutover !== "1") {
    cron.schedule("30 0 * * 1-5", () => {
      log.info(`[SponsorMonitorJob] Cron trigger fired at ${new Date().toISOString()}`);
      runSponsorMonitorJob("cron", true).catch((err) => {
        log.error({ err }, "[SponsorMonitorJob] Unhandled error in cron execution");
      });
    }, {
      timezone: "UTC",
    });
  } else {
    log.info("[SponsorMonitorJob] Skipping inline cron initialization; scheduler owns this job.");
  }

  const drainCutover = (process.env.CUTOVER_NOTIFICATION_DRAIN ?? "false").trim().toLowerCase();
  if (drainCutover !== "true" && drainCutover !== "1") {
    cron.schedule("0 * * * *", () => {
      processQueuedEngineEvents().catch((err: any) => {
        log.error({ err }, "[NotificationEngine] Error processing queued engine events");
      });
    }, {
      timezone: "UTC",
    });
    log.info("[SponsorMonitorJob] Notification drain inline cron registered (CUTOVER_NOTIFICATION_DRAIN not set).");
  } else {
    log.info("[SponsorMonitorJob] Notification drain inline cron suppressed — owned by central scheduler.");
  }

  log.info("[SponsorMonitorJob] Cron setup complete.");

  // Startup catch-up: 2 minutes after boot, check for missed weekday jobs.
  // On Autoscale deployments the in-process cron fires into a dead server —
  // this self-heals by triggering the job immediately on any cold start that
  // finds a missed day in the last 7 weekdays.
  setTimeout(() => {
    checkMissedJobsAndCatchUp().catch((err) => {
      log.error({ err }, "[SponsorMonitorJob] Startup catch-up check failed unexpectedly.");
    });
  }, 2 * 60 * 1000); // 2 min — lets DB migrations and search index finish first

  // Periodic backfill: every 6 hours, check for missed weekday jobs.
  // Unlike the startup catch-up (fires once on cold start), this ensures
  // gaps are detected even on long-running servers that never restart.
  setInterval(() => {
    checkMissedJobsAndCatchUp("backfill").catch((err) => {
      log.error({ err }, "[SponsorMonitorJob] Periodic backfill check failed.");
    });
  }, BACKFILL_INTERVAL_MS);
  log.info(`[SponsorMonitorJob] Periodic backfill registered (every ${BACKFILL_INTERVAL_MS / 3600000} hours).`);
}

export async function isJobRunning(): Promise<boolean> {
  return await isLockActive("sponsorMonitorJob");
}

export async function checkAndTriggerIfNeeded(startup = false): Promise<void> {
  const now = Date.now();
  // Startup calls bypass the per-hour throttle so the first check after a restart
  // fires immediately (after the 5-minute warm-up delay set in routes.ts).
  if (!startup && now - lastRequestCheckTime < REQUEST_CHECK_INTERVAL_MS) {
    return;
  }
  if (!startup) {
    lastRequestCheckTime = now;
  }

  try {
    if (!isWeekday()) return;
    const alreadyRan = await hasTodayJobSucceeded();
    if (alreadyRan === null || alreadyRan) return;

    const utcHour = new Date().getUTCHours();
    const utcMinute = new Date().getUTCMinutes();

    if (!startup) {
      // Regular hourly check: defer to cron during the midnight window (00:00–01:00 UTC).
      if (utcHour < 1) return;
    } else {
      // Startup catchup: skip only the exact cron execution window (00:20–00:45 UTC)
      // to avoid racing with a cron that is actively running. The table-backed lock inside
      // runSponsorMonitorJob would block a duplicate run anyway, but this avoids noise.
      if (utcHour === 0 && utcMinute >= 20 && utcMinute < 45) {
        log.info("[SponsorMonitorJob] Startup catchup: cron window active (00:20–00:45 UTC), deferring.");
        return;
      }
    }

    const source = startup ? "startup-catchup" : "request-trigger";
    log.info(`[SponsorMonitorJob] ${startup ? "Startup-catchup" : "Request"}-triggered check: today's job has not run. Triggering now (source: ${source})...`);
    runSponsorMonitorJob(source).catch((err) => {
      log.error({ err }, `[SponsorMonitorJob] ${startup ? "Startup-catchup" : "Request"}-triggered job error`);
    });
  } catch (err) {
    log.error({ err }, "[SponsorMonitorJob] Trigger check error");
  }
}
