import { db } from "../db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { companyWatches, notificationPreferences, notificationLog, users, sponsorChanges } from "@shared/schema";
import type { SponsorChange } from "@shared/schema";
import { normalizeName } from "./sponsorListFetcher";
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
  } catch (err: any) {
    return { success: false, error: err.message || "Unknown send error" };
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildPlainTextAlert(changeType: string, companyName: string, previousValue?: string | null, newValue?: string | null): string {
  switch (changeType) {
    case "REMOVED":
      return `URGENT: ${companyName} has been REMOVED from the UK sponsor licence register. If you hold a visa sponsored by this organisation, seek immigration advice immediately. checkbyai.net/sponsor-monitor`;
    case "DOWNGRADED":
      return `Alert: ${companyName} sponsor licence DOWNGRADED${previousValue && newValue ? ` from ${previousValue} to ${newValue}` : ""}. Compliance issues identified by Home Office. checkbyai.net/sponsor-monitor`;
    case "UPGRADED":
      return `Good news: ${companyName} sponsor licence UPGRADED${previousValue && newValue ? ` from ${previousValue} to ${newValue}` : ""}. Now fully compliant. checkbyai.net/sponsor-monitor`;
    case "ADDED":
      return `Update: ${companyName} has been ADDED to the UK sponsor licence register${newValue ? ` (${newValue})` : ""}. checkbyai.net/sponsor-monitor`;
    default:
      return `Sponsor licence change for ${companyName}: ${changeType}. checkbyai.net/sponsor-monitor`;
  }
}

function buildEmailHtml(changeType: string, companyName: string, previousValue?: string | null, newValue?: string | null): { subject: string; html: string } {
  const safeCompanyName = escapeHtml(companyName);
  const safePrev = previousValue ? escapeHtml(previousValue) : null;
  const safeNew = newValue ? escapeHtml(newValue) : null;
  const headerColors: Record<string, { bg: string; accent: string }> = {
    REMOVED: { bg: "linear-gradient(135deg, #8B0000 0%, #CC0000 100%)", accent: "#CC0000" },
    DOWNGRADED: { bg: "linear-gradient(135deg, #CC6600 0%, #FF8C00 100%)", accent: "#CC6600" },
    UPGRADED: { bg: "linear-gradient(135deg, #006633 0%, #009933 100%)", accent: "#006633" },
    ADDED: { bg: "linear-gradient(135deg, #003366 0%, #0066CC 100%)", accent: "#003366" },
  };

  const colors = headerColors[changeType] || headerColors.ADDED;

  let subject = "";
  let headline = "";
  let bodyParagraphs: string[] = [];

  switch (changeType) {
    case "REMOVED":
      subject = `URGENT: ${companyName} removed from UK sponsor licence register`;
      headline = "Sponsor Licence Removed";
      bodyParagraphs = [
        `<strong>${safeCompanyName}</strong> has been removed from the UK Home Office Register of Licensed Sponsors.`,
        "This typically means the organisation's sponsor licence has been revoked or surrendered. They may no longer be able to sponsor workers under the relevant immigration routes.",
        "If you hold a visa sponsored by this organisation, or are in the process of applying, we strongly recommend seeking professional immigration advice as soon as possible.",
        "You can verify this change directly on the <a href=\"https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers\" style=\"color: " + colors.accent + ";\">official register</a>.",
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

    case "ADDED":
      subject = `Update: ${companyName} added to sponsor licence register`;
      headline = "New Sponsor Licence Granted";
      bodyParagraphs = [
        `<strong>${safeCompanyName}</strong> has been added to the UK Home Office Register of Licensed Sponsors.`,
        `They are now authorised to sponsor workers${safeNew ? ` under the <strong>${safeNew}</strong> route` : ""}.`,
        "This means the organisation has successfully applied for and been granted a sponsor licence by the Home Office.",
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
          To manage your notification preferences, visit your <a href="https://checkbyai.net/sponsor-monitor" style="color: ${colors.accent};">Sponsor Monitor dashboard</a>.
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
          await logNotification(watch.userId, change.id, "email", "skipped", undefined, "Rate limit: exceeded 10 notifications in 24 hours");
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
              await logNotification(watch.userId, change.id, "email", "queued", undefined, undefined, deliverAfter);
              stats.queued++;
            } else if (channel === "whatsapp" && prefs?.whatsappEnabled && prefs?.whatsappVerified && prefs?.whatsappNumber) {
              await logNotification(watch.userId, change.id, "whatsapp", "queued", undefined, undefined, deliverAfter);
              stats.queued++;
            } else if (channel === "sms" && prefs?.smsEnabled && prefs?.smsVerified && prefs?.smsNumber) {
              await logNotification(watch.userId, change.id, "sms", "queued", undefined, undefined, deliverAfter);
              stats.queued++;
            }
          }
          console.log(`[NotificationDispatcher] Queued notifications for ${userPlan} user ${watch.userId} (deliver after ${deliverAfter.toISOString()})`);
          continue;
        }

        // Dispatch all channels in parallel — email/SMS/WhatsApp are independent I/O
        const channelPromises: Promise<void>[] = [];
        for (const channel of tierConfig.channels) {
          if (channel === "email" && emailEnabled) {
            channelPromises.push(sendNotificationViaChannel("email", watch.userId, change.id, recipientEmail, null, null, subject, html, plainText, stats));
          } else if (channel === "whatsapp" && prefs?.whatsappEnabled && prefs?.whatsappVerified && prefs?.whatsappNumber) {
            channelPromises.push(sendNotificationViaChannel("whatsapp", watch.userId, change.id, null, null, prefs.whatsappNumber, subject, html, plainText, stats));
          } else if (channel === "sms" && prefs?.smsEnabled && prefs?.smsVerified && prefs?.smsNumber) {
            channelPromises.push(sendNotificationViaChannel("sms", watch.userId, change.id, null, prefs.smsNumber, null, subject, html, plainText, stats));
          }
        }
        await Promise.all(channelPromises);
      } catch (err: any) {
        console.error(`[NotificationDispatcher] Error processing user ${watch.userId}:`, err);
        await logNotification(watch.userId, change.id, "email", "failed", undefined, err.message || "Internal error");
        stats.failed++;
      }
    }

    console.log(`[NotificationDispatcher] Dispatch complete for "${change.organisationName}": ${stats.sent} sent, ${stats.queued} queued, ${stats.skipped} skipped, ${stats.failed} failed`);
  } catch (err) {
    console.error("[NotificationDispatcher] Fatal error in notifyAffectedUsers:", err);
  }

  return stats;
}

export async function processDelayedNotifications(): Promise<{ delivered: number; failed: number }> {
  const result = { delivered: 0, failed: 0 };
  const now = new Date();

  try {
    const queuedNotifications = await db
      .select({
        logId: notificationLog.id,
        userId: notificationLog.userId,
        changeId: notificationLog.changeId,
        channel: notificationLog.channel,
      })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.status, "queued"),
          lte(notificationLog.deliverAfter, now)
        )
      )
      .limit(100);

    if (queuedNotifications.length === 0) return result;

    console.log(`[NotificationDispatcher] Processing ${queuedNotifications.length} delayed notification(s)...`);

    // ── Batch all lookups upfront — replaces N+1 pattern (3 queries × N) ────
    // BEFORE: for each notif → await change, await prefs, await user = 3N sequential queries
    // AFTER: 3 parallel inArray() queries covering all notifs = 3 queries total
    const uniqueChangeIds = [...new Set(queuedNotifications.map(n => n.changeId))];
    const uniqueUserIds = [...new Set(queuedNotifications.map(n => n.userId))];

    const [changeRecordsList, prefRecordsList, userRecordsList] = await Promise.all([
      db.select().from(sponsorChanges).where(inArray(sponsorChanges.id, uniqueChangeIds)),
      db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, uniqueUserIds)),
      db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, uniqueUserIds)),
    ]);

    const changeMap = new Map(changeRecordsList.map(c => [c.id, c]));
    const prefsMap = new Map(prefRecordsList.map(p => [p.userId, p]));
    const userMap = new Map(userRecordsList.map(u => [u.id, u]));

    for (const notif of queuedNotifications) {
      try {
        const change = changeMap.get(notif.changeId);
        if (!change) {
          await db.update(notificationLog).set({ status: "failed", errorDetails: "Change record not found" }).where(eq(notificationLog.id, notif.logId));
          result.failed++;
          continue;
        }

        const { subject, html } = buildEmailHtml(change.changeType, change.organisationName, change.previousValue, change.newValue);
        const plainText = buildPlainTextAlert(change.changeType, change.organisationName, change.previousValue, change.newValue);

        const prefs = prefsMap.get(notif.userId) ?? null;
        const userRecord = userMap.get(notif.userId);
        const recipientEmail = prefs?.email ?? userRecord?.email;

        let success = false;
        let providerMessageId: string | undefined;
        let errorDetails: string | undefined;

        if (notif.channel === "email" && recipientEmail) {
          const sendResult = await sendViaResend(recipientEmail, subject, html);
          success = sendResult.success;
          providerMessageId = sendResult.providerMessageId;
          errorDetails = sendResult.error;
        } else if (notif.channel === "sms" && prefs?.smsNumber) {
          const phone = decryptPhone(prefs.smsNumber);
          const sendResult = await sendSMS(phone, plainText);
          success = sendResult.success;
          providerMessageId = sendResult.providerMessageId;
          errorDetails = sendResult.error;
        } else if (notif.channel === "whatsapp" && prefs?.whatsappNumber) {
          const phone = decryptPhone(prefs.whatsappNumber);
          const sendResult = await sendWhatsApp(phone, plainText);
          success = sendResult.success;
          providerMessageId = sendResult.providerMessageId;
          errorDetails = sendResult.error;
        } else {
          errorDetails = "No recipient details available";
        }

        if (success) {
          await db.update(notificationLog).set({
            status: "sent",
            sentAt: new Date(),
            providerMessageId: providerMessageId || null,
          }).where(eq(notificationLog.id, notif.logId));
          result.delivered++;
        } else {
          await db.update(notificationLog).set({
            status: "failed",
            errorDetails: errorDetails || "Delivery failed",
          }).where(eq(notificationLog.id, notif.logId));
          result.failed++;
        }
      } catch (err: any) {
        console.error(`[NotificationDispatcher] Error delivering queued notification ${notif.logId}:`, err.message);
        await db.update(notificationLog).set({
          status: "failed",
          errorDetails: err.message || "Internal delivery error",
        }).where(eq(notificationLog.id, notif.logId));
        result.failed++;
      }
    }

    console.log(`[NotificationDispatcher] Delayed delivery complete: ${result.delivered} delivered, ${result.failed} failed`);
  } catch (err) {
    console.error("[NotificationDispatcher] Fatal error in processDelayedNotifications:", err);
  }

  return result;
}
