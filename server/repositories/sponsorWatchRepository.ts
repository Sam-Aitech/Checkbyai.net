import { sponsorWatches, users, type SponsorWatch, type InsertSponsorWatch } from "@shared/schema";
import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";

export class SponsorWatchRepository {
  async createSponsorWatch(userId: string, data: InsertSponsorWatch): Promise<SponsorWatch> {
    const [watch] = await db
      .insert(sponsorWatches)
      .values({ ...data, userId })
      .returning();
    return watch;
  }

  async getSponsorWatchesByUserId(userId: string, status?: string): Promise<SponsorWatch[]> {
    if (status) {
      return db
        .select()
        .from(sponsorWatches)
        .where(sql`${sponsorWatches.userId} = ${userId} AND ${sponsorWatches.status} = ${status}`)
        .orderBy(desc(sponsorWatches.createdAt));
    }
    return db
      .select()
      .from(sponsorWatches)
      .where(eq(sponsorWatches.userId, userId))
      .orderBy(desc(sponsorWatches.createdAt));
  }

  async getSponsorWatchById(id: string): Promise<SponsorWatch | undefined> {
    const [watch] = await db
      .select()
      .from(sponsorWatches)
      .where(eq(sponsorWatches.id, id));
    return watch;
  }

  async cancelSponsorWatch(id: string): Promise<void> {
    await db
      .update(sponsorWatches)
      .set({ status: "cancelled" })
      .where(eq(sponsorWatches.id, id));
  }

  async getPendingWatchesByCompanyName(companyName: string): Promise<(SponsorWatch & { userEmail: string })[]> {
    const rows = await db
      .select({
        id: sponsorWatches.id,
        userId: sponsorWatches.userId,
        companyName: sponsorWatches.companyName,
        companyNumber: sponsorWatches.companyNumber,
        status: sponsorWatches.status,
        createdAt: sponsorWatches.createdAt,
        notifiedAt: sponsorWatches.notifiedAt,
        userEmail: users.email,
      })
      .from(sponsorWatches)
      .innerJoin(users, eq(sponsorWatches.userId, users.id))
      .where(
        sql`LOWER(${sponsorWatches.companyName}) = LOWER(${companyName})
            AND ${sponsorWatches.status} = 'pending_activation'`
      );
    return rows.map((r) => ({ ...r, userEmail: r.userEmail ?? "" }));
  }

  async markSponsorWatchNotified(id: string): Promise<void> {
    await db
      .update(sponsorWatches)
      .set({ status: "notified", notifiedAt: new Date() })
      .where(eq(sponsorWatches.id, id));
  }
}

export const sponsorWatchRepository = new SponsorWatchRepository();
