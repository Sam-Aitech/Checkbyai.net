/**
 * Notification Engine — event-type-filtered notification dispatch for paid subscribers.
 *
 * Uses a channel-based dispatch architecture:
 *   - EmailChannel (Resend → SendGrid → SMTP chain)
 *   - WhatsAppChannel (Twilio)
 *   - SMSChannel (Brevo)
 *   - WebhookChannel (HMAC-signed, 3 retries: 5m/15m/60m)
 *   - PushChannel (Web Push API via VAPID)
 *
 * Concurrency: p-limit(10) parallel user processing.
 * Rate limit: Redis-backed sliding window — 3 sends per user per company per hour.
 * Kill-switch: admin-toggleable global pause.
 * Audit: every dispatch logged to notif_log with success/failure + providerMessageId.
 *
 * Deferred delivery (starter plan, same-day window):
 *   - Entries are written with status='queued' and a deliverAfter timestamp.
 *   - processQueuedEngineEvents() is called hourly by the cron scheduler.
 */

import { db } from "../db";
import { storage } from "../storage";
import { eq, and, inArray, lte, sql } from "drizzle-orm";
import { getRedis } from "../utils/redisClient";
import {
  companyWatches,
  notifEngineLog,
  notifLog,
  notificationPreferences,
  sponsorChanges,
  users,
} from "@shared/schema";
import type { NotifPrefs } from "@shared/schema";
import type { SponsorChange } from "../utils/sponsorListFetcher";
import { normalizeName } from "../utils/sponsorListFetcher";
import { getAppUrl } from "../utils/appUrl";
import { getTierConfig } from "../utils/tierConfig";
import { buildEmail, esc } from "../utils/emailTemplates";
import { logger } from "../utils/logger";
import { startJobRun, finishJobRun, type TriggerSource } from "../utils/jobTelemetry";
import { match, P } from "ts-pattern";
import pLimit from "p-limit";
import { registerDefaultChannels, getChannel } from "./notificationChannels/registry";
import type { ChannelName } from "./notificationChannels/types";
import { logNotification } from "./notificationChannels/audit";

const log = logger.child({ module: "NotificationEngine" });

type NotifPrefsChannels = NotifPrefs[NotifEventType]["channels"];

const CONCURRENCY = 10;
const limit = pLimit(CONCURRENCY);

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifEventType =
  | "licence_revoked"
  | "rating_downgraded"
  | "licence_reinstated"
  | "rating_upgraded"
  | "route_added"
  | "route_removed"
  | "weekly_digest";

const CHANGE_TYPE_MAP: Partial<Record<string, NotifEventType>> = {
  REMOVED_REVOKED: "licence_revoked",
  RE_ACTIVATED:    "licence_reinstated",
  UPGRADED:        "rating_upgraded",
  DOWNGRADED:      "rating_downgraded",
  ROUTE_CHANGE:    "route_added",
};

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Keyed by `${userId}:${companyName}` — 3 sends per user per company per hour.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

// Redis-backed rate limiter (1 hour sliding window)
async function isRateLimited(userId: string | number, companyName: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    // Per user decision: hard-block notifications if Redis unavailable
    throw new Error('Redis required for rate limiting - notifications blocked');
  }
  
  // Create a stable hash of the company name for the key
  const companyHash = Buffer.from(companyName, 'utf8').toString('base64url').substring(0, 16);
  const key = `ratelimit:${userId}:${companyHash}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  try {
    // Use a pipeline for atomic operation
    const multi = redis.multi();
    const member = `${now}:${Math.random().toString(36).slice(2)}`;
    multi.zremrangebyscore(key, 0, windowStart); // Remove old entries
    multi.zadd(key, now, member);                // Add current event with unique member
    multi.zcard(key);                            // Get count
    multi.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)); // Refresh TTL
    const results = await multi.exec();
    
    // results[2] is the ZCARD result [null, count]
    const count = results?.[2]?.[1] as number ?? 0;
    return count > RATE_LIMIT_MAX;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 
                '[NotificationEngine] Rate limiter check failed - blocking notification (fail-closed)');
    // Fail closed: block notifications when Redis rate-limit check fails
    // to prevent exceeding rate limits during Redis outages.
    throw new Error('Redis rate-limit check failed - notifications blocked');
  }
}

// ── Channel-aware event check ──────────────────────────────────────────────────

export function isChannelEventEnabled(
  prefs: NotifPrefs | null,
  eventType: string,
  channel: string,
): boolean {
  if (!prefs) return true;
  const pref = (prefs as any)[eventType] as NotifPrefs[NotifEventType] | undefined;
  if (pref === undefined) return true;
  return pref.enabled === true && (pref.channels as any)[channel] === true;
}

type SponsorLicenceStatus = "Active" | "Suspended" | "Revoked" | "Surrendered";
type NormalizedSponsorLicenceStatus = SponsorLicenceStatus | "UNKNOWN";

const STATUS_NORMALIZE_MAP: Record<string, NormalizedSponsorLicenceStatus> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  REVOKED: "Revoked",
  REMOVED_REVOKED: "Revoked",
  SURRENDERED: "Surrendered",
};

export function normalizeSponsorLicenceStatus(value: string | null | undefined): NormalizedSponsorLicenceStatus {
  return STATUS_NORMALIZE_MAP[(value ?? "").trim().toUpperCase()] ?? "UNKNOWN";
}

export function mapStatusTransitionToNotifEvent(
  previousStatusRaw: string | null | undefined,
  newStatusRaw: string | null | undefined,
): NotifEventType | null {
  const previousStatus = normalizeSponsorLicenceStatus(previousStatusRaw);
  const newStatus = normalizeSponsorLicenceStatus(newStatusRaw);

  return match<[NormalizedSponsorLicenceStatus, NormalizedSponsorLicenceStatus]>([previousStatus, newStatus])
    .returnType<NotifEventType | null>()
    .with(["Active", "Active"], () => null)
    .with(["Active", "Suspended"], () => "licence_revoked")
    .with(["Active", "Revoked"], () => "licence_revoked")
    .with(["Active", "Surrendered"], () => "licence_revoked")
    .with(["Suspended", "Active"], () => "licence_reinstated")
    .with(["Suspended", "Suspended"], () => null)
    .with(["Suspended", "Revoked"], () => "licence_revoked")
    .with(["Suspended", "Surrendered"], () => "licence_revoked")
    .with(["Revoked", "Active"], () => "licence_reinstated")
    .with(["Revoked", "Suspended"], () => null)
    .with(["Revoked", "Revoked"], () => null)
    .with(["Revoked", "Surrendered"], () => null)
    .with(["Surrendered", "Active"], () => "licence_reinstated")
    .with(["Surrendered", "Suspended"], () => null)
    .with(["Surrendered", "Revoked"], () => null)
    .with(["Surrendered", "Surrendered"], () => null)
    .with(["UNKNOWN", "UNKNOWN"], () => null)
    .with(["UNKNOWN", P.union("Active", "Suspended", "Revoked", "Surrendered")], () => {
      log.warn({ previousStatusRaw, newStatusRaw }, "Unhandled sponsor status value for transition mapping");
      return null;
    })
    .with([P.union("Active", "Suspended", "Revoked", "Surrendered"), "UNKNOWN"], () => {
      log.warn({ previousStatusRaw, newStatusRaw }, "Unhandled sponsor status value for transition mapping");
      return null;
    })
    .exhaustive();
}

// ── Kill-switch ───────────────────────────────────────────────────────────────

let _pausedCache: { value: boolean; expiresAt: number } | null = null;

export function invalidateNotificationsPausedCache(): void {
  _pausedCache = null;
}

async function isNotificationsPaused(): Promise<boolean> {
  if (_pausedCache && Date.now() < _pausedCache.expiresAt) return _pausedCache.value;
  const flag = await storage.getSystemSetting('notifications_paused');
  _pausedCache = { value: flag === 'true', expiresAt: Date.now() + 60_000 };
  return _pausedCache.value;
}

// ── Channel mapping ───────────────────────────────────────────────────────────

/**
 * Maps DB notification_preferences columns + tier config to channel names.
 * Returns the channels this user has enabled for the given event type,
 * that their tier allows, and that are technically configured.
 */
export function getEnabledChannelsForUser(
  user: { subscriptionStatus: string | null; notifPrefs: NotifPrefs | null },
  prefsKey: string,
  channelPrefs: typeof notificationPreferences.$inferSelect | undefined,
): ChannelName[] {
  const enabled: ChannelName[] = [];

  const tierConfig = getTierConfig(user.subscriptionStatus);

  // Email
  if (tierConfig.channels.includes("email") && isChannelEventEnabled(user.notifPrefs, prefsKey, "email")) {
    const emailAddr = channelPrefs?.email ?? null;
    if (emailAddr) enabled.push("email");
  }

  // WhatsApp
  if (tierConfig.channels.includes("whatsapp") && isChannelEventEnabled(user.notifPrefs, prefsKey, "whatsapp")) {
    if (channelPrefs?.whatsappNumber && channelPrefs.whatsappVerified) enabled.push("whatsapp");
  }

  // SMS
  if (tierConfig.channels.includes("sms") && isChannelEventEnabled(user.notifPrefs, prefsKey, "sms")) {
    if (channelPrefs?.smsNumber && channelPrefs.smsVerified) enabled.push("sms");
  }

  // Webhook (enterprise only via tierConfig)
  if (tierConfig.webhooks && isChannelEventEnabled(user.notifPrefs, prefsKey, "webhook")) {
    const webhookUrl = channelPrefs?.webhookUrl ?? null;
    if (webhookUrl?.startsWith("https://")) enabled.push("webhook");
  }

  // In-app (real-time via Socket.IO)
  if (tierConfig.channels.includes("inApp") && isChannelEventEnabled(user.notifPrefs, prefsKey, "inApp")) {
    enabled.push("inApp");
  }

  return enabled;
}

/**
 * Returns the recipient identifier for a given channel.
 */
function getRecipientForChannel(
  channel: ChannelName,
  user: { id: string; email: string | null },
  channelPrefs: typeof notificationPreferences.$inferSelect | undefined,
): string | null {
  switch (channel) {
    case "email": return channelPrefs?.email ?? user.email;
    case "whatsapp": return channelPrefs?.whatsappNumber ?? null;
    case "sms": return channelPrefs?.smsNumber ?? null;
    case "webhook": return channelPrefs?.webhookUrl ?? null;
    case "inApp": return user.id;
    default: return null;
  }
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

export async function notifyUsersOfEvent(change: SponsorChange): Promise<{
  sent: number;
  skipped: number;
  failed: number;
  channelBreakdown?: Record<string, { sent: number; failed: number }>;
}> {
  let sent = 0, skipped = 0, failed = 0;
  const channelBreakdown: Record<string, { sent: number; failed: number }> = {};

  if (await isNotificationsPaused()) {
    log.info({ organisationName: change.organisationName }, 'Notifications paused by admin — skipping dispatch');
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const changeId = change.id;
  if (changeId === undefined) {
    log.warn({ changeId: change.id, organisationName: change.organisationName }, "[NotificationEngine] changeId not set, skipping");
    return { sent, skipped, failed };
  }

  const transitionEventType = match(change.changeType)
    .with("REMOVED_REVOKED", "RE_ACTIVATED", () =>
      mapStatusTransitionToNotifEvent(change.previousValue, change.newValue),
    )
    .otherwise(() => null);
  const prefsKey: string = transitionEventType ?? CHANGE_TYPE_MAP[change.changeType] ?? change.changeType;
  const companyName = change.organisationName;
  const normalizedOrg = normalizeName(companyName);

  try {
    const activeWatches = await db
      .select({ userId: companyWatches.userId })
      .from(companyWatches)
      .where(
        and(
          eq(companyWatches.organisationNameNormalized, normalizedOrg),
          eq(companyWatches.isActive, true),
        ),
      );

    if (activeWatches.length === 0) return { sent, skipped, failed, channelBreakdown };

    const uniqueUserIds = [...new Set(activeWatches.map(w => w.userId))];

    const [userRows, prefRows] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          subscriptionStatus: users.subscriptionStatus,
          notifPrefs: users.notifPrefs,
        })
        .from(users)
        .where(inArray(users.id, uniqueUserIds)),
      db
        .select()
        .from(notificationPreferences)
        .where(inArray(notificationPreferences.userId, uniqueUserIds)),
    ]);

    const userMap = new Map(userRows.map(u => [u.id, u]));
    const prefMap = new Map(prefRows.map(p => [p.userId, p]));

    // Ensure the channel registry is populated once
    registerDefaultChannels();

    // Process users concurrently with p-limit(10)
    const userTasks = uniqueUserIds.map(userId =>
      limit(async () => {
        const user = userMap.get(userId);
        if (!user) { skipped++; return; }

        const channelPrefs = prefMap.get(userId);

        // Determine which channels this user gets for this event
        const enabledChannels = getEnabledChannelsForUser(
          { subscriptionStatus: user.subscriptionStatus, notifPrefs: user.notifPrefs as NotifPrefs | null },
          prefsKey,
          channelPrefs,
        );

        if (enabledChannels.length === 0) {
          await logNotification({
            userId,
            changeId,
            eventType: prefsKey,
            channel: "email",
            companyName,
            success: false,
            errorDetails: "No channels enabled for this event/tier",
          });
          skipped++;
          return;
        }

        // Check rate limit once before dispatching to all channels
        try {
          if (await isRateLimited(userId, companyName)) {
            await logNotification({
              userId,
              changeId,
              eventType: prefsKey,
              channel: enabledChannels[0],
              companyName,
              success: false,
              errorDetails: "Rate limit exceeded",
            });
            skipped++;
            return;
          }
        } catch {
          await logNotification({
            userId,
            changeId,
            eventType: prefsKey,
            channel: enabledChannels[0],
            companyName,
            success: false,
            errorDetails: "Rate limit check failed",
          });
          skipped++;
          return;
        }

        // Dispatch to each enabled channel
        for (const channelName of enabledChannels) {
          const channel = getChannel(channelName);
          if (!channel) {
            log.warn({ channelName }, "Channel not registered — skipping");
            continue;
          }

          const recipient = getRecipientForChannel(channelName, user, channelPrefs);
          if (!recipient) {
            await logNotification({
              userId, changeId, eventType: prefsKey, channel: channelName,
              companyName, success: false, errorDetails: "No recipient address",
            });
            skipped++;
            continue;
          }

          try {
            const result = await channel.send({
              userId,
              changeId,
              eventType: prefsKey,
              companyName,
              organisationName: companyName,
              changeType: change.changeType,
              previousValue: change.previousValue,
              newValue: change.newValue,
              recipient,
            });

            await logNotification({
              userId, changeId, eventType: prefsKey, channel: channelName,
              companyName,
              success: result.success,
              providerMessageId: result.providerMessageId,
              errorDetails: result.error,
            });

            if (result.success) {
              sent++;
              channelBreakdown[channelName] = channelBreakdown[channelName] ?? { sent: 0, failed: 0 };
              channelBreakdown[channelName].sent++;
            } else {
              failed++;
              channelBreakdown[channelName] = channelBreakdown[channelName] ?? { sent: 0, failed: 0 };
              channelBreakdown[channelName].failed++;
            }

            log.info(
              `[NotificationEngine] ${result.success ? "Sent" : "Failed"} ${prefsKey} via ${channelName} to user ${userId}`,
            );
          } catch (err: unknown) {
            failed++;
            const errMsg = err instanceof Error ? err.message : String(err);
            await logNotification({
              userId, changeId, eventType: prefsKey, channel: channelName,
              companyName, success: false, errorDetails: errMsg,
            });
            log.error({ err: errMsg, userId, channelName }, `Channel dispatch error`);
          }
        }
      })
    );

    await Promise.all(userTasks);
  } catch (err) {
    log.error({ err, changeId }, "Fatal error for change");
  }

  return { sent, skipped, failed, channelBreakdown };
}

/**
 * Drains pre-Part-5 queued entries from notif_engine_log (legacy table).
 * Now uses the email channel instead of raw sendViaResend.
 */
export async function processQueuedEngineEvents(orchestration?: { correlationId?: string; triggerSource?: TriggerSource }): Promise<void> {
  const now = new Date();
  const triggerSource = orchestration?.triggerSource ?? "cron";
  const telemetry = startJobRun("notificationDrain", triggerSource, "inline", orchestration?.correlationId);
  let outcome: "success" | "failed" = "success";
  let failureReason: string | null = null;

  try {
    const queued = await db
      .select()
      .from(notifEngineLog)
      .where(
        and(
          eq(notifEngineLog.status, "queued"),
          lte(notifEngineLog.deliverAfter, now),
        ),
      )
      .limit(100);

    if (queued.length === 0) return;

    log.info(`[NotificationEngine] Processing ${queued.length} queued engine event(s)...`);

    const uniqueUserIds = [...new Set(queued.map(q => q.userId))];
    const uniqueChangeIds = [...new Set(queued.map(q => q.changeId))];

    const [userRows, prefRows, changeRows] = await Promise.all([
      db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, uniqueUserIds)),
      db
        .select()
        .from(notificationPreferences)
        .where(inArray(notificationPreferences.userId, uniqueUserIds)),
      db
        .select()
        .from(sponsorChanges)
        .where(inArray(sponsorChanges.id, uniqueChangeIds)),
    ]);

    const userMap = new Map(userRows.map(u => [u.id, u]));
    const prefMap = new Map(prefRows.map(p => [p.userId, p]));
    const changeMap = new Map(changeRows.map(c => [c.id, c]));

    registerDefaultChannels();
    const emailChan = getChannel("email");

    for (const entry of queued) {
      try {
        const user = userMap.get(entry.userId);
        const change = changeMap.get(entry.changeId);

        if (!user || !change) {
          await db
            .update(notifEngineLog)
            .set({ status: "failed", errorDetails: "User or change record not found" })
            .where(eq(notifEngineLog.id, entry.id));
          continue;
        }

        const channelPrefs = prefMap.get(entry.userId);
        const recipientEmail = channelPrefs?.email ?? user.email;

        if (!recipientEmail || !emailChan) {
          await db
            .update(notifEngineLog)
            .set({ status: "failed", errorDetails: "No recipient email or email channel unavailable" })
            .where(eq(notifEngineLog.id, entry.id));
          continue;
        }

        const result = await emailChan.send({
          userId: entry.userId,
          changeId: change.id,
          eventType: entry.eventType,
          companyName: change.organisationName,
          organisationName: change.organisationName,
          changeType: change.changeType,
          previousValue: change.previousValue,
          newValue: change.newValue,
          snapshotDate: change.snapshotDate,
          recipient: recipientEmail,
        });

        await db
          .update(notifEngineLog)
          .set({
            status: result.success ? "sent" : "failed",
            sentAt: result.success ? new Date() : null,
            providerMessageId: result.providerMessageId ?? null,
            errorDetails: result.error ?? null,
          })
          .where(eq(notifEngineLog.id, entry.id));

        log.info(
          `[NotificationEngine] Deferred ${entry.eventType}: ${result.success ? "sent" : "failed"} to ${recipientEmail}`,
        );
      } catch (err: unknown) {
        log.error({ err }, `[NotificationEngine] Error delivering queued entry ${entry.id}`);
        await db
          .update(notifEngineLog)
          .set({ status: "failed", errorDetails: err instanceof Error ? err.message : String(err) })
          .where(eq(notifEngineLog.id, entry.id));
      }
    }

    log.info("[NotificationEngine] Queued event processing complete.");
  } catch (err) {
    log.error({ err }, "[NotificationEngine] Fatal error in processQueuedEngineEvents");
    outcome = "failed";
    failureReason = err instanceof Error ? err.message : String(err);
  } finally {
    finishJobRun({ ...telemetry, jobName: "notificationDrain", triggerSource, runMode: "inline", result: outcome, failureReason });
  }
}
