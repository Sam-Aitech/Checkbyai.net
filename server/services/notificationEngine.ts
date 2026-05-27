/**
 * Notification Engine — event-type-filtered notification dispatch for paid subscribers.
 *
 * Supersedes the legacy notificationDispatcher for the main job loop.
 * Checks users.notif_prefs (jsonb) to skip events the user has opted out of.
 * Uses a Redis-backed sliding-window rate limiter (sorted set) — 3 sends per user per company per hour.
 * Logs every action to notif_engine_log for audit.
 *
 * Deferred delivery (starter plan, same-day window):
 *   - Entries are written with status='queued' and a deliverAfter timestamp.
 *   - processQueuedEngineEvents() is called hourly by the cron scheduler to deliver them.
 *
 * Why ts-pattern: change-event and status-transition routing must be explicit,
 * exhaustive, and drift-resistant as upstream status enums evolve.
 * Priority 5 enum source of truth: shared/schema.ts sponsor_licence_timeline.licenceStatus.
 */

import { db } from "../db";
import { storage } from "../storage";
import { eq, and, inArray, lte } from "drizzle-orm";
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
import { getTierConfig } from "../utils/tierConfig";
import { getAppUrl } from "../utils/appUrl";
import { logger } from "../utils/logger";
import { startJobRun, finishJobRun, type TriggerSource } from "../utils/jobTelemetry";
import { match, P } from "ts-pattern";

const log = logger.child({ module: "NotificationEngine" });

// ── Types ─────────────────────────────────────────────────────────────────────

// Snake_case event types matching users.notif_prefs keys (NotifPrefs in schema.ts).
export type NotifEventType =
  | "licence_revoked"
  | "rating_downgraded"
  | "licence_reinstated"
  | "rating_upgraded"
  | "route_added"
  | "route_removed"
  | "weekly_digest";

// Maps DB changeType (ALL_CAPS from sponsorChanges table) → snake_case NotifPrefs key.
// Unmapped types (e.g. NEW_LICENCE) pass through isEventEnabled as unknown keys → enabled.
const CHANGE_TYPE_MAP: Partial<Record<string, NotifEventType>> = {
  REMOVED_REVOKED: "licence_revoked",
  RE_ACTIVATED:    "licence_reinstated",
  UPGRADED:        "rating_upgraded",
  DOWNGRADED:      "rating_downgraded",
  ROUTE_CHANGE:    "route_added",
};

type SponsorLicenceStatus = "Active" | "Suspended" | "Revoked" | "Surrendered";
type NormalizedSponsorLicenceStatus = SponsorLicenceStatus | "UNKNOWN";

function normalizeSponsorLicenceStatus(value: string | null | undefined): NormalizedSponsorLicenceStatus {
  return match((value ?? "").trim().toUpperCase())
    .with("ACTIVE", () => "Active" as const)
    .with("SUSPENDED", () => "Suspended" as const)
    .with("REVOKED", () => "Revoked" as const)
    // Internal state-machine status is intentionally normalized into
    // user-facing licence-status semantics for transition alert routing.
    .with("REMOVED_REVOKED", () => "Revoked" as const)
    .with("SURRENDERED", () => "Surrendered" as const)
    .otherwise(() => "UNKNOWN" as const);
}

function mapStatusTransitionToNotifEvent(
  previousStatusRaw: string | null | undefined,
  newStatusRaw: string | null | undefined,
): NotifEventType | null {
  const previousStatus = normalizeSponsorLicenceStatus(previousStatusRaw);
  const newStatus = normalizeSponsorLicenceStatus(newStatusRaw);

  return match<[NormalizedSponsorLicenceStatus, NormalizedSponsorLicenceStatus]>([
    previousStatus,
    newStatus,
  ])
    .returnType<NotifEventType | null>()
    .with(["Active", "Active"], () => null)
    // TODO: add dedicated "licence_suspended" preference/event key; until then,
    // suspension alerts are routed via "licence_revoked".
    .with(["Active", "Suspended"], () => "licence_revoked")
    .with(["Active", "Revoked"], () => "licence_revoked")
    .with(["Active", "Surrendered"], () => "licence_revoked")
    .with(["Suspended", "Active"], () => "licence_reinstated")
    .with(["Suspended", "Suspended"], () => null)
    .with(["Suspended", "Revoked"], () => "licence_revoked")
    .with(["Suspended", "Surrendered"], () => "licence_revoked")
    .with(["Revoked", "Active"], () => "licence_reinstated")
    // No alert: already in a removed terminal family.
    .with(["Revoked", "Suspended"], () => null)
    .with(["Revoked", "Revoked"], () => null)
    // No alert: both statuses represent non-active terminal states.
    .with(["Revoked", "Surrendered"], () => null)
    .with(["Surrendered", "Active"], () => "licence_reinstated")
    // No alert: non-active terminal-family transitions currently not user-facing.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEventEnabled(prefs: NotifPrefs | null, eventType: string): boolean {
  if (!prefs) return true; // null = all events enabled (default)
  const pref = (prefs as any)[eventType] as NotifPrefs[NotifEventType] | undefined;
  if (pref === undefined) return true; // unmapped event types always pass through
  return pref.enabled === true && pref.channels.email === true;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Email builder ─────────────────────────────────────────────────────────────

export function buildEmail(
  changeType: string,
  organisationName: string,
  previousValue: string | null | undefined,
  newValue: string | null | undefined,
): { subject: string; html: string } {
  const company = esc(organisationName);
  const prev = previousValue ? esc(previousValue) : null;
  const next = newValue ? esc(newValue) : null;

  type Meta = { bg: string; headline: string; subject: string; body: string };
  const meta: Record<string, Meta> = {
    REMOVED_REVOKED: {
      bg: "linear-gradient(135deg,#8B0000 0%,#CC0000 100%)",
      headline: "Sponsor Licence Removed",
      subject: `URGENT: ${organisationName} removed from UK sponsor licence register`,
      body: `<strong>${company}</strong> has been removed from the UK Home Office Register of Licensed Sponsors. If you hold a visa sponsored by this organisation, seek immigration advice immediately.`,
    },
    NEW_LICENCE: {
      bg: "linear-gradient(135deg,#003366 0%,#0066CC 100%)",
      headline: "New Sponsor Licence Granted",
      subject: `Update: ${organisationName} added to sponsor licence register`,
      body: `<strong>${company}</strong> has been added to the UK Home Office Register of Licensed Sponsors${next ? ` under the <strong>${next}</strong> route` : ""}.`,
    },
    RE_ACTIVATED: {
      bg: "linear-gradient(135deg,#003366 0%,#0066CC 100%)",
      headline: "Sponsor Licence Reinstated",
      subject: `Update: ${organisationName} has returned to the sponsor licence register`,
      body: `<strong>${company}</strong> has reappeared on the UK Home Office Register of Licensed Sponsors after a period of absence.`,
    },
    UPGRADED: {
      bg: "linear-gradient(135deg,#006633 0%,#009933 100%)",
      headline: "Sponsor Licence Upgraded",
      subject: `Good news: ${organisationName} sponsor licence upgraded`,
      body: `<strong>${company}</strong> has had their sponsor licence rating upgraded${prev && next ? ` from <strong>${prev}</strong> to <strong>${next}</strong>` : ""}.`,
    },
    DOWNGRADED: {
      bg: "linear-gradient(135deg,#CC6600 0%,#FF8C00 100%)",
      headline: "Sponsor Licence Downgraded",
      subject: `Alert: ${organisationName} sponsor licence downgraded`,
      body: `<strong>${company}</strong> has had their sponsor licence rating downgraded${prev && next ? ` from <strong>${prev}</strong> to <strong>${next}</strong>` : ""}. The Home Office has identified compliance issues.`,
    },
    ROUTE_CHANGE: {
      bg: "linear-gradient(135deg,#4B0082 0%,#8A2BE2 100%)",
      headline: "Sponsor Route Changed",
      subject: `Update: ${organisationName} sponsor route changed`,
      body: `<strong>${company}</strong> has changed their sponsorship route${prev && next ? ` from <strong>${prev}</strong> to <strong>${next}</strong>` : ""}.`,
    },
    NAME_CHANGE: {
      bg: "linear-gradient(135deg,#333 0%,#666 100%)",
      headline: "Organisation Name Changed",
      subject: `Update: ${organisationName} has changed name`,
      body: `This sponsor has changed their registered name${prev && next ? ` from <strong>${prev}</strong> to <strong>${next}</strong>` : ""}.`,
    },
  };

  const m = meta[changeType] ?? meta.NEW_LICENCE;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:${m.bg};padding:30px;border-radius:10px 10px 0 0;">
        <h1 style="color:#fff;margin:0;text-align:center;font-size:22px;">${m.headline}</h1>
      </div>
      <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;">
        <p style="color:#333;font-size:15px;line-height:1.6;margin:0;">${m.body}</p>
      </div>
      <div style="background:#f8f9fa;padding:20px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
        <p style="color:#666;font-size:12px;margin:0 0 8px;text-align:center;">
          You are receiving this because you are watching <strong>${company}</strong> on Check By AI Sponsor Monitor.
        </p>
        <p style="color:#999;font-size:11px;margin:0;text-align:center;">
          Manage your preferences at
          <a href="${getAppUrl()}/dashboard/sponsor" style="color:#0066CC;">checkbyai.net/dashboard/sponsor</a>
        </p>
      </div>
    </div>`;

  return { subject: m.subject, html };
}

// ── Resend delivery ───────────────────────────────────────────────────────────

const FROM_ADDRESS = "Sponsor Monitor <alerts@checkbyai.net>";

export async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; providerMessageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, error: "RESEND_API_KEY not configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Resend ${response.status}: ${text}` };
    }

    const data: any = await response.json();
    return { success: true, providerMessageId: data.id };
  } catch (err: unknown) {
    return { success: false, error: (err instanceof Error ? err.message : String(err)) ?? "Unknown send error" };
  }
}

// ── Audit logging ─────────────────────────────────────────────────────────────
// Writes to notif_log (new schema). notif_engine_log is still read by
// processQueuedEngineEvents to drain pre-Part-5 queued entries.

async function logEvent(
  userId: string,
  changeId: number | undefined,
  eventType: string,
  companyName: string,
  success: boolean,
  opts?: { errorDetails?: string; providerMessageId?: string },
): Promise<void> {
  try {
    await db.insert(notifLog).values({
      userId,
      changeId: changeId ?? null,
      eventType,
      channel: "email",
      companyName,
      success,
      providerMessageId: opts?.providerMessageId ?? null,
      errorDetails: opts?.errorDetails ?? null,
    });
  } catch (err) {
    log.error({ err }, "[NotificationEngine] Failed to write log entry");
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Dispatches notifications for a single sponsor change event to all affected watchers.
 * Checks notif_prefs (per-event enabled + channels.email), applies per-company rate limit
 * (3/hour), and sends immediately via Resend. Writes results to notif_log.
 *
 * Call fire-and-forget from the sponsor monitor job:
 *   notifyUsersOfEvent(change).catch(err => console.error(...));
 */
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

export async function notifyUsersOfEvent(change: SponsorChange): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0, skipped = 0, failed = 0;

  // Global kill switch — admin can pause all notifications via /api/admin/notifications/pause
  if (await isNotificationsPaused()) {
     log.info({ organisationName: change.organisationName }, 'Notifications paused by admin — skipping dispatch');
     return { sent: 0, skipped: 0, failed: 0 };
   }

  const changeId = change.id;
  if (changeId === undefined) {
    log.warn({ changeId: change.id, organisationName: change.organisationName }, "[NotificationEngine] changeId not set, skipping");
    return { sent, skipped, failed };
  }

  // Resolve snake_case prefs key from DB changeType (ALL_CAPS).
  // Unmapped types (e.g. NEW_LICENCE) pass through isEventEnabled as unknown → enabled.
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

    if (activeWatches.length === 0) return { sent, skipped, failed };

    const uniqueUserIds = [...new Set(activeWatches.map(w => w.userId))];

    // Batch all DB lookups upfront — 2 parallel queries instead of N×2
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

    // Build email payload once, shared across all recipients
    const { subject, html } = buildEmail(
      change.changeType,
      companyName,
      change.previousValue,
      change.newValue,
    );

    for (const userId of uniqueUserIds) {
      try {
        const user = userMap.get(userId);
        if (!user) {
          skipped++;
          continue;
        }

        // Free tier: no email channel — skip without logging
        const tierConfig = getTierConfig(user.subscriptionStatus);
        if (!tierConfig.channels.includes("email")) {
          skipped++;
          continue;
        }

        // Per-event, per-channel opt-out check (notif_prefs jsonb on users table)
        if (!isEventEnabled(user.notifPrefs as NotifPrefs | null, prefsKey)) {
          await logEvent(userId, changeId, prefsKey, companyName, false, {
            errorDetails: "Event type opted out",
          });
          skipped++;
          continue;
        }

        // In-memory rate limit: 3 sends per user per company per hour
        if (await isRateLimited(userId, companyName)) {
          await logEvent(userId, changeId, prefsKey, companyName, false, {
            errorDetails: "Rate limit exceeded",
          });
          skipped++;
          continue;
        }

        // Channel preference check
        const channelPrefs = prefMap.get(userId);
        const emailEnabled = !channelPrefs || channelPrefs.emailEnabled;
        const recipientEmail = channelPrefs?.email ?? user.email;

        if (!emailEnabled || !recipientEmail) {
          await logEvent(userId, changeId, prefsKey, companyName, false, {
            errorDetails: "Email disabled or no address on file",
          });
          skipped++;
          continue;
        }

        // Send immediately (all tiers)
        const sendResult = await sendViaResend(recipientEmail, subject, html);
        await logEvent(userId, changeId, prefsKey, companyName, sendResult.success, {
          errorDetails: sendResult.error,
          providerMessageId: sendResult.providerMessageId,
        });

        if (sendResult.success) {
          sent++;
        } else {
          failed++;
        }

        log.info(
          `[NotificationEngine] ${sendResult.success ? "Sent" : "Failed"} ${prefsKey} to ${recipientEmail} (user ${userId})`,
        );
       } catch (err: unknown) {
         failed++;
         const errMsg = err instanceof Error ? err.message : String(err);
         log.error({ err, userId, changeId }, `Error processing user ${userId}: ${errMsg}`);
         await logEvent(userId, changeId, prefsKey, companyName, false, { errorDetails: errMsg });
       }
     }
   } catch (err) {
     log.error({ err, changeId }, "Fatal error for change");
   }
   
   // Return metrics for aggregation
   return { sent, skipped, failed };
 }

/**
 * Drains pre-Part-5 queued entries from notif_engine_log (legacy table).
 * New sends write to notif_log; this function is transitional and will be retired
 * once the notif_engine_log queue is empty. Called hourly by the cron scheduler.
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

        if (!recipientEmail) {
          await db
            .update(notifEngineLog)
            .set({ status: "failed", errorDetails: "No recipient email" })
            .where(eq(notifEngineLog.id, entry.id));
          continue;
        }

        const { subject, html } = buildEmail(
          change.changeType,
          change.organisationName,
          change.previousValue,
          change.newValue,
        );

        const sendResult = await sendViaResend(recipientEmail, subject, html);

        await db
          .update(notifEngineLog)
          .set({
            status: sendResult.success ? "sent" : "failed",
            sentAt: sendResult.success ? new Date() : null,
            providerMessageId: sendResult.providerMessageId ?? null,
            errorDetails: sendResult.error ?? null,
          })
          .where(eq(notifEngineLog.id, entry.id));

        log.info(
          `[NotificationEngine] Deferred ${entry.eventType}: ${sendResult.success ? "sent" : "failed"} to ${recipientEmail}`,
        );
      } catch (err: unknown) {
        log.error({ err },
          `[NotificationEngine] Error delivering queued entry ${entry.id}`,
        );
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
