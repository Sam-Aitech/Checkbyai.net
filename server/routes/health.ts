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
}
