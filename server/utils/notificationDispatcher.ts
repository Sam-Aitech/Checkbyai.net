import { db } from "../db";
import { eq, and, gte, sql } from "drizzle-orm";
import { companyWatches, notificationPreferences, notificationLog, users } from "@shared/schema";
import type { SponsorChange } from "@shared/schema";
import { normalizeName } from "./sponsorListFetcher";

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
        eq(notificationLog.channel, "email"),
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
  errorDetails?: string
) {
  try {
    await db.insert(notificationLog).values({
      userId,
      changeId,
      channel,
      status,
      sentAt: status === "sent" ? new Date() : null,
      providerMessageId: providerMessageId || null,
      errorDetails: errorDetails || null,
    });
  } catch (err) {
    console.error(`[NotificationDispatcher] Failed to log notification for user ${userId}, change ${changeId}:`, err);
  }
}

export async function notifyAffectedUsers(change: SponsorChange): Promise<{ sent: number; skipped: number; failed: number }> {
  const stats = { sent: 0, skipped: 0, failed: 0 };

  try {
    const normalizedOrg = normalizeName(change.organisationName);

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

    console.log(`[NotificationDispatcher] Found ${activeWatches.length} active watch(es) for "${change.organisationName}" (change: ${change.changeType})`);

    const { subject, html } = buildEmailHtml(
      change.changeType,
      change.organisationName,
      change.previousValue,
      change.newValue
    );

    const processedUsers = new Set<string>();

    for (const watch of activeWatches) {
      if (processedUsers.has(watch.userId)) continue;
      processedUsers.add(watch.userId);

      try {
        const recentCount = await getUserNotificationCountLast24h(watch.userId);
        if (recentCount >= MAX_NOTIFICATIONS_PER_DAY) {
          console.log(`[NotificationDispatcher] Rate limit reached for user ${watch.userId} (${recentCount}/${MAX_NOTIFICATIONS_PER_DAY} in 24h)`);
          await logNotification(watch.userId, change.id, "email", "skipped", undefined, "Rate limit: exceeded 10 notifications in 24 hours");
          stats.skipped++;
          continue;
        }

        const prefs = await db
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.userId, watch.userId))
          .limit(1);

        const emailEnabled = prefs.length === 0 || prefs[0].emailEnabled;

        let recipientEmail: string | null = null;

        if (prefs.length > 0 && prefs[0].email) {
          recipientEmail = prefs[0].email;
        } else {
          const userRecord = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, watch.userId))
            .limit(1);
          recipientEmail = userRecord[0]?.email || null;
        }

        if (!emailEnabled) {
          console.log(`[NotificationDispatcher] Email disabled for user ${watch.userId}`);
          await logNotification(watch.userId, change.id, "email", "skipped", undefined, "Email notifications disabled by user");
          stats.skipped++;
          continue;
        }

        if (!recipientEmail) {
          console.log(`[NotificationDispatcher] No email address for user ${watch.userId}`);
          await logNotification(watch.userId, change.id, "email", "failed", undefined, "No email address on file");
          stats.failed++;
          continue;
        }

        const result = await sendViaResend(recipientEmail, subject, html);

        if (result.success) {
          console.log(`[NotificationDispatcher] Email sent to ${recipientEmail} for "${change.organisationName}" (${change.changeType})`);
          await logNotification(watch.userId, change.id, "email", "sent", result.providerMessageId);
          stats.sent++;
        } else {
          console.error(`[NotificationDispatcher] Failed to send to ${recipientEmail}: ${result.error}`);
          await logNotification(watch.userId, change.id, "email", "failed", undefined, result.error);
          stats.failed++;
        }
      } catch (err: any) {
        console.error(`[NotificationDispatcher] Error processing user ${watch.userId}:`, err);
        await logNotification(watch.userId, change.id, "email", "failed", undefined, err.message || "Internal error");
        stats.failed++;
      }
    }

    console.log(`[NotificationDispatcher] Dispatch complete for "${change.organisationName}": ${stats.sent} sent, ${stats.skipped} skipped, ${stats.failed} failed`);
  } catch (err) {
    console.error("[NotificationDispatcher] Fatal error in notifyAffectedUsers:", err);
  }

  return stats;
}
