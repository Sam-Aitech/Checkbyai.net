import type { Express } from "express";
import { logger } from "../../utils/logger";
import type { SponsorChange } from "../../utils/sponsorListFetcher";
import * as crypto from "crypto";
import { db } from "../../db";
import { sql, eq, and, desc, gte } from "drizzle-orm";
import {
  sponsorCanonical,
  sponsorChanges,
  companyWatches,
  notificationLog,
  monitorJobRuns,
  csvArchive,
} from "@shared/schema";
import { requireRole } from "../../middleware/roleGuard";
import { checkBinaryHealth } from "../../utils/binaryRunner";
import { isJobRunning, getLastRunInfo, runSponsorMonitorJob } from "../../utils/sponsorMonitorJob";
import {
  buildDiagnosticsReport,
  forceReleaseSponsorMonitorLock,
  type ForceUnlockReport,
} from "../../utils/sponsorMonitorDiagnostics";
import { rebuildSponsorIndex } from "../../utils/sponsorSearch";
import { isQueueAvailable, getSponsorRefreshQueue } from "../../services/jobQueue";
import { cacheFlushPattern } from "../../utils/redisClient";

type InitStage =
  | "pending"
  | "downloading"
  | "inserting"
  | "rebuilding_index"
  | "done"
  | "failed";

interface InitJobState {
  jobId: string;
  stage: InitStage;
  rowsInserted: number;
  batchesComplete: number;
  estimatedTotalBatches: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  snapshotDate: string | null;
}

const activeInitJobs = new Map<string, InitJobState>();

function scheduleInitJobCleanup(jobId: string): void {
  setTimeout(() => activeInitJobs.delete(jobId), 30 * 60 * 1000);
}

async function runInitJob(jobId: string, today: string): Promise<void> {
  const state = activeInitJobs.get(jobId);
  if (!state) return;

  try {
    state.stage = "downloading";
    logger.info(`[SponsorMonitor][${jobId}] Triggering monitor job for ${today}`);

    await runSponsorMonitorJob("manual");

    state.stage = "done";
    state.completedAt = Date.now();
    logger.info(`[SponsorMonitor][${jobId}] Monitor job complete for ${today}`);

  } catch (err: unknown) {
    state.stage = "failed";
    state.error = (err instanceof Error ? err.message : String(err)) || "Unknown error during initialization";
    state.completedAt = Date.now();
    logger.error({ err }, `[SponsorMonitor][${jobId}] Initialization failed:`);
  } finally {
    scheduleInitJobCleanup(jobId);
  }
}

export function registerSponsorMonitorController(app: Express): void {
  app.post('/api/admin/sponsor-monitor/run', requireRole("admin"), async (req: any, res) => {
    try {
      if (await isJobRunning()) {
        return res.status(409).json({ message: "Sponsor monitor job is already running. Please wait for it to finish." });
      }

      const queue = getSponsorRefreshQueue();

      if (isQueueAvailable() && queue) {
        const job = await queue.add('refresh-sponsors', {
          triggeredBy: req.user?.id || 'unknown',
          timestamp: new Date().toISOString()
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 10,
        });

        return res.status(202).json({
          message: "Sponsor monitor job started via queue.",
          jobId: job.id,
          status: "accepted",
          mode: "bullmq",
        });
      }

      logger.warn("[SponsorMonitor] Redis unavailable — running sponsor sync inline.");
      runSponsorMonitorJob("admin-manual", true).catch((err) =>
        logger.error({ err }, "[SponsorMonitor] Inline run error:")
      );

      return res.status(202).json({
        message: "Sponsor monitor job started inline (Redis unavailable).",
        status: "accepted",
        mode: "inline",
      });

    } catch (error) {
      logger.error({ err: error }, "Error triggering sponsor monitor job:");
      res.status(500).json({ message: "Failed to trigger sponsor monitor job." });
    }
  });

  app.get('/api/admin/jobs/:jobId/progress', requireRole("admin"), async (req: any, res) => {
    try {
      const { jobId } = req.params;
      const queue = getSponsorRefreshQueue();

      if (!isQueueAvailable() || !queue) {
        return res.status(503).json({ message: "Job queue unavailable (Redis not configured)." });
      }

      const job = await queue.getJob(jobId);

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      const progress = job.progress;
      const state = await job.getState();

      res.json({ jobId: job.id, progress, status: state, data: job.data });
    } catch (error) {
      logger.error({ err: error }, "Error getting job progress:");
      res.status(500).json({ message: "Failed to get job progress." });
    }
  });

  app.post('/api/admin/sponsor-monitor/release-lock', requireRole("admin"), async (req: any, res) => {
    try {
      const deleteResult = await db.execute(
        sql`DELETE FROM job_locks WHERE job_name = 'sponsorMonitorJob'`
      );
      const released = deleteResult.rowCount !== null && deleteResult.rowCount > 0;

      const message = released
        ? "Job lock was held in job_locks table and has been force-released. You can now trigger a new run."
        : "No active lock for 'sponsorMonitorJob' was found in the job_locks table.";

      logger.warn(`[SponsorMonitorJob] Admin force-release: ${message}`);
      res.json({ released, message });
    } catch (error: unknown) {
      logger.error({ err: error }, "Error releasing advisory lock:");
      res.status(500).json({ message: "Failed to release lock: " + (error instanceof Error ? error.message : "") });
    }
  });

  app.get('/api/admin/sponsor-monitor/diagnostics', requireRole("admin"), async (_req, res) => {
    try {
      const report = await buildDiagnosticsReport();
      const httpStatus = report.overall === "fail" ? 503 : 200;
      res.status(httpStatus).json(report);
    } catch (error: unknown) {
      console.error("Error building sponsor monitor diagnostics:", error);
      res.status(500).json({
        message: "Failed to build diagnostics: " + (error instanceof Error ? error.message : String(error)),
      });
    }
  });

  app.post('/api/admin/sponsor-monitor/force-unlock', requireRole("admin"), async (_req, res) => {
    try {
      const report: ForceUnlockReport = await forceReleaseSponsorMonitorLock();
      const httpStatus = report.zombieTerminated ? 200 : 409;
      console.warn(
        `[SponsorMonitor] force-unlock: ${report.reason} — ${report.message}`,
      );
      res.status(httpStatus).json(report);
    } catch (error: unknown) {
      console.error("Error force-releasing advisory lock:", error);
      res.status(500).json({
        message: "Failed to force-release lock: " + (error instanceof Error ? error.message : String(error)),
      });
    }
  });

  app.get('/api/admin/sponsor-monitor/binary-health', requireRole("admin"), async (_req, res) => {
    try {
      const health = await checkBinaryHealth();
      const allInstalled = health.qsv.installed && health.csvdiff.installed;
      res.status(allInstalled ? 200 : 206).json({
        allInstalled,
        qsv: health.qsv,
        csvdiff: health.csvdiff,
        setupCommand: "npm run setup:binaries",
      });
    } catch (error: unknown) {
      res.status(500).json({ message: "Binary health check failed: " + (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post('/api/admin/sponsor-monitor/initialize', requireRole("admin"), async (req: any, res) => {
    try {
      for (const [, job] of activeInitJobs) {
        if (job.stage !== "done" && job.stage !== "failed") {
          return res.status(409).json({
            message: "An initialization job is already running.",
            jobId: job.jobId,
          });
        }
      }

      try {
        const activeLock = await db.execute(sql`
          SELECT locked_at, locked_by, expires_at
          FROM job_locks
          WHERE job_name = 'sponsorMonitorJob' AND expires_at > NOW()
        `);
        if (activeLock.rows.length > 0) {
          const lock = activeLock.rows[0] as { locked_at: Date, locked_by: string, expires_at: Date };
          logger.info(`[SponsorMonitor] Active lock found for sponsorMonitorJob: locked_by ${lock.locked_by}, expires_at ${lock.expires_at}`);
        }
      } catch (lockCheckErr: any) {
        logger.warn({ errMsg: lockCheckErr.message }, '[SponsorMonitor] Pre-flight lock check failed (non-fatal):');
      }

      const jobId = crypto.randomUUID();
      const today = new Date().toISOString().split("T")[0];

      const state: InitJobState = {
        jobId,
        stage: "pending",
        rowsInserted: 0,
        batchesComplete: 0,
        estimatedTotalBatches: 25,
        startedAt: Date.now(),
        completedAt: null,
        error: null,
        snapshotDate: today,
      };
      activeInitJobs.set(jobId, state);

      runInitJob(jobId, today).catch((err) => {
        logger.error({ err }, `[SponsorMonitor] runInitJob uncaught error for ${jobId}:`);
      });

      return res.status(202).json({
        message: "Initialization started. Poll /api/admin/sponsor-monitor/init-progress/:jobId for status.",
        jobId,
        snapshotDate: today,
      });

    } catch (error: unknown) {
      logger.error({ err: error }, "[SponsorMonitor] Failed to start initialization:");
      return res.status(500).json({ message: "Failed to start initialization: " + (error instanceof Error ? error.message : "") });
    }
  });

  app.get('/api/admin/sponsor-monitor/init-progress/:jobId', requireRole("admin"), (req: any, res) => {
    const { jobId } = req.params;
    const state = activeInitJobs.get(jobId);

    if (!state) {
      return res.status(404).json({ message: "Job not found or already expired (>30 min)." });
    }

    const elapsedMs = Date.now() - state.startedAt;

    let progressPct: number;
    if (state.stage === "done") {
      progressPct = 100;
    } else if (state.stage === "rebuilding_index") {
      progressPct = 95;
    } else if (state.stage === "failed") {
      progressPct = 0;
    } else {
      const raw = state.estimatedTotalBatches > 0
        ? Math.round((state.batchesComplete / state.estimatedTotalBatches) * 90)
        : 0;
      progressPct = Math.min(raw, 90);
    }

    return res.json({
      jobId: state.jobId,
      stage: state.stage,
      rowsInserted: state.rowsInserted,
      batchesComplete: state.batchesComplete,
      estimatedTotalBatches: state.estimatedTotalBatches,
      progressPct,
      elapsedMs,
      error: state.error,
      snapshotDate: state.snapshotDate,
      done: state.stage === "done" || state.stage === "failed",
    });
  });

  app.get('/api/admin/sponsor-monitor/status', requireRole("admin"), async (req: any, res) => {
    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sponsorCanonical);
      const snapshotRecordCount = countResult[0]?.count ?? 0;

      const archiveResult = await db
        .select({ snapshotDate: csvArchive.snapshotDate })
        .from(csvArchive)
        .orderBy(desc(csvArchive.snapshotDate))
        .limit(1);
      const latestDate = archiveResult[0]?.snapshotDate ?? null;

      const lastRunChanges = await db
        .select({
          changeType: sponsorChanges.changeType,
          count: sql<number>`count(*)::int`,
          snapshotDate: sponsorChanges.snapshotDate,
        })
        .from(sponsorChanges)
        .groupBy(sponsorChanges.snapshotDate, sponsorChanges.changeType)
        .orderBy(desc(sponsorChanges.snapshotDate))
        .limit(20);

      let lastRunDate: string | null = null;
      const lastRunSummary: Record<string, number> = {};
      if (lastRunChanges.length > 0) {
        lastRunDate = lastRunChanges[0].snapshotDate;
        for (const row of lastRunChanges) {
          if (row.snapshotDate === lastRunDate) {
            lastRunSummary[row.changeType] = row.count;
          }
        }
      }

      const lastRunMemory = getLastRunInfo();

      const lastRunDb = await db
        .select()
        .from(monitorJobRuns)
        .orderBy(desc(monitorJobRuns.startedAt))
        .limit(1);
      const lastRunDbRow = lastRunDb[0] ?? null;

      const activeWatchResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(companyWatches)
        .where(eq(companyWatches.isActive, true));
      const activeWatchCount = activeWatchResult[0]?.count ?? 0;

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const notifResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationLog)
        .where(
          and(
            eq(notificationLog.status, "sent"),
            gte(notificationLog.sentAt, oneDayAgo)
          )
        );
      const notificationsSent24h = notifResult[0]?.count ?? 0;

      const lastRun = lastRunMemory ?? (lastRunDbRow ? {
        date:             lastRunDbRow.runDate,
        success:          lastRunDbRow.status === "success",
        error:            lastRunDbRow.errorMessage ?? undefined,
        recordsProcessed: lastRunDbRow.recordsProcessed ?? 0,
        changesDetected:  lastRunDbRow.changesDetected ?? 0,
        durationMs:       lastRunDbRow.durationMs ?? undefined,
      } : (lastRunDate ? { date: lastRunDate, success: true, changes: lastRunSummary } : null));

      res.json({
        latestSnapshot: latestDate,
        snapshotRecordCount,
        lastRun,
        activeWatchCount,
        notificationsSent24h,
        jobRunning: await isJobRunning(),
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching sponsor monitor status:");
      res.status(500).json({ message: "Failed to fetch sponsor monitor status." });
    }
  });

  app.get('/api/admin/sponsor-monitor/job-history', requireRole("admin"), async (_req: any, res) => {
    try {
      const history = await db
        .select()
        .from(monitorJobRuns)
        .orderBy(desc(monitorJobRuns.startedAt))
        .limit(10);
      return res.json(history);
    } catch (error: unknown) {
      return res.status(500).json({ message: "Failed to fetch job history: " + (error instanceof Error ? error.message : "") });
    }
  });

  app.get('/api/admin/sponsor-monitor/recent-changes', requireRole("admin"), async (req: any, res) => {
    try {
      const changes = await db
        .select({
          id: sponsorChanges.id,
          organisationName: sponsorChanges.organisationName,
          changeType: sponsorChanges.changeType,
          previousValue: sponsorChanges.previousValue,
          newValue: sponsorChanges.newValue,
          detectedAt: sponsorChanges.detectedAt,
          snapshotDate: sponsorChanges.snapshotDate,
        })
        .from(sponsorChanges)
        .orderBy(desc(sponsorChanges.detectedAt))
        .limit(50);
      res.json(changes);
    } catch (error) {
      logger.error({ err: error }, "Error fetching recent changes:");
      res.status(500).json({ message: "Failed to fetch recent changes." });
    }
  });

  app.get('/api/admin/sponsor-monitor/top-watched', requireRole("admin"), async (req: any, res) => {
    try {
      const topWatched = await db
        .select({
          organisationName: companyWatches.organisationName,
          watcherCount: sql<number>`count(*)::int`,
        })
        .from(companyWatches)
        .where(eq(companyWatches.isActive, true))
        .groupBy(companyWatches.organisationName)
        .orderBy(desc(sql`count(*)`))
        .limit(20);
      res.json(topWatched);
    } catch (error) {
      logger.error({ err: error }, "Error fetching top watched:");
      res.status(500).json({ message: "Failed to fetch top watched companies." });
    }
  });

  app.get('/api/admin/sponsor-monitor/notification-stats', requireRole("admin"), async (req: any, res) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const stats = await db
        .select({
          channel: notificationLog.channel,
          status: notificationLog.status,
          count: sql<number>`count(*)::int`,
          day: sql<string>`date_trunc('day', ${notificationLog.sentAt})::date::text`,
        })
        .from(notificationLog)
        .where(gte(notificationLog.sentAt, sevenDaysAgo))
        .groupBy(notificationLog.channel, notificationLog.status, sql`date_trunc('day', ${notificationLog.sentAt})`)
        .orderBy(desc(sql`date_trunc('day', ${notificationLog.sentAt})`));
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Error fetching notification stats:");
      res.status(500).json({ message: "Failed to fetch notification stats." });
    }
  });

  app.get('/api/admin/sponsor-monitor/storage', requireRole("admin"), async (req: any, res) => {
    try {
      const [canonicalCount, archiveStats] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(sponsorCanonical),
        db.select({
          earliest: sql<string>`min(${csvArchive.snapshotDate})::text`,
          latest:   sql<string>`max(${csvArchive.snapshotDate})::text`,
          count:    sql<number>`count(*)::int`,
        }).from(csvArchive).where(eq(csvArchive.isValid, true)),
      ]);

      res.json({
        totalRecords:      canonicalCount[0]?.count ?? 0,
        earliestSnapshot:  archiveStats[0]?.earliest || null,
        latestSnapshot:    archiveStats[0]?.latest || null,
        snapshotCount:     archiveStats[0]?.count ?? 0,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching sponsor storage stats:");
      res.status(500).json({ message: "Failed to fetch storage stats." });
    }
  });

  app.post('/api/admin/sponsor-monitor/cleanup', requireRole("admin"), (_req: any, res) => {
    res.status(410).json({
      message: "This endpoint is deprecated. The sponsor_list table is being retired. " +
               "Data is now stored in sponsorCanonical (per-company state) and csv_archive (daily CSV files on disk).",
    });
  });

  app.post('/api/admin/migrate-canonical', requireRole("admin"), (_req: any, res) => {
    res.status(410).json({
      message: "This migration route is no longer needed. The nightly monitor job (or the Initialize button) " +
               "automatically seeds sponsorCanonical on its first run via the state machine.",
    });
  });

  app.post('/api/admin/sponsor-monitor/rebuild-index', requireRole("admin"), async (_req: any, res) => {
    try {
      await rebuildSponsorIndex();
      await cacheFlushPattern("sponsors:*");
      const count = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(sponsorCanonical)
        .where(sql`${sponsorCanonical.status} IN ('ACTIVE', 'NEWLY_GRANTED')`))[0]?.n ?? 0;
      res.json({ count, message: `Search index rebuilt with ${count.toLocaleString()} active sponsors.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: `Failed to rebuild index: ${msg}` });
    }
  });

  app.post('/api/admin/sponsor-monitor/test', requireRole("admin"), async (req: any, res) => {
    try {
      const { organisationName, changeType, previousValue, newValue } = req.body;

      if (!organisationName || !changeType) {
        return res.status(400).json({ message: "organisationName and changeType are required." });
      }

      const validTypes = ["REMOVED_REVOKED", "GRACE_PERIOD", "NEW_LICENCE", "RE_ACTIVATED", "DOWNGRADED", "UPGRADED", "ROUTE_CHANGE", "NAME_CHANGE"];
      if (!validTypes.includes(changeType)) {
        return res.status(400).json({ message: `changeType must be one of: ${validTypes.join(", ")}` });
      }

      const today = new Date().toISOString().split("T")[0];
      const [savedChange] = await db
        .insert(sponsorChanges)
        .values({
          organisationName,
          changeType,
          previousValue: previousValue || null,
          newValue: newValue || null,
          snapshotDate: today,
        })
        .returning();

      const { notifyUsersOfEvent } = await import("../../services/notificationEngine");
      const notifResult = await notifyUsersOfEvent(savedChange as SponsorChange);

      res.json({
        message: "Test change created and notifications dispatched.",
        change: savedChange,
        notifications: notifResult,
      });
    } catch (error) {
      logger.error({ err: error }, "Error running sponsor monitor test:");
      res.status(500).json({ message: "Failed to run test detection cycle." });
    }
  });
}
