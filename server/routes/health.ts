import type { Express } from "express";
import { isJobRunning, getLastRunInfo } from "../utils/sponsorMonitorJob";
import { getJobHealthSnapshot } from "../utils/jobTelemetry";
import { countMissedExpectedPublishDays } from "../utils/ukBankHolidays";
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
        // A fixed 48h cutoff false-positives every Monday after an ordinary
        // weekend (~72h) and on any bank holiday. Only flag "stale" once
        // more than one actual expected-publish weekday has been skipped.
        const missedExpectedDays = await countMissedExpectedPublishDays(lastRun.date);
        status = missedExpectedDays <= 1 ? "ok" : "stale";
      } else {
        status = "stale";
      }
    }

    success(res, {
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
