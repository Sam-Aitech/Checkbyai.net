import { db } from "../db";
import { storage } from "../storage";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { companyWatches, notificationPreferences, notificationLog, users, sponsorChanges } from "@shared/schema";
import type { SponsorChange } from "./sponsorListFetcher";
import { normalizeName } from "./sponsorListFetcher";
import { getAppUrl } from "./appUrl";
import { sendSMS, sendWhatsApp } from "../services/messaging";
import { decryptPhone } from "./phoneCrypto";
import { getTierConfig, getDeliverAfter, isChannelAllowed } from "./tierConfig";

const MAX_NOTIFICATIONS_PER_DAY = 10;
const FROM_ADDRESS = "Sponsor Monitor <alerts@checkbyai.net>";

interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Resend API ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return { success: true, providerMessageId: data.id };
  } catch (err: unknown) {
    return { success: false, error: (err instanceof Error ? err.message : String(err)) || "Unknown send error" };
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildPlainTextAlert(changeType: string, companyName: string, previousValue?: string | null, newValue?: string | null): string {
  switch (changeType) {
    case "REMOVED_REVOKED":
      return `URGENT: ${companyName} has been REMOVED from the UK sponsor licence register. If you hold a visa sponsored by this organisation, seek immigration advice immediately. checkbyai.net/sponsor-monitor`;
    case "GRACE_PERIOD":
      return `Alert: ${companyName} has been absent from the UK sponsor licence register. Monitoring for confirmation. checkbyai.net/sponsor-monitor`;
    case "DOWNGRADED":
      return `Alert: ${companyName} sponsor licence DOWNGRADED${previousValue && newValue ? ` from ${previousValue} to ${newValue}` : ""}. Compliance issues identified by Home Office. checkbyai.net/sponsor-monitor`;
    case "UPGRADED":
      return `Good news: ${companyName} sponsor licence UPGRADED${previousValue && newValue ? ` from ${previousValue} to ${newValue}` : ""}. Now fully compliant. checkbyai.net/sponsor-monitor`;
    case "NEW_LICENCE":
      return `Update: ${companyName} has been ADDED to the UK sponsor licence register${newValue ? ` (${newValue})` : ""}. checkbyai.net/sponsor-monitor`;
    case "RE_ACTIVATED":
      return `Update: ${companyName} has RETURNED to the UK sponsor licence register${newValue ? ` (${newValue})` : ""}. checkbyai.net/sponsor-monitor`;
    default:
      return `Sponsor licence change for ${companyName}: ${changeType}. checkbyai.net/sponsor-monitor`;
  }
}

function buildEmailHtml(changeType: string, companyName: string, previousValue?: string | null, newValue?: string | null): { subject: string; html: string } {
  const safeCompanyName = escapeHtml(companyName);
  const safePrev = previousValue ? escapeHtml(previousValue) : null;
  const safeNew = newValue ? escapeHtml(newValue) : null;
  const headerColors: Record<string, { bg: string; accent: string }> = {
    REMOVED_REVOKED: { bg: "linear-gradient(135deg, #8B0000 0%, #CC0000 100%)", accent: "#CC0000" },
    GRACE_PERIOD:    { bg: "linear-gradient(135deg, #7B3F00 0%, #CC6600 100%)", accent: "#CC6600" },
    DOWNGRADED:      { bg: "linear-gradient(135deg, #CC6600 0%, #FF8C00 100%)", accent: "#CC6600" },
    UPGRADED:        { bg: "linear-gradient(135deg, #006633 0%, #009933 100%)", accent: "#006633" },
    NEW_LICENCE:     { bg: "linear-gradient(135deg, #003366 0%, #0066CC 100%)", accent: "#003366" },
    RE_ACTIVATED:    { bg: "linear-gradient(135deg, #003366 0%, #0066CC 100%)", accent: "#003366" },
  };

  const colors = headerColors[changeType] || headerColors.NEW_LICENCE;

  let subject = "";
  let headline = "";
  let bodyParagraphs: string[] = [];

  switch (changeType) {
    case "REMOVED_REVOKED":
      subject = `URGENT: ${companyName} removed from UK sponsor licence register`;
      headline = "Sponsor Licence Removed";
      bodyParagraphs = [
        `<strong>${safeCompanyName}</strong> has been removed from the UK Home Office Register of Licensed Sponsors.`,
        "This typically means the organisation's sponsor licence has been revoked or surrendered. They may no longer be able to sponsor workers under the relevant immigration routes.",
        "If you hold a visa sponsored by this organisation, or are in the process of applying, we strongly recommend seeking professional immigration advice as soon as possible.",
        "You can verify this change directly on the <a href=\"https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers\" style=\"color: " + colors.accent + ";\">official register</a>.",
      ];
      break;

    case "GRACE_PERIOD":
      subject = `Alert: ${companyName} absent from UK sponsor licence register`;
      headline = "Sponsor Licence — Absence Detected";
      bodyParagraphs = [
        `<strong>${safeCompanyName}</strong> was not found on today's UK Home Office Register of Licensed Sponsors.`,
        "This may be a temporary data issue or the start of a revocation. We are monitoring for a second consecutive absence before issuing a confirmed removal alert.",
        "No action is needed right now, but you may wish to verify directly on the <a href=\"https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers\" style=\"color: " + colors.accent + ";\">official register</a>.",
      ];
      break;

    case "DOWNGRADED":
      subject = `Alert: ${companyName} sponsor licence downgraded`;
      headline = "Sponsor Licence Downgraded";
      bodyParagraphs = [
        `<strong>${safeCompanyName}</strong> has had their sponsor licence rating downgraded${safePrev && safeNew ? ` from <strong>${safePrev}</strong> to <strong>${safeNew}</strong>` : ""}.`,
        "A downgrade to a B-rating means the Home Office has identified compliance issues with the organisation's sponsorship duties. The sponsor is expected to take corrective action within a set timeframe.",
        "While existing visa holders are not immediately affected, this may impact future sponsorship applications and could indicate broader compliance concerns.",
        "We recommend monitoring the situation and consulting with your employer or an immigration adviser if you have questions.",
      ];
      break;

    case "UPGRADED":
      subject = `Good news: ${companyName} sponsor licence upgraded`;
      headline = "Sponsor Licence Upgraded";
      bodyParagraphs = [
        `<strong>${safeCompanyName}</strong> has had their sponsor licence rating upgraded${safePrev && safeNew ? ` from <strong>${safePrev}</strong> to <strong>${safeNew}</strong>` : ""}.`,
        "This is a positive development, indicating the organisation has met or exceeded the Home Office's compliance requirements for sponsor licence holders.",
        "An A-rating confirms the sponsor is fully compliant and in good standing to continue sponsoring workers.",
      ];
      break;

    case "NEW_LICENCE":
      subject = `Update: ${companyName} added to sponsor licence register`;
      headline = "New Sponsor Licence Granted";
      bodyParagraphs = [
        `<strong>${safeCompanyName}</strong> has been added to the UK Home Office Register of Licensed Sponsors.`,
        `They are now authorised to sponsor workers${safeNew ? ` under the <strong>${safeNew}</strong> route` : ""}.`,
        "This means the organisation has successfully applied for and been granted a sponsor licence by the Home Office.",
      ];
      break;

    case "RE_ACTIVATED":
      subject = `Update: ${companyName} has returned to the sponsor licence register`;
      headline = "Sponsor Licence Reinstated";
      bodyParagraphs = [
        `<strong>${safeCompanyName}</strong> has reappeared on the UK Home Office Register of Licensed Sponsors after a period of absence.`,
        `They are once again authorised to sponsor workers${safeNew ? ` under the <strong>${safeNew}</strong> route` : ""}.`,
      ];
      break;

    default:
      subject = `Sponsor licence update: ${companyName}`;
      headline = "Sponsor Licence Change Detected";
      bodyParagraphs = [
        `A change has been detected for <strong>${safeCompanyName}</strong> on the UK Home Office Register of Licensed Sponsors.`,
        `Change type: <strong>${escapeHtml(changeType)}</strong>${safePrev ? ` (previous: ${safePrev})` : ""}${safeNew ? ` (new: ${safeNew})` : ""}.`,
      ];
      break;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${colors.bg}; padding: 30px; border-radius: 10px 10px 0 0;">
        <h1 style="color: #ffffff; margin: 0; text-align: center; font-size: 22px;">${headline}</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
        ${bodyParagraphs.map(p => `<p style="color: #333; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">${p}</p>`).join("")}
      </div>
      <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="color: #666; font-size: 12px; margin: 0 0 8px 0; text-align: center;">
          You are receiving this because you are watching <strong>${safeCompanyName}</strong> on Check By AI Sponsor Monitor.
        </p>
        <p style="color: #999; font-size: 11px; margin: 0; text-align: center;">
          To manage your notification preferences, visit your <a href="${getAppUrl()}/sponsor-monitor" style="color: ${colors.accent};">Sponsor Monitor dashboard</a>.
        </p>
      </div>
    </div>
  `;

  return { subject, html };
}

async function getUserNotificationCountLast24h(userId: string): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.userId, userId),
        eq(notificationLog.status, "sent"),
        gte(notificationLog.sentAt, oneDayAgo)
      )
    );
  return result[0]?.count ?? 0;
}

async function logNotification(
  userId: string,
  changeId: number,
  channel: string,
  status: string,
  providerMessageId?: string,
  errorDetails?: string,
  deliverAfter?: Date | null
) {
  try {
    await db.insert(notificationLog).values({
      userId,
      changeId,
      channel,
      status,
      sentAt: status === "sent" ? new Date() : null,
      deliverAfter: deliverAfter || null,
      providerMessageId: providerMessageId || null,
      errorDetails: errorDetails || null,
    });
  } catch (err) {
    console.error(`[NotificationDispatcher] Failed to log notification for user ${userId}, change ${changeId}:`, err);
  }
}

async function sendNotificationViaChannel(
  channel: "email" | "sms" | "whatsapp",
  userId: string,
  changeId: number,
  email: string | null,
  smsNumber: string | null,
  whatsappNumber: string | null,
  subject: string,
  html: string,
  plainText: string,
  stats: { sent: number; skipped: number; failed: number }
) {
  if (channel === "email") {
    if (!email) {
      await logNotification(userId, changeId, "email", "failed", undefined, "No email address on file");
      stats.failed++;
      return;
    }
    const result = await sendViaResend(email, subject, html);
    if (result.success) {
      console.log(`[NotificationDispatcher] Email sent to ${email}`);
      await logNotification(userId, changeId, "email", "sent", result.providerMessageId);
      stats.sent++;
    } else {
      console.error(`[NotificationDispatcher] Email failed to ${email}: ${result.error}`);
      await logNotification(userId, changeId, "email", "failed", undefined, result.error);
      stats.failed++;
    }
  } else if (channel === "sms") {
    if (!smsNumber) return;
    const phone = decryptPhone(smsNumber);
    const result = await sendSMS(phone, plainText);
    if (result.success) {
      console.log(`[NotificationDispatcher] SMS sent to ${phone}`);
      await logNotification(userId, changeId, "sms", "sent", result.providerMessageId);
      stats.sent++;
    } else {
      console.error(`[NotificationDispatcher] SMS failed to ${phone}: ${result.error}`);
      await logNotification(userId, changeId, "sms", "failed", undefined, result.error);
      stats.failed++;
    }
  } else if (channel === "whatsapp") {
    if (!whatsappNumber) return;
    const phone = decryptPhone(whatsappNumber);
    const result = await sendWhatsApp(phone, plainText);
    if (result.success) {
      console.log(`[NotificationDispatcher] WhatsApp sent to ${phone}`);
      await logNotification(userId, changeId, "whatsapp", "sent", result.providerMessageId);
      stats.sent++;
    } else {
      console.error(`[NotificationDispatcher] WhatsApp failed to ${phone}: ${result.error}`);
      await logNotification(userId, changeId, "whatsapp", "failed", undefined, result.error);
      stats.failed++;
    }
  }
}

export async function notifyAffectedUsers(change: SponsorChange): Promise<{ sent: number; skipped: number; failed: number; queued: number }> {
  const stats = { sent: 0, skipped: 0, failed: 0, queued: 0 };

  // Global kill switch — admin can pause all notifications via /api/admin/notifications/pause
  const pausedFlag = await storage.getSystemSetting('notifications_paused');
  if (pausedFlag === 'true') {
    console.log(`[NotificationDispatcher] Notifications paused by admin — skipping dispatch for "${change.organisationName}"`);
    return stats;
  }

  // changeId is populated by batchedInsertChanges() in the state machine before
  // this function is called. Guard defensively in case of unexpected flow.
  const changeId = change.id;
  if (changeId === undefined) {
    console.warn(
      `[NotificationDispatcher] Skipping notifications for "${change.organisationName}" (${change.changeType}) — ` +
      "changeId not set. This change was not persisted to sponsorChanges before dispatch.",
    );
    return stats;
  }

  try {
    const normalizedOrg = normalizeName(change.organisationName);

    // ── Step 1: Find all affected watchers (single indexed query) ────────────
    const activeWatches = await db
      .select({
        watchId: companyWatches.id,
        userId: companyWatches.userId,
      })
      .from(companyWatches)
      .where(
        and(
          eq(companyWatches.organisationNameNormalized, normalizedOrg),
          eq(companyWatches.isActive, true)
        )
      );

    if (activeWatches.length === 0) {
      console.log(`[NotificationDispatcher] No active watches for "${change.organisationName}"`);
      return stats;
    }

    // Deduplicate users — one user may watch the same company multiple times
    const uniqueUserIds = Array.from(new Set(activeWatches.map(w => w.userId)));
    console.log(`[NotificationDispatcher] Found ${activeWatches.length} watch(es) for "${change.organisationName}" across ${uniqueUserIds.length} unique user(s) (change: ${change.changeType})`);

    // ── Step 2: BATCH all 3 lookups into one parallel Promise.all() ─────────
    // BEFORE (N+1 antipattern): for each watcher → await rateLimitCount,
    //   await userRecord, await prefs = 3 sequential DB round-trips × N users
    //   = 1,500 sequential queries for 500 watchers. Catastrophic under load.
    //
    // AFTER: 3 inArray() queries in parallel covering ALL users at once,
    //   resolved via O(1) Map lookups in the loop = 4 DB queries TOTAL.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentLogCounts, userRecords, prefRecords] = await Promise.all([
      // Batch rate-limit check: count sent notifications per user in last 24h
      db
        .select({
          userId: notificationLog.userId,
          count: sql<number>`count(*)::int`,
        })
        .from(notificationLog)
        .where(
          and(
            inArray(notificationLog.userId, uniqueUserIds),
            eq(notificationLog.status, "sent"),
            gte(notificationLog.sentAt, oneDayAgo)
          )
        )
        .groupBy(notificationLog.userId),

      // Batch user record fetch
      db
        .select({ id: users.id, email: users.email, subscriptionStatus: users.subscriptionStatus })
        .from(users)
        .where(inArray(users.id, uniqueUserIds)),

      // Batch preferences fetch
      db
        .select()
        .from(notificationPreferences)
        .where(inArray(notificationPreferences.userId, uniqueUserIds)),
    ]);

    // Build O(1) lookup Maps from batch results
    const rateLimitMap = new Map<string, number>(
      recentLogCounts.map(r => [r.userId, r.count])
    );
    const userMap = new Map(userRecords.map(u => [u.id, u]));
    const prefsMap = new Map(prefRecords.map(p => [p.userId, p]));

    // ── Step 3: Build notification payloads once (not per-user) ─────────────
    const { subject, html } = buildEmailHtml(
      change.changeType,
      change.organisationName,
      change.previousValue,
      change.newValue
    );

    const plainText = buildPlainTextAlert(
      change.changeType,
      change.organisationName,
      change.previousValue,
      change.newValue
    );

    // ── Step 4: Dispatch loop — all data now in memory, zero extra DB calls ──
    const processedUsers = new Set<string>();

    for (const watch of activeWatches) {
      if (processedUsers.has(watch.userId)) continue;
      processedUsers.add(watch.userId);

      try {
        // O(1) Map lookups instead of sequential awaits
        const recentCount = rateLimitMap.get(watch.userId) ?? 0;
        if (recentCount >= MAX_NOTIFICATIONS_PER_DAY) {
          console.log(`[NotificationDispatcher] Rate limit reached for user ${watch.userId} (${recentCount}/${MAX_NOTIFICATIONS_PER_DAY} in 24h)`);
          await logNotification(watch.userId, changeId, "email", "skipped", undefined, "Rate limit: exceeded 10 notifications in 24 hours");
          stats.skipped++;
          continue;
        }

        const userRecord = userMap.get(watch.userId);
        if (!userRecord) {
          stats.failed++;
          continue;
        }

        const userPlan = userRecord.subscriptionStatus || "free";
        const tierConfig = getTierConfig(userPlan);
        const deliverAfter = getDeliverAfter(userPlan);

        const prefs = prefsMap.get(watch.userId) ?? null;
        const emailEnabled = !prefs || prefs.emailEnabled;
        const recipientEmail = prefs?.email ?? userRecord.email;

        if (deliverAfter) {
          for (const channel of tierConfig.channels) {
            if (channel === "email" && emailEnabled && recipientEmail) {
              await logNotification(watch.userId, changeId, "email", "queued", undefined, undefined, deliverAfter);
              stats.queued++;
            } else if (channel === "whatsapp" && prefs?.whatsappEnabled && prefs?.whatsappVerified && prefs?.whatsappNumber) {
              await logNotification(watch.userId, changeId, "whatsapp", "queued", undefined, undefined, deliverAfter);
              stats.queued++;
            } else if (channel === "sms" && prefs?.smsEnabled && prefs?.smsVerified && prefs?.smsNumber) {
              await logNotification(watch.userId, changeId, "sms", "queued", undefined, undefined, deliverAfter);
              stats.queued++;
            }
          }
          console.log(`[NotificationDispatcher] Queued notifications for ${userPlan} user ${watch.userId} (deliver after ${deliverAfter.toISOString()})`);
          continue;
        } else {
          // Dispatch all channels in parallel — email/SMS/WhatsApp are independent I/O
          const channelPromises: Promise<void>[] = [];
          for (const channel of tierConfig.channels) {
            if (channel === "email" && emailEnabled) {
              channelPromises.push(sendNotificationViaChannel("email", watch.userId, changeId, recipientEmail, null, null, subject, html, plainText, stats));
            } else if (channel === "whatsapp" && prefs?.whatsappEnabled && prefs?.whatsappVerified && prefs?.whatsappNumber) {
              channelPromises.push(sendNotificationViaChannel("whatsapp", watch.userId, changeId, null, null, prefs.whatsappNumber, subject, html, plainText, stats));
            } else if (channel === "sms" && prefs?.smsEnabled && prefs?.smsVerified && prefs?.smsNumber) {
              channelPromises.push(sendNotificationViaChannel("sms", watch.userId, changeId, null, prefs.smsNumber, null, subject, html, plainText, stats));
            }
          }
          await Promise.all(channelPromises);
        }
      } catch (err) {
        console.error(`[NotificationDispatcher] Error processing user ${watch.userId}:`, err);
        stats.failed++;
      }
    }
  } catch (err) {
    console.error(`[NotificationDispatcher] Error dispatching notifications for "${change.organisationName}" (${change.changeType}):`, err);
  }

  return stats;
}
