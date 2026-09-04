import type { Express } from "express";
import { logger } from "../../utils/logger";
import { db } from "../../db";
import { sql, eq, and, asc } from "drizzle-orm";
import { companyWatches, users } from "@shared/schema";
import { z } from "zod";
import { requireRole } from "../../middleware/roleGuard";
import { storage } from "../../storage";
import { sendEmailReliably } from "../../utils/resilientEmail";
import { getAppUrl } from "../../utils/appUrl";
import { getWatchLimit } from "../../utils/tierConfig";
export function registerUsersController(app: Express): void {
  app.get('/api/admin/users', requireRole("admin"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const search = req.query.search as string | undefined;
      const paidOnly = req.query.paidOnly === 'true';

      const result = await storage.getPaginatedUsers({ page, limit, search, paidOnly });
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Error fetching users:");
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/admin/users/:id/restrict', requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { restricted, reason } = req.body;

      await storage.updateUserRestriction(userId, restricted, reason);

      const targetUser = await storage.getUser(userId);
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && targetUser?.email) {
        const html = restricted
          ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">Account Restricted</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Your CheckByAI account has been restricted${reason ? `: <strong>${reason}</strong>` : '.'}</p>
                <p style="color:#333;font-size:15px;">If you believe this is a mistake, please contact us at <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a>.</p>
              </div>
            </div>`
          : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#16a34a 0%,#22c55e 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">Account Restriction Removed</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Good news — the restriction on your CheckByAI account has been lifted. You now have full access again.</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${getAppUrl()}/dashboard" style="background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Dashboard</a>
                </div>
                <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
              </div>
            </div>`;
        sendEmailReliably(
          {
            from: "CheckByAI <noreply@checkbyai.net>",
            to: [targetUser.email],
            subject: restricted ? "Your CheckByAI account has been restricted" : "Your CheckByAI account restriction has been removed",
            html,
          },
          "[Restrict]",
        );
      }

      res.json({
        message: restricted ? 'User has been restricted' : 'User restriction removed',
        userId,
        restricted
      });
    } catch (error) {
      logger.error({ err: error }, "Error updating user restriction:");
      res.status(500).json({ message: "Failed to update user restriction" });
    }
  });

  app.patch('/api/admin/users/:id/limit', requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.params.id;
      const limitSchema = z.object({
        limit: z.union([z.literal(null), z.literal(-1), z.number().int().positive()]),
      });
      const limitParsed = limitSchema.safeParse(req.body);
      if (!limitParsed.success) {
        return res.status(400).json({ message: "limit must be null, -1 (unlimited), or a positive integer" });
      }
      const { limit } = limitParsed.data;

      const updatedUser = await storage.updateUserVerificationLimit(userId, limit);

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      let limitDescription = 'Default (1/day)';
      if (limit === -1) limitDescription = 'Unlimited';
      else if (limit !== null && limit > 0) limitDescription = `${limit} verifications`;

      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && updatedUser.email) {
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);padding:28px;border-radius:10px 10px 0 0;">
            <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">Verification Limit Updated</h1>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
            <p style="color:#333;font-size:15px;margin-top:0;">Your COS verification limit has been updated by an administrator.</p>
            <div style="background:#f0f4ff;padding:16px;border-radius:8px;margin:16px 0;text-align:center;">
              <span style="font-size:22px;font-weight:bold;color:#1d4ed8;">${limitDescription}</span>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${getAppUrl()}/dashboard" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Dashboard</a>
            </div>
            <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
          </div>
        </div>`;
        sendEmailReliably(
          {
            from: "CheckByAI <noreply@checkbyai.net>",
            to: [updatedUser.email],
            subject: "Your COS verification limit has been updated",
            html,
          },
          "[Limit]",
        );
      }

      res.json({
        message: `Verification limit set to: ${limitDescription}`,
        userId,
        verificationLimit: limit
      });
    } catch (error) {
      logger.error({ err: error }, "Error updating user verification limit:");
      res.status(500).json({ message: "Failed to update verification limit" });
    }
  });

  app.patch('/api/admin/users/:id/cos-approval', requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { approved } = req.body;

      if (typeof approved !== 'boolean') {
        return res.status(400).json({ message: 'approved must be a boolean' });
      }

      await storage.updateCosCheckApproval(userId, approved);
      const updatedUser = await storage.getUser(userId);

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (updatedUser.email) {
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const html = approved
            ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);padding:28px;border-radius:10px 10px 0 0;">
                  <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127381; CoS Check Access Approved</h1>
                </div>
                <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                  <p style="color:#333;font-size:15px;margin-top:0;">Great news — your account has been approved for <strong>CoS Check</strong>.</p>
                  <p style="color:#333;font-size:15px;">You can now upload and verify Certificates of Sponsorship using our forensic AI detection system.</p>
                  <div style="text-align:center;margin:24px 0;">
                    <a href="${getAppUrl()}/dashboard" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Start Verifying</a>
                  </div>
                  <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
                </div>
              </div>`
            : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#6b7280 0%,#9ca3af 100%);padding:28px;border-radius:10px 10px 0 0;">
                  <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">CoS Check Access Removed</h1>
                </div>
                <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                  <p style="color:#333;font-size:15px;margin-top:0;">Your CoS Check access has been removed by an administrator.</p>
                  <p style="color:#333;font-size:15px;">If you believe this is a mistake, please contact us at <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a>.</p>
                </div>
              </div>`;
          sendEmailReliably(
            {
              from: "CheckByAI <noreply@checkbyai.net>",
              to: [updatedUser.email],
              subject: approved ? "Your CoS Check access has been approved" : "Your CoS Check access has been removed",
              html,
            },
            "[CoS Approval]",
          );
        }
      }

      res.json({
        message: approved ? 'Beta access granted' : 'Beta access revoked',
        userId,
        cosCheckApproved: approved,
      });
    } catch (error) {
      logger.error({ err: error }, "Error updating CoS Check approval:");
      res.status(500).json({ message: "Failed to update beta approval" });
    }
  });

  app.patch('/api/admin/users/:id/ip-exempt', requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { exempt } = req.body;
      if (typeof exempt !== 'boolean') {
        return res.status(400).json({ message: 'exempt must be a boolean' });
      }
      await storage.updateIpExempt(userId, exempt);
      res.json({ message: exempt ? 'IP rate limit exemption granted' : 'IP rate limit exemption removed', userId, ipExempt: exempt });
    } catch (error) {
      logger.error({ err: error }, "Error updating IP exemption:");
      res.status(500).json({ message: "Failed to update IP exemption" });
    }
  });

  app.patch('/api/admin/users/:id/cos-subscription', requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { active } = req.body;
      if (typeof active !== 'boolean') {
        return res.status(400).json({ message: 'active must be a boolean' });
      }
      await storage.updateCosCheckSubscription(userId, active);

      const targetUser = await storage.getUser(userId);
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && targetUser?.email) {
        const html = active
          ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127881; COS Check Subscription Activated</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Your <strong>COS Check subscription</strong> has been activated. You now have full access to COS document verification.</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${getAppUrl()}/dashboard" style="background:#059669;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Start Verifying</a>
                </div>
                <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
              </div>
            </div>`
          : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#6b7280 0%,#9ca3af 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">COS Check Subscription Deactivated</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Your COS Check subscription has been deactivated.</p>
                <p style="color:#333;font-size:15px;">If you have questions, please contact us at <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a>.</p>
              </div>
            </div>`;
        sendEmailReliably(
          {
            from: "CheckByAI <noreply@checkbyai.net>",
            to: [targetUser.email],
            subject: active ? "Your COS Check subscription has been activated" : "Your COS Check subscription has been deactivated",
            html,
          },
          "[COS Subscription]",
        );
      }

      res.json({ message: active ? 'COS check subscription activated' : 'COS check subscription deactivated', userId, cosCheckSubscription: active });
    } catch (error) {
      logger.error({ err: error }, "Error updating COS check subscription:");
      res.status(500).json({ message: "Failed to update COS check subscription" });
    }
  });

  app.patch('/api/admin/users/:id/cos-beta', requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { enabled, limit } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: 'enabled must be a boolean' });
      }
      if (limit !== null && limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        return res.status(400).json({ message: 'limit must be a positive integer or null' });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      const updatedUser = await storage.updateCosBeta(userId, enabled, limit ?? null);

      const isPaid = ['starter', 'pro', 'unlimited', 'enterprise'].includes(updatedUser.subscriptionStatus || '');
      if (enabled && isPaid && updatedUser.email) {
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const limitLine = limit ? `<p style="color:#333;font-size:15px;">Your daily verification limit has been set to <strong>${limit}</strong>.</p>` : '';
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:28px;border-radius:10px 10px 0 0;">
              <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127881; COS Beta Access Granted</h1>
            </div>
            <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
              <p style="color:#333;font-size:15px;margin-top:0;">Congratulations! You have been granted <strong>COS Beta access</strong> on Check By AI.</p>
              ${limitLine}
              <div style="text-align:center;margin:24px 0;">
                <a href="${getAppUrl()}/dashboard" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Dashboard</a>
              </div>
              <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
            </div>
          </div>`;
          sendEmailReliably(
            {
              from: "CheckByAI <noreply@checkbyai.net>",
              to: [updatedUser.email],
              subject: "You've been granted COS Beta access",
              html,
            },
            "[COS Beta]",
          );
        }
      }

      res.json({ message: enabled ? 'COS Beta access enabled' : 'COS Beta access disabled', userId, cosBetaEnabled: enabled, cosBetaLimit: limit ?? null });
    } catch (error) {
      logger.error({ err: error }, "Error updating COS Beta access:");
      res.status(500).json({ message: "Failed to update COS Beta access" });
    }
  });

  app.delete('/api/admin/users/:id', requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.params.id;

      if (req.user?.id === userId) {
        return res.status(403).json({ message: 'You cannot delete your own account' });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (targetUser.role === 'admin') {
        return res.status(403).json({ message: 'Admin accounts cannot be deleted' });
      }

      await storage.deleteUser(userId);

      await db.execute(
        sql`DELETE FROM sessions WHERE sess->'passport'->'user'->>'id' = ${userId}`
      );

      res.json({ message: 'User deleted successfully', userId });
    } catch (error) {
      logger.error({ err: error }, "Error deleting user:");
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.patch('/api/admin/users/:id/sponsor-monitor-plan', requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.params.id;
      const planSchema = z.object({
        plan: z.enum(['free', 'starter', 'pro']),
      });
      const parsed = planSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "plan must be 'free', 'starter', or 'pro'" });
      }
      const { plan } = parsed.data;

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (targetUser.role === 'admin') {
        return res.status(403).json({ message: 'Admin accounts cannot be modified' });
      }

      const previousStatus = targetUser.subscriptionStatus || 'free';
      const updatedUser = await storage.updateUserSubscription(userId, {
        subscriptionStatus: plan,
      });

      const newWatchLimit = getWatchLimit(plan);
      let deactivatedWatchCount = 0;

      if (newWatchLimit !== -1) {
        const activeWatches = await db
          .select({ id: companyWatches.id })
          .from(companyWatches)
          .where(and(
            eq(companyWatches.userId, userId),
            eq(companyWatches.isActive, true),
          ))
          .orderBy(asc(companyWatches.createdAt));

        if (activeWatches.length > newWatchLimit) {
          const watchesToDeactivate = activeWatches.slice(newWatchLimit);
          for (const watch of watchesToDeactivate) {
            await db
              .update(companyWatches)
              .set({ isActive: false })
              .where(eq(companyWatches.id, watch.id));
          }
          deactivatedWatchCount = watchesToDeactivate.length;
          logger.info({ userId, previousStatus, plan, newWatchLimit, deactivatedWatchCount }, '[AdminPlanOverride] Deactivated excess watches for user');
        }
      }

      await storage.logSubscriptionChange({
        userId,
        changedBy: (req.user as any)?.id ?? 'admin',
        source: 'admin_override',
        previousStatus,
        newStatus: plan,
        reason: 'Admin plan override via admin panel',
        metadata: { deactivatedWatches: deactivatedWatchCount },
      }).catch((err) => logger.error({ err }, '[AdminPlanOverride] Audit log write failed:'));

      const planLabels: Record<string, string> = {
        free: 'Free',
        starter: 'Sponsor Monitor Starter',
        pro: 'Sponsor Monitor Pro',
      };
      const planFeatures: Record<string, string> = {
        free: 'No company watches or notifications.',
        starter: '2 company watches · Same-day alerts · Email & WhatsApp notifications.',
        pro: '5 company watches · Immediate alerts · Email, WhatsApp & SMS · Enriched intelligence.',
      };

      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && updatedUser.email) {
        const isUpgrade = plan !== 'free';
        const headerColor = plan === 'pro' ? '#7c3aed' : plan === 'starter' ? '#059669' : '#6b7280';
        const watchNote = deactivatedWatchCount > 0
          ? `<p style="color:#b45309;font-size:13px;background:#fffbeb;border:1px solid #fde68a;padding:10px 14px;border-radius:6px;margin:12px 0;">${deactivatedWatchCount} company watch${deactivatedWatchCount > 1 ? 'es were' : ' was'} removed to match your new plan limit.</p>`
          : '';
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,${headerColor} 0%,${headerColor}cc 100%);padding:28px;border-radius:10px 10px 0 0;">
            <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">${isUpgrade ? '🎉 ' : ''}Sponsor Monitor Plan ${isUpgrade ? 'Updated' : 'Removed'}</h1>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
            <p style="color:#333;font-size:15px;margin-top:0;">Your Sponsor Monitor plan has been updated by an administrator.</p>
            <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;text-align:center;">
              <span style="font-size:20px;font-weight:bold;color:${headerColor};">${planLabels[plan]}</span>
              <p style="color:#555;font-size:13px;margin:8px 0 0;">${planFeatures[plan]}</p>
            </div>
            ${watchNote}
            ${isUpgrade ? `<div style="text-align:center;margin:24px 0;">
              <a href="${getAppUrl()}/sponsor-monitor" style="background:${headerColor};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Sponsor Monitor</a>
            </div>` : ''}
            <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
          </div>
        </div>`;
        sendEmailReliably(
          {
            from: 'CheckByAI <noreply@checkbyai.net>',
            to: [updatedUser.email],
            subject: isUpgrade
              ? `Your Sponsor Monitor plan has been updated to ${planLabels[plan]}`
              : 'Your Sponsor Monitor subscription has been removed',
            html,
          },
          '[SponsorMonitorPlan]',
        );
      }

      res.json({
        message: `Sponsor Monitor plan set to '${plan}'`,
        userId,
        previousStatus,
        subscriptionStatus: plan,
        deactivatedWatches: deactivatedWatchCount,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error updating sponsor monitor plan:');
      res.status(500).json({ message: 'Failed to update sponsor monitor plan' });
    }
  });

  app.patch('/api/admin/users/:id/credits', requireRole("admin"), async (req: any, res) => {
    try {
      const userId = req.params.id;
      const creditSchema = z.object({
        operation: z.enum(['add', 'deduct', 'set']),
        amount: z.number().int().min(0),
        reason: z.string().max(200).optional(),
      });
      const parsed = creditSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'operation must be add/deduct/set, amount must be a non-negative integer' });
      }
      const { operation, amount, reason } = parsed.data;

      const targetUser = await storage.getUser(userId);
      if (!targetUser) return res.status(404).json({ message: 'User not found' });
      if (targetUser.role === 'admin') return res.status(403).json({ message: 'Admin accounts cannot be modified' });

      const prevCredits = targetUser.credits ?? 0;
      let updatedUser: typeof targetUser;

      if (operation === 'add') {
        updatedUser = await storage.addCredits(userId, amount);
      } else if (operation === 'deduct') {
        updatedUser = await storage.deductCredits(userId, amount);
      } else {
        const [u] = await db
          .update(users)
          .set({ credits: amount, updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning();
        updatedUser = u;
      }

      const newCredits = updatedUser?.credits ?? 0;
      const delta = newCredits - prevCredits;
      logger.info({ userId, prevCredits, newCredits, delta, operation, amount, reason: reason ?? 'none' }, '[AdminCredits] User credits updated');

      storage.logSubscriptionChange({
        userId,
        changedBy: (req.user as any)?.id ?? 'admin',
        source: 'admin_override',
        previousStatus: targetUser.subscriptionStatus || 'free',
        newStatus: targetUser.subscriptionStatus || 'free',
        reason: reason ? `Credits ${operation}: ${reason}` : `Credits ${operation} by admin`,
        metadata: { creditsBefore: prevCredits, creditsAfter: newCredits, delta, operation, amount },
      }).catch(() => {});

      res.json({
        message: `Credits updated: ${prevCredits} → ${newCredits}`,
        userId,
        creditsBefore: prevCredits,
        creditsAfter: newCredits,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error updating credits:');
      res.status(500).json({ message: 'Failed to update credits' });
    }
  });

  app.get('/api/admin/users/:id/subscription-audit', requireRole("admin"), async (req, res) => {
    try {
      const userId = req.params.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const log = await storage.getSubscriptionAuditLog(userId, limit);
      res.json(log);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching subscription audit log:');
      res.status(500).json({ message: 'Failed to fetch subscription audit log' });
    }
  });
}
