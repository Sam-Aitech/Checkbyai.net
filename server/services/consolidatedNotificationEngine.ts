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
