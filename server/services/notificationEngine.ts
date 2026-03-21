/**
 * Notification Engine — event-type-filtered notification dispatch for paid subscribers.
 *
 * Supersedes the legacy notificationDispatcher for the main job loop.
 * Checks users.notif_prefs (jsonb) to skip events the user has opted out of.
 * Uses an in-memory rate limiter (Map<userId, timestamp[]>) — 10 sends per 24h.
 * Logs every action to notif_engine_log for audit.
 *
 * Deferred delivery (starter plan, same-day window):
 *   - Entries are written with status='queued' and a deliverAfter timestamp.
 *   - processQueuedEngineEvents() is called hourly by the cron scheduler to deliver them.
 */

import { db } from "../db";
import { eq, and, inArray, lte } from "drizzle-orm";
import {
  companyWatches,
  notifEngineLog,
  notificationPreferences,
  sponsorChanges,
  users,
} from "@shared/schema";
import type { NotifPrefs } from "@shared/schema";
import type { SponsorChange } from "../utils/sponsorListFetcher";
import { normalizeName } from "../utils/sponsorListFetcher";
import { getTierConfig, getDeliverAfter } from "../utils/tierConfig";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifEventType =
  | "NEW_LICENCE"
  | "REMOVED_REVOKED"
  | "RE_ACTIVATED"
  | "UPGRADED"
  | "DOWNGRADED"
  | "ROUTE_CHANGE"
  | "NAME_CHANGE";

// ── Rate limiter ──────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const rateLimiter = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimiter.get(userId) ?? []).filter(t => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  rateLimiter.set(userId, timestamps);
  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEventEnabled(prefs: NotifPrefs | null, eventType: string): boolean {
  if (!prefs) return true; // null = all events enabled (backwards-compatible default)
  // prefs uses snake_case keys; legacy engine passes ALL_CAPS changeType.
  // Unknown keys are treated as enabled until Part 5 maps call sites to snake_case.
  const pref = (prefs as any)[eventType];
  if (pref === undefined) return true;
  return pref.enabled !== false;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Email builder ─────────────────────────────────────────────────────────────

function buildEmail(
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
          <a href="https://checkbyai.net/dashboard/sponsor" style="color:#0066CC;">checkbyai.net/dashboard/sponsor</a>
        </p>
      </div>
    </div>`;

  return { subject: m.subject, html };
}

// ── Resend delivery ───────────────────────────────────────────────────────────

const FROM_ADDRESS = "Sponsor Monitor <alerts@checkbyai.net>";

async function sendViaResend(
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
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unknown send error" };
  }
}

// ── Audit logging ─────────────────────────────────────────────────────────────

async function logEvent(
  userId: string,
  changeId: number,
  eventType: string,
  status: string,
  opts?: { errorDetails?: string; providerMessageId?: string; deliverAfter?: Date },
): Promise<void> {
  try {
    await db.insert(notifEngineLog).values({
      userId,
      changeId,
      eventType,
      channel: "email",
      status,
      sentAt: status === "sent" ? new Date() : null,
      deliverAfter: opts?.deliverAfter ?? null,
      providerMessageId: opts?.providerMessageId ?? null,
      errorDetails: opts?.errorDetails ?? null,
    });
  } catch (err) {
    console.error("[NotificationEngine] Failed to write log entry:", err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Dispatches notifications for a single sponsor change event to all affected watchers.
 * Respects event-type preferences (notifPrefs), channel preferences, tier eligibility,
 * and the in-memory rate limiter.
 *
 * Starter plan users: queued for same-day delivery (written to notif_engine_log with
 * status='queued' + deliverAfter timestamp; picked up by processQueuedEngineEvents).
 * Pro/unlimited/enterprise: sent immediately via Resend.
 *
 * Call fire-and-forget from the sponsor monitor job:
 *   notifyUsersOfEvent(change).catch(err => console.error(...));
 */
export async function notifyUsersOfEvent(change: SponsorChange): Promise<void> {
  const changeId = change.id;
  if (changeId === undefined) {
    console.warn("[NotificationEngine] changeId not set, skipping:", change.organisationName);
    return;
  }

  const eventType = change.changeType as NotifEventType;
  const normalizedOrg = normalizeName(change.organisationName);

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

    if (activeWatches.length === 0) return;

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
      change.organisationName,
      change.previousValue,
      change.newValue,
    );

    for (const userId of uniqueUserIds) {
      try {
        const user = userMap.get(userId);
        if (!user) continue;

        // Free tier: no email channel — skip without logging
        const tierConfig = getTierConfig(user.subscriptionStatus);
        if (!tierConfig.channels.includes("email")) continue;

        // Event-type opt-out check (notifPrefs jsonb on users table)
        if (!isEventEnabled(user.notifPrefs as NotifPrefs | null, eventType)) {
          await logEvent(userId, changeId, eventType, "skipped", {
            errorDetails: "Event type opted out",
          });
          continue;
        }

        // In-memory rate limit: 10 sends per user per 24h
        if (isRateLimited(userId)) {
          await logEvent(userId, changeId, eventType, "skipped", {
            errorDetails: "Rate limit exceeded",
          });
          continue;
        }

        // Channel preference check
        const channelPrefs = prefMap.get(userId);
        const emailEnabled = !channelPrefs || channelPrefs.emailEnabled;
        const recipientEmail = channelPrefs?.email ?? user.email;

        if (!emailEnabled || !recipientEmail) {
          await logEvent(userId, changeId, eventType, "skipped", {
            errorDetails: "Email disabled or no address on file",
          });
          continue;
        }

        // Starter plan: defer to same-day delivery window (18:00 UTC)
        const deliverAfter = getDeliverAfter(user.subscriptionStatus);
        if (deliverAfter) {
          await logEvent(userId, changeId, eventType, "queued", { deliverAfter });
          console.log(
            `[NotificationEngine] Queued ${eventType} for user ${userId} (deliver after ${deliverAfter.toISOString()})`,
          );
          continue;
        }

        // Pro / unlimited / enterprise: send immediately
        const sendResult = await sendViaResend(recipientEmail, subject, html);
        await logEvent(userId, changeId, eventType, sendResult.success ? "sent" : "failed", {
          errorDetails: sendResult.error,
          providerMessageId: sendResult.providerMessageId,
        });

        console.log(
          `[NotificationEngine] ${sendResult.success ? "Sent" : "Failed"} ${eventType} to ${recipientEmail} (user ${userId})`,
        );
      } catch (err: any) {
        console.error(`[NotificationEngine] Error processing user ${userId}:`, err.message);
        await logEvent(userId, changeId, eventType, "failed", { errorDetails: err.message });
      }
    }
  } catch (err) {
    console.error("[NotificationEngine] Fatal error for change", changeId, ":", err);
  }
}

/**
 * Processes notif_engine_log entries with status='queued' whose deliverAfter has passed.
 * Called hourly by the sponsor monitor cron alongside processDelayedNotifications().
 */
export async function processQueuedEngineEvents(): Promise<void> {
  const now = new Date();

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

    console.log(`[NotificationEngine] Processing ${queued.length} queued engine event(s)...`);

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

        console.log(
          `[NotificationEngine] Deferred ${entry.eventType}: ${sendResult.success ? "sent" : "failed"} to ${recipientEmail}`,
        );
      } catch (err: any) {
        console.error(
          `[NotificationEngine] Error delivering queued entry ${entry.id}:`,
          err.message,
        );
        await db
          .update(notifEngineLog)
          .set({ status: "failed", errorDetails: err.message })
          .where(eq(notifEngineLog.id, entry.id));
      }
    }

    console.log("[NotificationEngine] Queued event processing complete.");
  } catch (err) {
    console.error("[NotificationEngine] Fatal error in processQueuedEngineEvents:", err);
  }
}
