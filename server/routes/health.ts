import type { Express } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { monitorJobRuns, dailyDigest } from "@shared/schema";
import { isJobRunning, getLastRunInfo } from "../utils/sponsorMonitorJob";
import { getJobHealthSnapshot } from "../utils/jobTelemetry";
import { success } from "../lib/response";

const CRITICAL_JOBS = [
  "sponsorMonitorJob",
  "jobAlertJob",
  "enrichmentSeed",
  "enrichmentBatch",
  "notificationDrain",
] as const;

export function registerHealthRoutes(app: Express): void {
  app.get('/api/health', async (req, res) => {
    const lastRun = getLastRunInfo();
    const jobRunning = await isJobRunning();

    const jobs = Object.fromEntries(
      CRITICAL_JOBS.map((name) => [name, getJobHealthSnapshot(name)]),
    );

    success(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      sponsorMonitor: {
        running: jobRunning,
        lastRun: lastRun ? {
          date: lastRun.date,
          success: lastRun.success,
          recordsProcessed: lastRun.recordsProcessed,
          changesDetected: lastRun.changesDetected,
        } : null,
      },
      jobs,
    });
  });

  app.get('/api/health/sponsor-monitor', async (req, res) => {
    const lastRunMem = getLastRunInfo();
    const jobRunning = await isJobRunning();

    // Prefer DB data (survives restarts) over the in-memory snapshot.
    const [dbRunRow, latestDigestRow] = await Promise.all([
      db
        .select({
          runDate:          monitorJobRuns.runDate,
          status:           monitorJobRuns.status,
          completedAt:      monitorJobRuns.completedAt,
          startedAt:        monitorJobRuns.startedAt,
          recordsProcessed: monitorJobRuns.recordsProcessed,
          changesDetected:  monitorJobRuns.changesDetected,
          errorMessage:     monitorJobRuns.errorMessage,
        })
        .from(monitorJobRuns)
        .where(eq(monitorJobRuns.status, "success"))
        .orderBy(desc(monitorJobRuns.runDate))
        .limit(1)
        .catch(() => [] as Array<{ runDate: string; status: string; completedAt: Date | null; startedAt: Date | null; recordsProcessed: number | null; changesDetected: number | null; errorMessage: string | null }>),
      db
        .select({ snapshotDate: dailyDigest.snapshotDate })
        .from(dailyDigest)
        .orderBy(desc(dailyDigest.snapshotDate))
        .limit(1)
        .catch(() => [] as Array<{ snapshotDate: string }>),
    ]);

    const dbRun = dbRunRow[0] ?? null;
    const latestSnapshotDate = latestDigestRow[0]?.snapshotDate ?? null;

    // Determine last-successful-at from DB (precise ISO timestamp) or fall back
    // to the in-memory snapshot from the current process instance.
    const lastSuccessfulRunAt: string | null =
      dbRun?.completedAt?.toISOString() ??
      (lastRunMem?.success ? lastRunMem.date : null);

    const hoursSinceSuccess = lastSuccessfulRunAt
      ? Math.floor((Date.now() - Date.parse(lastSuccessfulRunAt)) / 3_600_000)
      : null;

    // Classify freshness: ok (<24h), warn (24–48h), critical (>48h), running, unknown.
    type FreshnessStatus = "ok" | "warn" | "critical" | "running" | "unknown";
    let freshnessStatus: FreshnessStatus = "unknown";
    let staleReason: string | null = null;

    if (jobRunning) {
      freshnessStatus = "running";
    } else if (hoursSinceSuccess !== null) {
      if (hoursSinceSuccess <= 24) {
        freshnessStatus = "ok";
      } else if (hoursSinceSuccess <= 48) {
        freshnessStatus = "warn";
        staleReason = `No successful run in ${hoursSinceSuccess}h (warn threshold: 24h).`;
      } else {
        freshnessStatus = "critical";
        staleReason = `No successful run in ${hoursSinceSuccess}h (critical threshold: 48h).`;
      }
    } else if (lastRunMem && !lastRunMem.success) {
      freshnessStatus = "warn";
      staleReason = lastRunMem.error ?? "Last run failed.";
    }

    success(res, {
      status: freshnessStatus === "ok" || freshnessStatus === "running" ? freshnessStatus : "stale",
      freshnessStatus,
      staleReason,
      running: jobRunning,
      lastSuccessfulRunAt,
      hoursSinceSuccess,
      latestSnapshotDate,
      lastRun: dbRun
        ? {
            date:             dbRun.runDate,
            completedAt:      dbRun.completedAt?.toISOString() ?? null,
            recordsProcessed: dbRun.recordsProcessed,
            changesDetected:  dbRun.changesDetected,
          }
        : lastRunMem
          ? {
              date:             lastRunMem.date,
              completedAt:      null,
              recordsProcessed: lastRunMem.recordsProcessed,
              changesDetected:  lastRunMem.changesDetected,
            }
          : null,
      nextCronUtc: "Mon–Fri 00:30 UTC",
      timestamp: new Date().toISOString(),
    });
  });
}
