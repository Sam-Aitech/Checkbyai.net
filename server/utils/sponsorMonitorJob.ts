import cron from "node-cron";
import { db } from "../db";
import { dailyDigest, monitorJobRuns, diffResults, sponsorCanonical, csvArchive } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { discoverCsvUrl, generateFingerprint, type SponsorChange } from "./sponsorListFetcher";
import { ensureTodaysArchive, getArchiveForDate, parseCsvFile } from "./csvArchiver";
import { runCsvDiff, type CsvDiffResult } from "./binaryRunner";
import { applyStateMachine } from "./sponsorStateMachine";
import { rebuildSponsorIndex } from "./sponsorSearch";
import { cacheFlushPattern } from "./redisClient";
import { processDelayedNotifications } from "./notificationDispatcher";
import { notifyUsersOfEvent, processQueuedEngineEvents } from "../services/notificationEngine";
import { generateHeadline, type RawDigestData } from "../services/aiDigest";
import { withRetry } from "./dbRetry";
import { sendAdminAlert } from "./adminAlert";
import { logger } from "./logger";

const log = logger.child({ module: "SponsorMonitorJob" });

// Distributed advisory lock key — must be a unique integer per job.
// Prevents duplicate execution across multiple server instances (horizontal scaling).
// REPLACES: module-level `isRunning = false` which only prevented single-instance
// races and made horizontal deployment impossible (2 pods = 2 jobs = duplicate data).
const SPONSOR_MONITOR_LOCK_KEY = 7483920; // Unique magic int for this job

let lastRequestCheckTime = 0;
const REQUEST_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Attempts to acquire a PostgreSQL session-level advisory lock.
 * Returns true if the lock was acquired, false if another instance holds it.
 * The lock is automatically released if the DB connection drops (crash-safe).
 *
 * Uses pg_try_advisory_lock() — atomic, non-blocking. A single SQL call that
 * both checks and acquires in one step, eliminating the TOCTOU race that
 * existed when using a separate pg_locks SELECT + pg_advisory_lock() pair.
 */
async function tryAcquireJobLock(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT pg_try_advisory_lock(${SPONSOR_MONITOR_LOCK_KEY}) AS acquired`
    );
    return (result.rows[0] as any)?.acquired === true;
  } catch (err) {
    console.error('[SponsorMonitorJob] Failed to acquire advisory lock:', err);
    return false;
  }
}

async function releaseJobLock(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(${SPONSOR_MONITOR_LOCK_KEY})`).catch(err => {
    console.error('[SponsorMonitorJob] Failed to release advisory lock:', err);
  });
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
  console.log("[SponsorMonitorJob] Admin failure alert sent.");
}

async function sendAdminJobCompleteEmail(result: {
  success: boolean;
  recordsProcessed: number;
  changesDetected?: number;
  changeSummary?: Record<string, number>;
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
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${result.notificationsSent} sent, ${result.notificationsSkipped} skipped, ${result.notificationsFailed} failed</td>
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
    console.log(`[SponsorMonitorJob] Job ${isSuccess ? "success" : "failure"} email sent.`);
  } catch (err) {
    console.error("[SponsorMonitorJob] Error sending job completion email:", err);
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
    console.warn("[SponsorMonitorJob] Failed to save diff result (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

export async function runSponsorMonitorJob(source: string = "cron", notifyOnFailure = false): Promise<{
  success: boolean;
  recordsProcessed: number;
  changes: Record<string, number>;
  notificationsSent: number;
  notificationsSkipped: number;
  notificationsFailed: number;
  error?: string;
}> {
  const result = {
    success: false,
    recordsProcessed: 0,
    changes: {} as Record<string, number>,
    notificationsSent: 0,
    notificationsSkipped: 0,
    notificationsFailed: 0,
  };


  // ── Distributed lock acquisition (replaces in-process isRunning flag) ─────
  // pg_try_advisory_lock() is atomic: across any number of API server instances,
  // only ONE can acquire this lock at a time. If another pod is already running
  // the job, we get false immediately instead of running a duplicate pass.
  const lockAcquired = await tryAcquireJobLock();
  if (!lockAcquired) {
    const msg = "Another instance is already running the sponsor monitor job. Skipping.";
    console.warn(`[SponsorMonitorJob] ${msg}`);
    return { ...result, error: msg };
  }

  const startTime = Date.now();
  const JOB_TIMEOUT_MS = 25 * 60 * 1000; // 25-minute hard ceiling
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Watchdog + lock-release wrapper ──────────────────────────────────────
  // Promise.race ensures that if runJobCore() stalls (e.g. a DB insert hangs),
  // the timeout rejects after 25 min. The finally block ALWAYS runs, releasing
  // the advisory lock even on timeout.
  try {
    const watchdog = new Promise<never>((_, reject) => {
      watchdogTimer = setTimeout(
        () => reject(new Error(`Job timed out after ${JOB_TIMEOUT_MS / 60000} minutes. Advisory lock released.`)),
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
          completedAt: failTime,
        }).onConflictDoUpdate({
          target: monitorJobRuns.runDate,
          set: {
            status: "failed",
            errorMessage: errorMsg,
            durationMs: failDuration,
            completedAt: failTime,
          },
        });
      }, "Log job failure");
    } catch (logErr) {
      console.error("[SponsorMonitorJob] Failed to log job failure:", logErr);
    }
    if (notifyOnFailure) {
      sendAdminJobCompleteEmail(
        { success: false, recordsProcessed: result.recordsProcessed, notificationsSent: result.notificationsSent, notificationsSkipped: result.notificationsSkipped, notificationsFailed: result.notificationsFailed, error: errorMsg },
        failDuration,
        source
      ).catch((e) => console.error('[SponsorMonitorJob] Failed to send admin failure alert email:', e));
    }
    Object.assign(result, { error: errorMsg });
    return result;
  } finally {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    await releaseJobLock();
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

    console.log(`[SponsorMonitorJob] === Daily sponsor monitor check starting (triggered by: ${source}) ===`);

    // ── ETL integrity check (migration 0014) ───────────────────────────────────
    // Detect archives that were downloaded in a prior run but whose state machine
    // never completed (PENDING_SYNC). This happens when the server crashed between
    // the CSV download and the state machine write. Operators should re-trigger
    // the job manually to re-process these dates.
    const staleArchives = await db
      .select({ snapshotDate: csvArchive.snapshotDate })
      .from(csvArchive)
      .where(eq(csvArchive.syncStatus, "PENDING_SYNC"));
    if (staleArchives.length > 0) {
      const staleDates = staleArchives.map((r) => r.snapshotDate).join(", ");
      log.warn(
        { staleDates },
        `[SponsorMonitorJob] INTEGRITY WARNING: ${staleArchives.length} archive(s) stuck at PENDING_SYNC — state machine may not have run for: ${staleDates}. ` +
        `Trigger a manual re-run via POST /api/admin/sponsor-monitor/run to reprocess.`,
      );
    }

    // ── Idempotency check ──────────────────────────────────────────────────────
    const existingRun = await db
      .select({ id: monitorJobRuns.id, status: monitorJobRuns.status })
      .from(monitorJobRuns)
      .where(eq(monitorJobRuns.runDate, today))
      .limit(1);

    if (existingRun.length > 0 && existingRun[0].status === "success" && source === "cron") {
      const msg = `Reconciliation already completed successfully for ${today}. Skipping duplicate cron run.`;
      console.log(`[SponsorMonitorJob] ${msg}`);
      result.success = true;
      Object.assign(result, { error: msg });
      return;
    }

    // ── Phase 1: Discover CSV URL + archive today's file ──────────────────────
    // ensureTodaysArchive: download → qsv validate → count guard (≥100k) → DB register
    // Hard-throws on HTTP failure, truncated file, or zero bytes.
    const csvUrl = await discoverCsvUrl();
    console.log(`[SponsorMonitorJob] CSV URL discovered.`);
    const todayArchive = await ensureTodaysArchive(today, csvUrl);
    result.recordsProcessed = todayArchive.recordCount;

    // ── Phase 2: Load yesterday's archive for csvdiff ─────────────────────────
    const yesterdayArchive = await getArchiveForDate(yesterday);
    let diff: CsvDiffResult;

    if (!yesterdayArchive) {
      // First run or gap day: no previous archive to diff against.
      // Treat all today's records as additions so the state machine seeds the DB.
      console.log(
        `[SponsorMonitorJob] No archive for ${yesterday} — first run detected. ` +
        `Treating all ${todayArchive.recordCount.toLocaleString()} records as NEW_LICENCE.`,
      );
      diff = await buildFirstRunDiff(todayArchive.filePath);
    } else {
      // Standard night: diff yesterday vs today using the Go csvdiff binary.
      console.log(
        `[SponsorMonitorJob] Diffing ${yesterday} (${yesterdayArchive.recordCount.toLocaleString()}) ` +
        `vs ${today} (${todayArchive.recordCount.toLocaleString()}) …`,
      );
      diff = await runCsvDiff(
        yesterdayArchive.fingerprintedFilePath,
        todayArchive.fingerprintedFilePath,
        ["fingerprint"],
      );
      console.log(
        `[SponsorMonitorJob] csvdiff: +${diff.Additions.length} added, ` +
        `-${diff.Deletions.length} removed, ~${diff.Modifications.length} modified ` +
        `(${diff.durationMs}ms)`,
      );
    }

    // Save diff metadata to diff_results table (non-fatal).
    await saveDiffResult(today, diff);

    // ── Phase 3: State machine ─────────────────────────────────────────────────
    // applyStateMachine handles all DB writes (canonical + sponsorChanges) internally.
    // syncStatus is updated to SYNCED on success or FAILED on error so that the
    // ETL integrity check on the next run can detect incomplete state machine runs.
    console.log("[SponsorMonitorJob] Applying state machine…");
    let smResult: Awaited<ReturnType<typeof applyStateMachine>>;
    try {
      smResult = await applyStateMachine(diff, today, todayArchive.fingerprintedFilePath);
      // Mark this archive as fully processed — visible to all server instances.
      await db
        .update(csvArchive)
        .set({ syncStatus: "SYNCED" })
        .where(eq(csvArchive.snapshotDate, today))
        .catch((err: unknown) =>
          console.warn("[SponsorMonitorJob] Failed to mark archive SYNCED (non-fatal):", err instanceof Error ? err.message : String(err))
        );
    } catch (smErr: unknown) {
      // Mark the archive as FAILED so the integrity check surfaces it clearly.
      await db
        .update(csvArchive)
        .set({ syncStatus: "FAILED" })
        .where(eq(csvArchive.snapshotDate, today))
        .catch((err: unknown) =>
          console.warn("[SponsorMonitorJob] Failed to mark archive FAILED (non-fatal):", err instanceof Error ? err.message : String(err))
        );
      throw smErr; // re-throw so the outer catch logs + sends admin alert
    }

    await rebuildSponsorIndex();

    // Flush stale Redis cache so the next request picks up the fresh index data.
    // Non-fatal: if Redis is down, cacheFlushPattern returns 0 silently.
    const flushed = await cacheFlushPattern("sponsors:*");
    if (flushed > 0) {
      console.log(`[SponsorMonitorJob] Flushed ${flushed} Redis cache keys after nightly rebuild.`);
    }

    const changeCounts: Record<string, number> = {};
    for (const change of smResult.changes) {
      changeCounts[change.changeType] = (changeCounts[change.changeType] || 0) + 1;
    }
    result.changes = changeCounts;

    // ── Notifications ──────────────────────────────────────────────────────────
    // Fire-and-forget via the notification engine. Checks per-event, per-channel
    // prefs (notif_prefs jsonb), applies rate limit (3/hr per user:company),
    // and sends immediately. Results logged to notif_log.
    const alertableChanges = smResult.changes.filter((c) => c.changeType !== "NAME_CHANGE");
    if (alertableChanges.length > 0) {
      console.log(`[SponsorMonitorJob] Dispatching notifications for ${alertableChanges.length} alertable changes…`);
      for (const change of alertableChanges) {
        notifyUsersOfEvent(change).catch((err: any) =>
          console.error(
            `[SponsorMonitorJob] Notification engine error for "${change.organisationName}":`,
            err?.message ?? String(err),
          )
        );
      }
    } else {
      console.log("[SponsorMonitorJob] No alertable changes today.");
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

      await db.update(dailyDigest).set({ displayedOnLanding: false });
      await db.insert(dailyDigest).values({
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

      console.log(`[SponsorMonitorJob] Daily digest generated: "${headlineResult.headline}" (model: ${headlineResult.model})`);
    } catch (digestErr: any) {
      console.error("[SponsorMonitorJob] Failed to generate daily digest:", digestErr?.message ?? String(digestErr));
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
        durationMs: finalDuration,
        completedAt: completionTime,
      }).onConflictDoUpdate({
        target: monitorJobRuns.runDate,
        set: {
          source,
          status: "success",
          recordsProcessed: result.recordsProcessed,
          changesDetected: smResult.changes.length,
          changeSummary: changeCounts,
          notificationsSent:   result.notificationsSent,
          notificationsSkipped: result.notificationsSkipped,
          notificationsFailed: result.notificationsFailed,
          durationMs: finalDuration,
          completedAt: completionTime,
        },
      });
    }, "Log job success");

    result.success = true;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[SponsorMonitorJob] === Job complete (${elapsed}s) ===\n` +
      `  Records processed: ${result.recordsProcessed.toLocaleString()}\n` +
      `  Changes detected: ${smResult.changes.length} total` +
      (Object.keys(changeCounts).length > 0
        ? ` (${Object.entries(changeCounts).map(([k, v]) => `${k}: ${v}`).join(", ")})`
        : "") + "\n" +
      `  Notifications: ${result.notificationsSent} sent, ${result.notificationsSkipped} skipped, ${result.notificationsFailed} failed`,
    );

    sendAdminJobCompleteEmail(
      {
        success: true,
        recordsProcessed: result.recordsProcessed,
        changesDetected: smResult.changes.length,
        changeSummary: changeCounts,
        notificationsSent:   result.notificationsSent,
        notificationsSkipped: result.notificationsSkipped,
        notificationsFailed: result.notificationsFailed,
      },
      Date.now() - startTime,
      source,
    ).catch((e) => console.error("[SponsorMonitorJob] Failed to send admin job completion email:", e));
  } // end runJobCore
}

export function getLastRunInfo(): LastRunInfo | null {
  return lastRunInfo;
}

async function seedInitialDigest(): Promise<void> {
  try {
    const existing = await db.select({ id: dailyDigest.id }).from(dailyDigest).limit(1);
    if (existing.length > 0) {
      console.log("[SponsorMonitorJob] Daily digest already has data, skipping seed.");
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
      console.log("[SponsorMonitorJob] No sponsor data found, cannot seed digest.");
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

    console.log(`[SponsorMonitorJob] Initial digest seeded: "${headline}" (${active} active, ${revoked} revoked sponsors)`);
  } catch (err: unknown) {
    console.error("[SponsorMonitorJob] Failed to seed initial digest:", err instanceof Error ? err.message : String(err));
  }
}

function isWeekday(): boolean {
  const day = new Date().getUTCDay();
  return day >= 1 && day <= 5;
}

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
    console.error("[SponsorMonitorJob] Error checking today's job status:", err);
    return null;
  }
}

export function startSponsorMonitorCron(): void {
  seedInitialDigest().catch((err) => {
    console.error("[SponsorMonitorJob] Error in initial digest seed:", err);
  });

  cron.schedule("30 0 * * 1-5", () => {
    console.log("[SponsorMonitorJob] Cron trigger fired at", new Date().toISOString());
    runSponsorMonitorJob("cron").catch((err) => {
      console.error("[SponsorMonitorJob] Unhandled error in cron execution:", err);
    });
  }, {
    timezone: "UTC",
  });

  cron.schedule("0 * * * *", () => {
    processDelayedNotifications().catch((err) => {
      console.error("[NotificationQueue] Error processing delayed notifications:", err);
    });
    processQueuedEngineEvents().catch((err) => {
      console.error("[NotificationEngine] Error processing queued engine events:", err);
    });
  }, {
    timezone: "UTC",
  });

  console.log("[SponsorMonitorJob] Cron jobs scheduled: daily monitor at 00:30 UTC Mon-Fri, delayed notifications hourly");
}

export async function isJobRunning(): Promise<boolean> {
  // Use DB-level advisory lock query to check if job is truly active across any node.
  // pg_locks table tracks all active locks by PID.
  try {
    const result = await db.execute(sql`
      SELECT count(*) > 0 AS locked 
      FROM pg_locks 
      WHERE locktype = 'advisory' 
        AND classid  = (${SPONSOR_MONITOR_LOCK_KEY}::bigint >> 32)::int
        AND objid    = (${SPONSOR_MONITOR_LOCK_KEY}::bigint & x'ffffffff'::bigint)::int
    `);
    return (result.rows[0] as any)?.locked === true;
  } catch (err) {
    console.error('[SponsorMonitorJob] Failed to check advisory lock:', err);
    return false;
  }
}

export async function checkAndTriggerIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastRequestCheckTime < REQUEST_CHECK_INTERVAL_MS) {
    return;
  }
  lastRequestCheckTime = now;

  try {
    if (!isWeekday()) return;
    const alreadyRan = await hasTodayJobSucceeded();
    if (alreadyRan === null || alreadyRan) return;

    const hour = new Date().getUTCHours();
    if (hour < 1) {
      return;
    }

    console.log("[SponsorMonitorJob] Request-triggered check: today's job has not run. Triggering now...");
    runSponsorMonitorJob("request-trigger").catch((err) => {
      console.error("[SponsorMonitorJob] Request-triggered job error:", err);
    });
  } catch (err) {
    console.error("[SponsorMonitorJob] Request-triggered check error:", err);
  }
}
