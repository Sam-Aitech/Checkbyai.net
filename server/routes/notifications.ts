import type { Express } from "express";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { notificationPreferences, notificationLog, sponsorChanges, jobAlertPreferences } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { encryptPhone, decryptPhone } from "../utils/phoneCrypto";
import { sendSMS, sendWhatsApp } from "../services/messaging";
import { isChannelAllowed, getTierConfig } from "../utils/tierConfig";
import { storage } from "../storage";

const phoneOtpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();
const otpRateLimit = new Map<string, { count: number; resetAt: number }>();
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_REQUESTS = 3;
const OTP_RATE_WINDOW = 10 * 60 * 1000;

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

function cleanupExpiredOtps() {
  const now = Date.now();
  Array.from(phoneOtpStore.entries()).forEach(([key, val]) => {
    if (val.expiresAt < now) phoneOtpStore.delete(key);
  });
  Array.from(otpRateLimit.entries()).forEach(([key, val]) => {
    if (val.resetAt < now) otpRateLimit.delete(key);
  });
}

export function registerNotificationRoutes(app: Express): void {
  app.get('/api/notification-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const result = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);

      if (result.length === 0) {
        return res.json({
          emailEnabled: true,
          email: req.user.email || null,
          whatsappEnabled: false,
          whatsappNumber: null,
          whatsappVerified: false,
          smsEnabled: false,
          smsNumber: null,
          smsVerified: false,
        });
      }

      const prefs = result[0];
      res.json({
        emailEnabled: prefs.emailEnabled,
        email: prefs.email,
        whatsappEnabled: prefs.whatsappEnabled,
        whatsappNumber: prefs.whatsappNumber ? decryptPhone(prefs.whatsappNumber) : null,
        whatsappVerified: prefs.whatsappVerified,
        smsEnabled: prefs.smsEnabled,
        smsNumber: prefs.smsNumber ? decryptPhone(prefs.smsNumber) : null,
        smsVerified: prefs.smsVerified,
      });
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ message: "Failed to fetch notification preferences." });
    }
  });

  app.put('/api/notification-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const notifPrefSchema = z.object({
        email_enabled: z.boolean().optional(),
        whatsapp_enabled: z.boolean().optional(),
        whatsapp_number: z.string().max(20).optional().nullable(),
        sms_enabled: z.boolean().optional(),
        sms_number: z.string().max(20).optional().nullable(),
      });
      const prefParsed = notifPrefSchema.safeParse(req.body);
      if (!prefParsed.success) {
        return res.status(400).json({ message: prefParsed.error.errors.map(e => e.message).join(', ') });
      }
      const { email_enabled, whatsapp_enabled, whatsapp_number, sms_enabled, sms_number } = prefParsed.data;

      if (whatsapp_number && !PHONE_REGEX.test(whatsapp_number)) {
        return res.status(400).json({ message: "Invalid WhatsApp number. Please provide a number starting with + followed by country code and digits (e.g. +447700900000)." });
      }
      if (sms_number && !PHONE_REGEX.test(sms_number)) {
        return res.status(400).json({ message: "Invalid SMS number. Please provide a number starting with + followed by country code and digits (e.g. +447700900000)." });
      }

      if (whatsapp_enabled && !whatsapp_number) {
        return res.status(400).json({ message: "Please provide a WhatsApp number to enable WhatsApp notifications." });
      }
      if (sms_enabled && !sms_number) {
        return res.status(400).json({ message: "Please provide an SMS number to enable SMS notifications." });
      }

      const userPlan = req.user.subscriptionStatus || "free";
      if (whatsapp_enabled && !isChannelAllowed(userPlan, "whatsapp")) {
        return res.status(403).json({ message: "WhatsApp notifications are available on Pro plan and above. Please upgrade to enable this channel." });
      }
      if (sms_enabled && !isChannelAllowed(userPlan, "sms")) {
        return res.status(403).json({ message: "SMS notifications are available on Unlimited plan and above. Please upgrade to enable this channel." });
      }

      const existing = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);

      if (whatsapp_enabled) {
        const storedNumber = existing.length > 0 && existing[0].whatsappNumber ? decryptPhone(existing[0].whatsappNumber) : null;
        const isVerified = existing.length > 0 && existing[0].whatsappVerified && storedNumber === whatsapp_number;
        if (!isVerified) {
          return res.status(400).json({ message: "Please verify your WhatsApp number before enabling WhatsApp notifications." });
        }
      }

      if (sms_enabled) {
        const storedNumber = existing.length > 0 && existing[0].smsNumber ? decryptPhone(existing[0].smsNumber) : null;
        const isVerified = existing.length > 0 && existing[0].smsVerified && storedNumber === sms_number;
        if (!isVerified) {
          return res.status(400).json({ message: "Please verify your SMS number before enabling SMS notifications." });
        }
      }

      const values = {
        userId,
        emailEnabled: email_enabled ?? true,
        email: req.user.email || null,
        whatsappEnabled: whatsapp_enabled ?? false,
        whatsappNumber: whatsapp_number ? encryptPhone(whatsapp_number) : null,
        smsEnabled: sms_enabled ?? false,
        smsNumber: sms_number ? encryptPhone(sms_number) : null,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(notificationPreferences)
          .set(values)
          .where(eq(notificationPreferences.userId, userId));
      } else {
        await db.insert(notificationPreferences).values(values);
      }

      res.json({ message: "Notification preferences updated." });
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ message: "Failed to update notification preferences." });
    }
  });

  app.get('/api/notifications/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const prefs = await storage.getUserNotifPrefs(req.user.id);
      res.json(prefs);
    } catch (error) {
      console.error('[NotifPrefs] GET error:', error);
      res.status(500).json({ message: 'Failed to fetch notification event preferences.' });
    }
  });

  app.patch('/api/notifications/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const eventSchema = z.object({
        enabled: z.boolean().optional(),
        channels: z.object({
          email: z.boolean().optional(),
          inApp: z.boolean().optional(),
          sms:   z.boolean().optional(),
        }).optional(),
      }).optional();
      const schema = z.object({
        licence_revoked:    eventSchema,
        rating_downgraded:  eventSchema,
        licence_reinstated: eventSchema,
        rating_upgraded:    eventSchema,
        route_added:        eventSchema,
        route_removed:      eventSchema,
        weekly_digest:      eventSchema,
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map((e: any) => e.message).join(', ') });
      }
      await storage.updateUserNotifPrefs(req.user.id, parsed.data);
      res.json({ message: 'Notification event preferences updated.' });
    } catch (error) {
      console.error('[NotifPrefs] PATCH error:', error);
      res.status(500).json({ message: 'Failed to update notification event preferences.' });
    }
  });

  app.get('/api/tier-config', isAuthenticated, async (req: any, res) => {
    try {
      const userPlan = req.user.subscriptionStatus || "free";
      const config = getTierConfig(userPlan);
      res.json({
        plan: userPlan,
        watchLimit: config.watchLimit,
        channels: config.channels,
        alertTiming: config.alertTiming,
        apiAccess: config.apiAccess,
        weeklyReports: config.weeklyReports,
        csvUpload: config.csvUpload,
        webhooks: config.webhooks,
      });
    } catch (error) {
      console.error("Error fetching tier config:", error);
      res.status(500).json({ message: "Failed to fetch tier configuration." });
    }
  });

  app.get('/api/job-alert-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const plan = req.user.subscriptionStatus || 'free';
      if (plan !== 'pro' && plan !== 'unlimited' && plan !== 'enterprise') {
        return res.json([]);
      }
      const prefs = await db
        .select()
        .from(jobAlertPreferences)
        .where(eq(jobAlertPreferences.userId, userId));
      res.json(prefs);
    } catch (err) {
      console.error('Error fetching job alert preferences:', err);
      res.status(500).json({ message: 'Failed to fetch job alert preferences.' });
    }
  });

  app.post('/api/job-alert-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const plan = req.user.subscriptionStatus || 'free';
      if (plan !== 'pro' && plan !== 'unlimited' && plan !== 'enterprise') {
        return res.status(403).json({ message: 'Job alerts require a Pro plan. Please upgrade.' });
      }
      const schema = z.object({
        fingerprint: z.string().min(1).max(500),
        enabled: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid request body.' });
      }
      const { fingerprint, enabled } = parsed.data;
      await db
        .insert(jobAlertPreferences)
        .values({ userId, fingerprint, enabled, createdAt: new Date(), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [jobAlertPreferences.userId, jobAlertPreferences.fingerprint],
          set: { enabled, updatedAt: new Date() },
        });
      res.json({ success: true, fingerprint, enabled });
    } catch (err) {
      console.error('Error saving job alert preference:', err);
      res.status(500).json({ message: 'Failed to save preference.' });
    }
  });

  app.post('/api/notification-preferences/verify-phone', isAuthenticated, async (req: any, res) => {
    try {
      const { phone_number, channel } = req.body;

      if (!phone_number || !PHONE_REGEX.test(phone_number)) {
        return res.status(400).json({ message: "Please provide a valid phone number starting with + (e.g. +447700900000)." });
      }
      if (!channel || !['whatsapp', 'sms'].includes(channel)) {
        return res.status(400).json({ message: "Channel must be 'whatsapp' or 'sms'." });
      }

      const userPlan = req.user.subscriptionStatus || "free";
      if (!isChannelAllowed(userPlan, channel as "whatsapp" | "sms")) {
        const minPlan = channel === 'whatsapp' ? 'Pro' : 'Unlimited';
        return res.status(403).json({ message: `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} notifications require ${minPlan} plan or above.` });
      }

      cleanupExpiredOtps();

      const rateLimitKey = `${req.user.id}:${channel}`;
      const rateEntry = otpRateLimit.get(rateLimitKey);
      if (rateEntry && rateEntry.resetAt > Date.now() && rateEntry.count >= MAX_OTP_REQUESTS) {
        return res.status(429).json({ message: "Too many verification requests. Please wait 10 minutes before trying again." });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const key = `${req.user.id}:${channel}:${phone_number}`;
      phoneOtpStore.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });

      if (rateEntry && rateEntry.resetAt > Date.now()) {
        rateEntry.count++;
      } else {
        otpRateLimit.set(rateLimitKey, { count: 1, resetAt: Date.now() + OTP_RATE_WINDOW });
      }

      const otpMessage = `Your CheckByAI verification code is: ${code}. It expires in 10 minutes.`;

      let deliveryResult;
      try {
        if (channel === 'sms') {
          deliveryResult = await sendSMS(phone_number, otpMessage);
        } else {
          deliveryResult = await sendWhatsApp(phone_number, otpMessage);
        }
      } catch (sendErr: any) {
        console.error(`[NotificationOTP] Error sending OTP via ${channel}:`, sendErr.message);
        phoneOtpStore.delete(key);
        return res.status(502).json({ message: `Failed to deliver verification code via ${channel}. Please check the number and try again.` });
      }

      if (!deliveryResult.success) {
        console.error(`[NotificationOTP] ${channel} delivery failed for ${phone_number}: ${deliveryResult.error}`);
        phoneOtpStore.delete(key);
        return res.status(502).json({ message: `Failed to deliver verification code via ${channel}. Please check the number and try again.` });
      }

      console.log(`[NotificationOTP] Code sent via ${channel} to ${phone_number} (user ${req.user.id})`);

      res.json({ message: `Verification code sent to ${phone_number} via ${channel}.` });
    } catch (error) {
      console.error("Error sending verification code:", error);
      res.status(500).json({ message: "Failed to send verification code." });
    }
  });

  app.post('/api/notification-preferences/confirm-phone', isAuthenticated, async (req: any, res) => {
    try {
      const { phone_number, channel, code } = req.body;

      if (!phone_number || !channel || !code) {
        return res.status(400).json({ message: "Phone number, channel, and code are required." });
      }
      if (!['whatsapp', 'sms'].includes(channel)) {
        return res.status(400).json({ message: "Channel must be 'whatsapp' or 'sms'." });
      }

      cleanupExpiredOtps();

      const key = `${req.user.id}:${channel}:${phone_number}`;
      const stored = phoneOtpStore.get(key);

      if (!stored) {
        return res.status(400).json({ message: "No verification code found. Please request a new code." });
      }
      if (stored.expiresAt < Date.now()) {
        phoneOtpStore.delete(key);
        return res.status(400).json({ message: "Verification code has expired. Please request a new code." });
      }
      if (stored.attempts >= MAX_OTP_ATTEMPTS) {
        phoneOtpStore.delete(key);
        return res.status(429).json({ message: "Too many failed attempts. Please request a new code." });
      }
      if (stored.code !== String(code).trim()) {
        stored.attempts++;
        return res.status(400).json({ message: "Invalid verification code." });
      }

      phoneOtpStore.delete(key);

      const userId = req.user.id;
      const existing = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);

      const encryptedNumber = encryptPhone(phone_number);
      const updateFields = channel === 'whatsapp'
        ? { whatsappNumber: encryptedNumber, whatsappVerified: true, updatedAt: new Date() }
        : { smsNumber: encryptedNumber, smsVerified: true, updatedAt: new Date() };

      if (existing.length > 0) {
        await db
          .update(notificationPreferences)
          .set(updateFields)
          .where(eq(notificationPreferences.userId, userId));
      } else {
        await db.insert(notificationPreferences).values({
          userId,
          emailEnabled: true,
          email: req.user.email || null,
          ...updateFields,
        });
      }

      res.json({ message: `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} number verified successfully.` });
    } catch (error) {
      console.error("Error confirming phone:", error);
      res.status(500).json({ message: "Failed to verify phone number." });
    }
  });

  app.get('/api/notifications/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const results = await db
        .select({
          id: notificationLog.id,
          channel: notificationLog.channel,
          status: notificationLog.status,
          sentAt: notificationLog.sentAt,
          organisationName: sponsorChanges.organisationName,
          changeType: sponsorChanges.changeType,
          previousValue: sponsorChanges.previousValue,
          newValue: sponsorChanges.newValue,
          detectedAt: sponsorChanges.detectedAt,
        })
        .from(notificationLog)
        .innerJoin(sponsorChanges, eq(notificationLog.changeId, sponsorChanges.id))
        .where(eq(notificationLog.userId, userId))
        .orderBy(desc(notificationLog.sentAt))
        .limit(50);

      res.json(results);
    } catch (error) {
      console.error("Error fetching notification history:", error);
      res.status(500).json({ message: "Failed to fetch notification history." });
    }
  });
}
