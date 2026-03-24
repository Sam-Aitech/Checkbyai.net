import type { Express } from "express";
import { isJobRunning, getLastRunInfo } from "../utils/sponsorMonitorJob";

export function registerHealthRoutes(app: Express): void {
  app.get('/api/health', async (req, res) => {
    const lastRun = getLastRunInfo();
    const jobRunning = await isJobRunning();
    res.json({
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
    });
  });
}
