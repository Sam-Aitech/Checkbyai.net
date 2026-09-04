import type { Express } from "express";
import { logger } from "../../utils/logger";
import { db } from "../../db";
import { sql, eq, desc, asc } from "drizzle-orm";
import {
  users,
  notifLog,
  DEFAULT_NOTIF_PREFS,
  type NotifPrefs,
} from "@shared/schema";
import { requireRole } from "../../middleware/roleGuard";
import { storage } from "../../storage";
export function registerNotificationsController(app: Express): void {
  app.get('/api/admin/notifications/status', requireRole("admin"), async (_req, res) => {
    try {
      const value = await storage.getSystemSetting('notifications_paused');
      const paused = value === 'true';
      res.json({ paused });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching notification status:');
      res.status(500).json({ message: 'Failed to fetch notification status' });
    }
  });

  app.post('/api/admin/notifications/pause', requireRole("admin"), async (req: any, res) => {
    try {
      await storage.setSystemSetting('notifications_paused', 'true');
      logger.info(`[Admin] Notifications PAUSED by ${req.user?.email ?? req.user?.id}`);
      res.json({ paused: true });
    } catch (error) {
      logger.error({ err: error }, 'Error pausing notifications:');
      res.status(500).json({ message: 'Failed to pause notifications' });
    }
  });

  app.post('/api/admin/notifications/resume', requireRole("admin"), async (req: any, res) => {
    try {
      await storage.setSystemSetting('notifications_paused', 'false');
      logger.info(`[Admin] Notifications RESUMED by ${req.user?.email ?? req.user?.id}`);
      res.json({ paused: false });
    } catch (error) {
      logger.error({ err: error }, 'Error resuming notifications:');
      res.status(500).json({ message: 'Failed to resume notifications' });
    }
  });

  app.get('/api/admin/notifications/users', requireRole("admin"), async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
      const search = (req.query.search as string)?.trim() ?? '';
      const offset = (page - 1) * limit;

      const searchFilter = search
        ? sql`${users.email} ILIKE ${'%' + search + '%'} AND ${users.deletedAt} IS NULL`
        : sql`${users.deletedAt} IS NULL`;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: users.id,
            email: users.email,
            subscriptionStatus: users.subscriptionStatus,
            notifPrefs: users.notifPrefs,
          })
          .from(users)
          .where(searchFilter)
          .orderBy(desc(users.subscriptionStatus), asc(users.email))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(users)
          .where(searchFilter),
      ]);

      res.json({
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching notification user list:');
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });

  app.patch('/api/admin/notifications/users/:id/prefs', requireRole("admin"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const patch = req.body as Partial<NotifPrefs>;

      const [existing] = await db
        .select({ notifPrefs: users.notifPrefs })
        .from(users)
        .where(eq(users.id, id));

      if (!existing) {
        return res.status(404).json({ message: 'User not found' });
      }

      const base = (existing.notifPrefs as NotifPrefs | null) ?? DEFAULT_NOTIF_PREFS;
      const merged: NotifPrefs = { ...base };
      for (const key of Object.keys(DEFAULT_NOTIF_PREFS) as (keyof NotifPrefs)[]) {
        const v = (patch as Record<string, { enabled?: unknown; channels?: Record<string, unknown> }>)[key];
        if (!v || !merged[key]) continue;
        const nextChannels = { ...merged[key].channels };
        if (typeof v.channels === 'object' && v.channels !== null) {
          for (const ch of Object.keys(merged[key].channels) as (keyof typeof nextChannels)[]) {
            const cv = (v.channels as Record<string, unknown>)[ch];
            if (typeof cv === 'boolean') nextChannels[ch] = cv;
          }
        }
        merged[key] = {
          enabled: typeof v.enabled === 'boolean' ? v.enabled : merged[key].enabled,
          channels: nextChannels,
        };
      }

      await db
        .update(users)
        .set({ notifPrefs: merged })
        .where(eq(users.id, id));

      logger.info({ userId: id, adminId: req.user?.id }, '[Admin] notif_prefs updated for user');
      res.json({ notifPrefs: merged });
    } catch (error) {
      logger.error({ err: error }, 'Error updating notif_prefs:');
      res.status(500).json({ message: 'Failed to update preferences' });
    }
  });

  app.get('/api/admin/notifications/log', requireRole("admin"), async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 25);
      const userId = req.query.userId as string | undefined;
      const offset = (page - 1) * limit;

      const filter = userId
        ? eq(notifLog.userId, userId)
        : undefined;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: notifLog.id,
            userId: notifLog.userId,
            userEmail: users.email,
            eventType: notifLog.eventType,
            channel: notifLog.channel,
            companyName: notifLog.companyName,
            success: notifLog.success,
            errorDetails: notifLog.errorDetails,
            sentAt: notifLog.sentAt,
          })
          .from(notifLog)
          .leftJoin(users, eq(notifLog.userId, users.id))
          .where(filter)
          .orderBy(desc(notifLog.sentAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(notifLog)
          .where(filter),
      ]);

      res.json({ data: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching notif_log:');
      res.status(500).json({ message: 'Failed to fetch notification log' });
    }
  });

  app.get('/api/admin/enrichment-queue', requireRole("admin"), async (_req, res) => {
    try {
      const [statusRows, typeRows, recentFailures, stalled, totals] = await Promise.all([
        db.execute(sql`
          SELECT status, COUNT(*)::int AS count
          FROM enrichment_queue
          GROUP BY status
          ORDER BY count DESC
        `),
        db.execute(sql`
          SELECT job_type, status, COUNT(*)::int AS count
          FROM enrichment_queue
          GROUP BY job_type, status
          ORDER BY job_type, count DESC
        `),
        db.execute(sql`
          SELECT fingerprint, job_type, status, attempt_count, error_message, last_attempted_at, updated_at
          FROM enrichment_queue
          WHERE status IN ('failed', 'captcha_blocked', 'no_match')
          ORDER BY updated_at DESC
          LIMIT 15
        `),
        db.execute(sql`
          SELECT fingerprint, job_type, locked_by, locked_at
          FROM enrichment_queue
          WHERE status = 'in_progress'
            AND locked_at < NOW() - INTERVAL '30 minutes'
          ORDER BY locked_at ASC
          LIMIT 10
        `),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
          FROM enrichment_queue
        `),
      ]);

      res.json({
        statusCounts:   statusRows.rows,
        jobTypeCounts:  typeRows.rows,
        recentFailures: recentFailures.rows,
        stalled:        stalled.rows,
        total:          (totals.rows[0] as any)?.total    ?? 0,
        completed:      (totals.rows[0] as any)?.completed ?? 0,
      });
    } catch (error) {
      logger.error({ err: error }, '[Admin] enrichment-queue error:');
      res.status(500).json({ message: 'Failed to fetch enrichment queue stats' });
    }
  });
}
