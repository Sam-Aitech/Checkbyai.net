/**
 * Notification Engine — event-type-filtered notification dispatch for paid subscribers.
 *
 * Uses a channel-based dispatch architecture:
 *   - EmailChannel (Resend → SendGrid → SMTP chain)
 *   - WhatsAppChannel (Twilio)
 *   - SMSChannel (Brevo)
 *   - WebhookChannel (HMAC-signed, HTTPS-only, quick in-process retries)
 *   - PushChannel (Web Push API via VAPID, one send per subscribed device)
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
import { eq, and, inArray, lte } from "drizzle-orm";
import { getRedis } from "../utils/redisClient";
import {
  companyWatches,
  notifEngineLog,
  notificationPreferences,
  pushSubscriptions,
  sponsorChanges,
  users,
} from "@shared/schema";
import type { NotifPrefs } from "@shared/schema";
import type { SponsorChange } from "../utils/sponsorListFetcher";
import { normalizeName } from "../utils/sponsorListFetcher";
import { getTierConfig } from "../utils/tierConfig";
import { logger } from "../utils/logger";
import { startJobRun, finishJobRun, type TriggerSource } from "../utils/jobTelemetry";
import { match, P } from "ts-pattern";
import pLimit from "p-limit";
import { registerDefaultChannels, getChannel } from "./notificationChannels/registry";
import type { ChannelName, ChannelPayload, NotificationChannel } from "./notificationChannels/types";
import { logNotification } from "./notificationChannels/audit";

const log = logger.child({ module: "NotificationEngine" });

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

/**
 * Event-level enable check, ignoring per-channel flags.
 * Push has no per-event channel toggle in NotifPrefs (the UI exposes a single
 * global subscribe switch), so it is gated by event enablement + an active
 * subscription rather than by pref.channels.
 */
export function isEventEnabled(prefs: NotifPrefs | null, eventType: string): boolean {
  if (!prefs) return true;
  const pref = (prefs as any)[eventType] as NotifPrefs[NotifEventType] | undefined;
  if (pref === undefined) return true;
  return pref.enabled === true;
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

  // Tier permits the channel AND the user has it enabled for this event type.
  // Param is the tier-config channel union (excludes webhook, which is gated separately).
  const allows = (channel: "email" | "whatsapp" | "sms" | "inApp"): boolean =>
    tierConfig.channels.includes(channel) && isChannelEventEnabled(user.notifPrefs, prefsKey, channel);

  if (allows("email") && Boolean(channelPrefs?.email)) enabled.push("email");
  if (allows("whatsapp") && Boolean(channelPrefs?.whatsappNumber && channelPrefs.whatsappVerified)) enabled.push("whatsapp");
  if (allows("sms") && Boolean(channelPrefs?.smsNumber && channelPrefs.smsVerified)) enabled.push("sms");
  if (allows("inApp")) enabled.push("inApp");

  // Webhook is gated by tierConfig.webhooks (enterprise) rather than the channels list.
  const webhookEnabled = tierConfig.webhooks && isChannelEventEnabled(user.notifPrefs, prefsKey, "webhook");
  if (webhookEnabled && Boolean(channelPrefs?.webhookUrl?.startsWith("https://"))) enabled.push("webhook");

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

// ── Per-user dispatch helpers ───────────────────────────────────────────────

interface DispatchContext {
  change: SponsorChange;
  changeId: number;
  prefsKey: string;
  companyName: string;
}

interface NotifUser {
  id: string;
  email: string | null;
  subscriptionStatus: string | null;
  notifPrefs: NotifPrefs | null;
}

type ChannelTally = Record<string, { sent: number; failed: number }>;

interface UserTally {
  sent: number;
  skipped: number;
  failed: number;
  breakdown: ChannelTally;
}

function bumpBreakdown(breakdown: ChannelTally, channel: string, ok: boolean): void {
  const entry = breakdown[channel] ?? { sent: 0, failed: 0 };
  if (ok) entry.sent++; else entry.failed++;
  breakdown[channel] = entry;
}

function mergeBreakdown(into: ChannelTally, from: ChannelTally): void {
  for (const [channel, counts] of Object.entries(from)) {
    const entry = into[channel] ?? { sent: 0, failed: 0 };
    entry.sent += counts.sent;
    entry.failed += counts.failed;
    into[channel] = entry;
  }
}

// Send one payload through one channel, audit-log it, and record counts.
async function sendAndRecord(
  channel: NotificationChannel,
  payload: ChannelPayload,
  ctx: DispatchContext,
  channelName: string,
  userId: string,
  tally: UserTally,
): Promise<void> {
  try {
    const result = await channel.send(payload);
    await logNotification({
      userId, changeId: ctx.changeId, eventType: ctx.prefsKey, channel: channelName,
      companyName: ctx.companyName, success: result.success,
      providerMessageId: result.providerMessageId, errorDetails: result.error,
    });
    if (result.success) tally.sent++; else tally.failed++;
    bumpBreakdown(tally.breakdown, channelName, result.success);
    log.info(`[NotificationEngine] ${result.success ? "Sent" : "Failed"} ${ctx.prefsKey} via ${channelName} to user ${userId}`);
  } catch (err: unknown) {
    tally.failed++;
    bumpBreakdown(tally.breakdown, channelName, false);
    const errMsg = err instanceof Error ? err.message : String(err);
    await logNotification({
      userId, changeId: ctx.changeId, eventType: ctx.prefsKey, channel: channelName,
      companyName: ctx.companyName, success: false, errorDetails: errMsg,
    });
    log.error({ err: errMsg, userId, channelName }, "Channel dispatch error");
  }
}

function buildChannelPayload(ctx: DispatchContext, userId: string, recipient: string): ChannelPayload {
  return {
    userId,
    changeId: ctx.changeId,
    eventType: ctx.prefsKey,
    companyName: ctx.companyName,
    organisationName: ctx.companyName,
    changeType: ctx.change.changeType,
    previousValue: ctx.change.previousValue,
    newValue: ctx.change.newValue,
    recipient,
  };
}

async function dispatchChannels(
  ctx: DispatchContext,
  user: NotifUser,
  channelPrefs: typeof notificationPreferences.$inferSelect | undefined,
  enabledChannels: ChannelName[],
  tally: UserTally,
): Promise<void> {
  for (const channelName of enabledChannels) {
    const channel = getChannel(channelName);
    if (!channel) {
      log.warn({ channelName }, "Channel not registered — skipping");
      continue;
    }
    const recipient = getRecipientForChannel(channelName, user, channelPrefs);
    if (!recipient) {
      await logNotification({
        userId: user.id, changeId: ctx.changeId, eventType: ctx.prefsKey, channel: channelName,
        companyName: ctx.companyName, success: false, errorDetails: "No recipient address",
      });
      tally.skipped++;
      continue;
    }
    await sendAndRecord(channel, buildChannelPayload(ctx, user.id, recipient), ctx, channelName, user.id, tally);
  }
}

// Push fans out one send per subscribed device (unlike single-recipient channels).
async function dispatchPush(
  ctx: DispatchContext,
  userId: string,
  pushSubs: { endpoint: string; p256dh: string; auth: string }[],
  tally: UserTally,
): Promise<void> {
  const pushChannel = getChannel("push");
  if (!pushChannel) {
    log.warn({ userId }, "Push channel not registered — skipping");
    return;
  }
  for (const sub of pushSubs) {
    const payload: ChannelPayload = {
      ...buildChannelPayload(ctx, userId, sub.endpoint),
      subscriber: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    };
    await sendAndRecord(pushChannel, payload, ctx, "push", userId, tally);
  }
}

// Returns true if dispatch may proceed; false (and audit-logs) if rate-limited or the check errored.
async function passesRateLimit(ctx: DispatchContext, userId: string, logChannel: string): Promise<boolean> {
  try {
    if (!(await isRateLimited(userId, ctx.companyName))) return true;
    await logNotification({
      userId, changeId: ctx.changeId, eventType: ctx.prefsKey, channel: logChannel,
      companyName: ctx.companyName, success: false, errorDetails: "Rate limit exceeded",
    });
    return false;
  } catch {
    await logNotification({
      userId, changeId: ctx.changeId, eventType: ctx.prefsKey, channel: logChannel,
      companyName: ctx.companyName, success: false, errorDetails: "Rate limit check failed",
    });
    return false;
  }
}

async function processUser(
  ctx: DispatchContext,
  user: NotifUser,
  channelPrefs: typeof notificationPreferences.$inferSelect | undefined,
  pushSubs: { endpoint: string; p256dh: string; auth: string }[],
): Promise<UserTally> {
  const tally: UserTally = { sent: 0, skipped: 0, failed: 0, breakdown: {} };

  const enabledChannels = getEnabledChannelsForUser(
    { subscriptionStatus: user.subscriptionStatus, notifPrefs: user.notifPrefs },
    ctx.prefsKey,
    channelPrefs,
  );

  // Push is gated by tier (paid plans, mirroring in-app), event-level enablement,
  // and an active subscription — independent of the per-channel toggle.
  const pushAllowed =
    getTierConfig(user.subscriptionStatus).channels.includes("inApp") &&
    isEventEnabled(user.notifPrefs, ctx.prefsKey) &&
    pushSubs.length > 0;

  if (enabledChannels.length === 0 && !pushAllowed) {
    await logNotification({
      userId: user.id, changeId: ctx.changeId, eventType: ctx.prefsKey, channel: "email",
      companyName: ctx.companyName, success: false, errorDetails: "No channels enabled for this event/tier",
    });
    tally.skipped++;
    return tally;
  }

  const rateLimitLogChannel = enabledChannels[0] ?? "push";
  if (!(await passesRateLimit(ctx, user.id, rateLimitLogChannel))) {
    tally.skipped++;
    return tally;
  }

  await dispatchChannels(ctx, user, channelPrefs, enabledChannels, tally);
  if (pushAllowed) await dispatchPush(ctx, user.id, pushSubs, tally);
  return tally;
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

    const [userRows, prefRows, pushSubRows] = await Promise.all([
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
      db
        .select({
          userId: pushSubscriptions.userId,
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, uniqueUserIds)),
    ]);

    const userMap = new Map<string, NotifUser>(
      userRows.map(u => [u.id, { id: u.id, email: u.email, subscriptionStatus: u.subscriptionStatus, notifPrefs: u.notifPrefs as NotifPrefs | null }]),
    );
    const prefMap = new Map(prefRows.map(p => [p.userId, p]));
    const pushSubMap = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
    for (const sub of pushSubRows) {
      const arr = pushSubMap.get(sub.userId) ?? [];
      arr.push(sub);
      pushSubMap.set(sub.userId, arr);
    }

    // Ensure the channel registry is populated once
    registerDefaultChannels();

    const ctx: DispatchContext = { change, changeId, prefsKey, companyName };

    // Process users concurrently with p-limit(10), then fold per-user tallies in.
    const userTasks = uniqueUserIds.map(userId =>
      limit(async () => {
        const user = userMap.get(userId);
        if (!user) { skipped++; return; }

        const tally = await processUser(ctx, user, prefMap.get(userId), pushSubMap.get(userId) ?? []);
        sent += tally.sent;
        skipped += tally.skipped;
        failed += tally.failed;
        mergeBreakdown(channelBreakdown, tally.breakdown);
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
