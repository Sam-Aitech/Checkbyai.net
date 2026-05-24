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
import crypto from "crypto";
import * as phoneOtpStore from "../utils/phoneOtpStore";
import { success, fail } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";
import { logger } from "../utils/logger";

const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_REQUESTS = 3;

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

const notifPrefSchema = z.object({
  email_enabled: z.boolean().optional(),
  whatsapp_enabled: z.boolean().optional(),
  whatsapp_number: z.string().max(20).optional().nullable(),
  sms_enabled: z.boolean().optional(),
  sms_number: z.string().max(20).optional().nullable(),
});

const eventSchema = z.object({
  enabled: z.boolean().optional(),
  channels: z.object({
    email: z.boolean().optional(),
    inApp: z.boolean().optional(),
    sms:   z.boolean().optional(),
  }).optional(),
}).optional();

const notifEventSchema = z.object({
  licence_revoked:    eventSchema,
  rating_downgraded:  eventSchema,
  licence_reinstated: eventSchema,
  rating_upgraded:    eventSchema,
  route_added:        eventSchema,
  route_removed:      eventSchema,
  weekly_digest:      eventSchema,
});

const jobAlertSchema = z.object({
  fingerprint: z.string().min(1).max(500),
  enabled: z.boolean(),
});

export function registerNotificationRoutes(app: Express): void {
  app.get('/api/notification-preferences', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const result = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (result.length === 0) {
      success(res, {
        emailEnabled: true,
        email: req.user.email || null,
        whatsappEnabled: false,
        whatsappNumber: null,
        whatsappVerified: false,
        smsEnabled: false,
        smsNumber: null,
        smsVerified: false,
      });
      return;
    }

    const prefs = result[0];
    success(res, {
      emailEnabled: prefs.emailEnabled,
      email: prefs.email,
      whatsappEnabled: prefs.whatsappEnabled,
      whatsappNumber: prefs.whatsappNumber ? decryptPhone(prefs.whatsappNumber) : null,
      whatsappVerified: prefs.whatsappVerified,
      smsEnabled: prefs.smsEnabled,
      smsNumber: prefs.smsNumber ? decryptPhone(prefs.smsNumber) : null,
      smsVerified: prefs.smsVerified,
    });
  }));

  app.put('/api/notification-preferences', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const parsed = notifPrefSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.errors.map(e => e.message).join(', '));
    }
    const { email_enabled, whatsapp_enabled, whatsapp_number, sms_enabled, sms_number } = parsed.data;

    if (whatsapp_number && !PHONE_REGEX.test(whatsapp_number)) {
      throw new ApiError(400, "Invalid WhatsApp number. Please provide a number starting with + followed by country code and digits (e.g. +447700900000).");
    }
    if (sms_number && !PHONE_REGEX.test(sms_number)) {
      throw new ApiError(400, "Invalid SMS number. Please provide a number starting with + followed by country code and digits (e.g. +447700900000).");
    }

    if (whatsapp_enabled && !whatsapp_number) {
      throw new ApiError(400, "Please provide a WhatsApp number to enable WhatsApp notifications.");
    }
    if (sms_enabled && !sms_number) {
      throw new ApiError(400, "Please provide an SMS number to enable SMS notifications.");
    }

    const userPlan = req.user.subscriptionStatus || "free";
    if (whatsapp_enabled && !isChannelAllowed(userPlan, "whatsapp")) {
      throw new ApiError(403, "WhatsApp notifications are available on Pro plan and above. Please upgrade to enable this channel.");
    }
    if (sms_enabled && !isChannelAllowed(userPlan, "sms")) {
      throw new ApiError(403, "SMS notifications are available on Unlimited plan and above. Please upgrade to enable this channel.");
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
        throw new ApiError(400, "Please verify your WhatsApp number before enabling WhatsApp notifications.");
      }
    }

    if (sms_enabled) {
      const storedNumber = existing.length > 0 && existing[0].smsNumber ? decryptPhone(existing[0].smsNumber) : null;
      const isVerified = existing.length > 0 && existing[0].smsVerified && storedNumber === sms_number;
      if (!isVerified) {
        throw new ApiError(400, "Please verify your SMS number before enabling SMS notifications.");
      }
    }

    const values = {
      userId,
      emailEnabled: email_enabled ?? true,
      email: req.user.email || null,
      whatsappNumber: whatsapp_number ? encryptPhone(whatsapp_number) : null,
      smsNumber: sms_number ? encryptPhone(sms_number) : null,
      smsEnabled: sms_enabled ?? false,
      whatsappEnabled: whatsapp_enabled ?? false,
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

    success(res, { message: "Notification preferences updated." });
  }));

  app.get('/api/notifications/preferences', isAuthenticated, asyncHandler(async (req: any, res) => {
    const prefs = await storage.getUserNotifPrefs(req.user.id);
    success(res, prefs);
  }));

  app.patch('/api/notifications/preferences', isAuthenticated, asyncHandler(async (req: any, res) => {
    const parsed = notifEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.errors.map((e: any) => e.message).join(', '));
    }
    await storage.updateUserNotifPrefs(req.user.id, parsed.data);
    success(res, { message: 'Notification event preferences updated.' });
  }));

  app.get('/api/tier-config', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userPlan = req.user.subscriptionStatus || "free";
    const config = getTierConfig(userPlan);
    success(res, {
      plan: userPlan,
      watchLimit: config.watchLimit,
      channels: config.channels,
      alertTiming: config.alertTiming,
      apiAccess: config.apiAccess,
      weeklyReports: config.weeklyReports,
      csvUpload: config.csvUpload,
      webhooks: config.webhooks,
    });
  }));

  app.get('/api/job-alert-preferences', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const plan = req.user.subscriptionStatus || 'free';
    if (plan !== 'pro' && plan !== 'unlimited' && plan !== 'enterprise') {
      success(res, []);
      return;
    }
    const prefs = await db
      .select()
      .from(jobAlertPreferences)
      .where(eq(jobAlertPreferences.userId, userId));
    success(res, prefs);
  }));

  app.post('/api/job-alert-preferences', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const plan = req.user.subscriptionStatus || 'free';
    if (plan !== 'pro' && plan !== 'unlimited' && plan !== 'enterprise') {
      throw new ApiError(403, 'Job alerts require a Pro plan. Please upgrade.');
    }
    const parsed = jobAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request body.');
    }
    const { fingerprint, enabled } = parsed.data;
    await db
      .insert(jobAlertPreferences)
      .values({ userId, fingerprint, enabled, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [jobAlertPreferences.userId, jobAlertPreferences.fingerprint],
        set: { enabled, updatedAt: new Date() },
      });
    success(res, { fingerprint, enabled });
  }));

  app.post('/api/notification-preferences/verify-phone', isAuthenticated, asyncHandler(async (req: any, res) => {
    const { phone_number, channel } = req.body;

    if (!phone_number || !PHONE_REGEX.test(phone_number)) {
      throw new ApiError(400, "Please provide a valid phone number starting with + (e.g. +447700900000).");
    }
    if (!channel || !['whatsapp', 'sms'].includes(channel)) {
      throw new ApiError(400, "Channel must be 'whatsapp' or 'sms'.");
    }

    const userPlan = req.user.subscriptionStatus || "free";
    if (!isChannelAllowed(userPlan, channel as "whatsapp" | "sms")) {
      const minPlan = channel === 'whatsapp' ? 'Pro' : 'Unlimited';
      throw new ApiError(403, `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} notifications require ${minPlan} plan or above.`);
    }

    const rateCount = await phoneOtpStore.getRateCount(req.user.id, channel);
    if (rateCount >= MAX_OTP_REQUESTS) {
      throw new ApiError(429, "Too many verification requests. Please wait 10 minutes before trying again.");
    }

    const code = String(crypto.randomInt(100000, 999999));
    await phoneOtpStore.setOtp(req.user.id, channel, phone_number, code);
    await phoneOtpStore.incrementRateCount(req.user.id, channel);

    const otpMessage = `Your CheckByAI verification code is: ${code}. It expires in 10 minutes.`;

    let deliveryResult;
    try {
      if (channel === 'sms') {
        deliveryResult = await sendSMS(phone_number, otpMessage);
      } else {
        deliveryResult = await sendWhatsApp(phone_number, otpMessage);
      }
    } catch (sendErr: any) {
      logger.error({ err: sendErr.message }, `[NotificationOTP] Error sending OTP via ${channel}:`);
      await phoneOtpStore.deleteOtp(req.user.id, channel, phone_number);
      throw new ApiError(502, `Failed to deliver verification code via ${channel}. Please check the number and try again.`);
    }

    if (!deliveryResult.success) {
      logger.error(`[NotificationOTP] ${channel} delivery failed for ${phone_number}: ${deliveryResult.error}`);
      await phoneOtpStore.deleteOtp(req.user.id, channel, phone_number);
      throw new ApiError(502, `Failed to deliver verification code via ${channel}. Please check the number and try again.`);
    }

    logger.info(`[NotificationOTP] Code sent via ${channel} to ${phone_number} (user ${req.user.id})`);

    success(res, { message: `Verification code sent to ${phone_number} via ${channel}.` });
  }));

  app.post('/api/notification-preferences/confirm-phone', isAuthenticated, asyncHandler(async (req: any, res) => {
    const { phone_number, channel, code } = req.body;

    if (!phone_number || !channel || !code) {
      throw new ApiError(400, "Phone number, channel, and code are required.");
    }
    if (!['whatsapp', 'sms'].includes(channel)) {
      throw new ApiError(400, "Channel must be 'whatsapp' or 'sms'.");
    }

    const stored = await phoneOtpStore.getOtp(req.user.id, channel, phone_number);

    if (!stored) {
      throw new ApiError(400, "No verification code found. Please request a new code.");
    }
    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      await phoneOtpStore.deleteOtp(req.user.id, channel, phone_number);
      throw new ApiError(429, "Too many failed attempts. Please request a new code.");
    }
    if (stored.code !== String(code).trim()) {
      await phoneOtpStore.incrementOtpAttempts(req.user.id, channel, phone_number);
      throw new ApiError(400, "Invalid verification code.");
    }

    await phoneOtpStore.deleteOtp(req.user.id, channel, phone_number);

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

    success(res, { message: `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} number verified successfully.` });
  }));

  app.get('/api/notifications/history', isAuthenticated, asyncHandler(async (req: any, res) => {
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

    success(res, results);
  }));
}
