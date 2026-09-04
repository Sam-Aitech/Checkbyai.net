import type { Express } from "express";
import { logger } from "../../utils/logger";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { requireRole } from "../../middleware/roleGuard";
import { storage } from "../../storage";
export function registerSystemController(app: Express): void {
  app.get('/api/admin/system-health', requireRole("admin"), async (req, res) => {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();

      let dbStatus = 'healthy';
      let dbConnectionCount = 0;
      try {
        const result = await db.execute(sql`SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()`);
        dbConnectionCount = Number((result.rows[0] as any)?.count || 0);
      } catch (e) {
        dbStatus = 'error';
      }

      const stats = await storage.getStats();

      res.json({
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
        uptime: Math.round(uptime),
        database: {
          status: dbStatus,
          connections: dbConnectionCount,
        },
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching system health:");
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  app.get('/api/admin/system-settings', requireRole("admin"), async (_req, res) => {
    try {
      const settings = await storage.getAllSystemSettings();
      res.json(settings);
    } catch (error) {
      logger.error({ err: error }, "Error fetching system settings:");
      res.status(500).json({ message: "Failed to fetch system settings" });
    }
  });

  const ALLOWED_SYSTEM_SETTINGS = ['defaultDailyLimit', 'notifications_paused'] as const;

  app.patch('/api/admin/system-settings/:key', requireRole("admin"), async (req: any, res) => {
    try {
      const { key } = req.params;
      if (!ALLOWED_SYSTEM_SETTINGS.includes(key as typeof ALLOWED_SYSTEM_SETTINGS[number])) {
        return res.status(400).json({ message: `Invalid setting key: '${key}'. Allowed: ${ALLOWED_SYSTEM_SETTINGS.join(', ')}` });
      }
      const { value } = req.body;
      if (value === undefined || value === null) {
        return res.status(400).json({ message: 'value is required' });
      }
      await storage.setSystemSetting(key, String(value));
      res.json({ message: `Setting '${key}' updated`, key, value: String(value) });
    } catch (error) {
      logger.error({ err: error }, "Error updating system setting:");
      res.status(500).json({ message: "Failed to update system setting" });
    }
  });
}
