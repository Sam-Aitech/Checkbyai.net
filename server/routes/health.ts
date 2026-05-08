import type { Express } from "express";
import { isJobRunning, getLastRunInfo } from "../utils/sponsorMonitorJob";
import { getJobHealthSnapshot } from "../utils/jobTelemetry";

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

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      // Legacy sponsor monitor block — kept for backwards compatibility
      sponsorMonitor: {
        running: jobRunning,
        lastRun: lastRun ? {
          date: lastRun.date,
          success: lastRun.success,
          recordsProcessed: lastRun.recordsProcessed,
          changesDetected: lastRun.changesDetected,
        } : null,
      },
      // Phase 1: per-job freshness and state
      jobs,
    });
  });

  // Dedicated sponsor monitor health endpoint — useful for uptime monitors and admin dashboards.
  app.get('/api/health/sponsor-monitor', async (req, res) => {
    const lastRun = getLastRunInfo();
    const jobRunning = await isJobRunning();

    let hoursAgo: number | null = null;
    let status: "ok" | "stale" | "running" | "unknown" = "unknown";

    if (jobRunning) {
      status = "running";
    } else if (lastRun) {
      const lastRunDate = new Date(lastRun.date + "T00:00:00Z");
      hoursAgo = Math.floor((Date.now() - lastRunDate.getTime()) / (1000 * 60 * 60));
      if (lastRun.success) {
        status = hoursAgo <= 48 ? "ok" : "stale";
      } else {
        status = "stale";
      }
    }

    res.json({
      status,
      running: jobRunning,
      lastRun: lastRun
        ? {
            date: lastRun.date,
            success: lastRun.success,
            hoursAgo,
            recordsProcessed: lastRun.recordsProcessed,
            changesDetected: lastRun.changesDetected,
            notificationsSent: lastRun.notificationsSent,
            error: lastRun.error ?? null,
          }
        : null,
      nextCronUtc: "Mon–Fri 00:30 UTC",
      timestamp: new Date().toISOString(),
    });
  });
}
