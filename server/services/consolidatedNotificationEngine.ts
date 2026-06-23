import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { companyWatches, sponsorChanges, users, notifLog } from "@shared/schema";

export interface PendingRow {
  userId: string;
  email: string;
  changeId: number;
  organisationName: string;
  changeType: string;
  previousValue: string | null;
  newValue: string | null;
  snapshotDate: string;
}

export interface UserDigest {
  email: string;
  changes: Array<{
    changeId: number;
    organisationName: string;
    changeType: string;
    previousValue: string | null;
    newValue: string | null;
  }>;
}

export function groupNotificationsByUser(rows: PendingRow[]): Map<string, UserDigest> {
  const map = new Map<string, UserDigest>();
  for (const row of rows) {
    const existing = map.get(row.userId) ?? { email: row.email, changes: [] };
    existing.changes.push({
      changeId: row.changeId,
      organisationName: row.organisationName,
      changeType: row.changeType,
      previousValue: row.previousValue,
      newValue: row.newValue,
    });
    map.set(row.userId, existing);
  }
  return map;
}

export async function fetchPendingNotifications(): Promise<PendingRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      subscriptionStatus: users.subscriptionStatus,
      changeId: sponsorChanges.id,
      organisationName: sponsorChanges.organisationName,
      changeType: sponsorChanges.changeType,
      previousValue: sponsorChanges.previousValue,
      newValue: sponsorChanges.newValue,
      snapshotDate: sponsorChanges.snapshotDate,
    })
    .from(companyWatches)
    .innerJoin(
      sponsorChanges,
      eq(companyWatches.fingerprint, sponsorChanges.fingerprint)
    )
    .innerJoin(users, eq(companyWatches.userId, users.id))
    .leftJoin(
      notifLog,
      and(
        eq(companyWatches.userId, notifLog.userId),
        eq(sponsorChanges.id, notifLog.changeId),
        eq(notifLog.success, true)
      )
    )
    .where(
      and(
        eq(companyWatches.isActive, true),
        eq(users.subscriptionStatus, "pro"),
        eq(sponsorChanges.isTest, false),
        sql`${notifLog.id} IS NULL`
      )
    );

  return rows.map((r) => ({
    userId: r.userId,
    email: r.email || "",
    changeId: r.changeId,
    organisationName: r.organisationName,
    changeType: r.changeType,
    previousValue: r.previousValue,
    newValue: r.newValue,
    snapshotDate: r.snapshotDate,
  }));
}

export function renderConsolidatedEmail(changes: UserDigest["changes"]): { subject: string; html: string } {
  const subject = `Sponsor Monitor: ${changes.length} update${changes.length !== 1 ? "s" : ""} to your watch list`;

  const getStatusBadge = (type: string) => {
    switch (type) {
      case "REMOVED_REVOKED":
      case "DOWNGRADED":
        return { text: "Licence Revoked", bg: "#dc2626" };
      case "NEW_LICENCE":
      case "RE_ACTIVATED":
      case "UPGRADED":
        return { text: "New Licence", bg: "#16a34a" };
      default:
        return { text: "Details Updated", bg: "#4f46e5" };
    }
  };

  const getChangeExplanation = (c: any) => {
    if (c.changeType === "REMOVED_REVOKED") {
      return `<strong>${c.organisationName}</strong> has been removed from the UK Register of Licensed Sponsors. Visas sponsored under this licence may be compromised.`;
    }
    if (c.changeType === "NEW_LICENCE") {
      return `<strong>${c.organisationName}</strong> was added to the UK Register of Licensed Sponsors under route: <strong>${c.newValue || "N/A"}</strong>.`;
    }
    if (c.changeType === "RE_ACTIVATED") {
      return `<strong>${c.organisationName}</strong> has returned to the UK Register of Licensed Sponsors.`;
    }
    return `<strong>${c.organisationName}</strong> has had a change from <strong>${c.previousValue || "N/A"}</strong> to <strong>${c.newValue || "N/A"}</strong>.`;
  };

  const tableRows = changes
    .map((c) => {
      const badge = getStatusBadge(c.changeType);
      const explanation = getChangeExplanation(c);
      return `
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px; font-weight: bold; color: #333; font-size: 14px;">${c.organisationName}</td>
          <td style="padding: 12px;">
            <span style="background-color: ${badge.bg}; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; display: inline-block;">
              ${badge.text}
            </span>
          </td>
          <td style="padding: 12px; color: #666; font-size: 13px; line-height: 1.4;">${explanation}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Sponsor Monitor Digest</h1>
        <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Summary of updates to your watched organisations</p>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569;">Sponsor</th>
              <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569;">Event</th>
              <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569;">Details</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <div style="margin-top: 24px; text-align: center;">
          <a href="https://checkbyai.net/dashboard/sponsor" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-decoration: none; display: inline-block;">
            Manage Monitored Sponsors
          </a>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px; text-align: center;">
        <p style="color: #64748b; font-size: 11px; margin: 0 0 8px;">
          You are receiving this because you enabled email monitoring on Check By AI Sponsor Monitor.
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin: 0;">
          checkbyai.net &middot; London, UK
        </p>
      </div>
    </div>
  `;

  return { subject, html };
}
