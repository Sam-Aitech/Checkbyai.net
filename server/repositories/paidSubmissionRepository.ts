import { paidSubmissions, type PaidSubmission, type InsertPaidSubmission } from "@shared/schema";
import { db } from "../db";
import { and, eq, desc } from "drizzle-orm";

export class PaidSubmissionRepository {
  async createPaidSubmission(data: InsertPaidSubmission): Promise<PaidSubmission> {
    const [submission] = await db
      .insert(paidSubmissions)
      .values(data)
      .returning();
    return submission;
  }

  /**
   * SYSTEM/ADMIN ONLY: reads by id with no principal. Never call from a user-facing route;
   * use getPaidSubmissionForUser so ownership is enforced in SQL.
   */
  async getPaidSubmission(id: number): Promise<PaidSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(paidSubmissions)
      .where(eq(paidSubmissions.id, id));
    return submission;
  }

  /** SYSTEM ONLY (Stripe webhook / reconciliation). User routes use the ForUser variant. */
  async getPaidSubmissionBySessionId(sessionId: string): Promise<PaidSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(paidSubmissions)
      .where(eq(paidSubmissions.stripeSessionId, sessionId));
    return submission;
  }

  /** SYSTEM/ADMIN ONLY: updates by id with no principal. User routes use updatePaidSubmissionForUser. */
  async updatePaidSubmission(id: number, data: Partial<InsertPaidSubmission>): Promise<PaidSubmission> {
    const [submission] = await db
      .update(paidSubmissions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(paidSubmissions.id, id))
      .returning();
    return submission;
  }

  /**
   * Owner-scoped reads/writes. The owner predicate is part of the WHERE clause, so a row
   * belonging to another user (or with a NULL owner) is indistinguishable from a missing row.
   */
  async getPaidSubmissionForUser(id: number, userId: string): Promise<PaidSubmission | undefined> {
    if (!userId) return undefined;
    const [submission] = await db
      .select()
      .from(paidSubmissions)
      .where(and(eq(paidSubmissions.id, id), eq(paidSubmissions.userId, userId)));
    return submission;
  }

  async getPaidSubmissionBySessionIdForUser(sessionId: string, userId: string): Promise<PaidSubmission | undefined> {
    if (!userId) return undefined;
    const [submission] = await db
      .select()
      .from(paidSubmissions)
      .where(and(eq(paidSubmissions.stripeSessionId, sessionId), eq(paidSubmissions.userId, userId)));
    return submission;
  }

  async updatePaidSubmissionForUser(
    id: number,
    userId: string,
    data: Partial<InsertPaidSubmission>,
  ): Promise<PaidSubmission | undefined> {
    if (!userId) return undefined;
    const [submission] = await db
      .update(paidSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(paidSubmissions.id, id), eq(paidSubmissions.userId, userId)))
      .returning();
    return submission;
  }

  async getPendingPaidSubmissions(): Promise<PaidSubmission[]> {
    return await db
      .select()
      .from(paidSubmissions)
      .where(eq(paidSubmissions.reviewStatus, 'pending'))
      .orderBy(desc(paidSubmissions.priority), desc(paidSubmissions.createdAt));
  }

  async getAllPaidSubmissions(): Promise<PaidSubmission[]> {
    return await db
      .select()
      .from(paidSubmissions)
      .orderBy(desc(paidSubmissions.priority), desc(paidSubmissions.createdAt));
  }

  async getAssignedSubmissions(adminId: string): Promise<PaidSubmission[]> {
    return await db
      .select()
      .from(paidSubmissions)
      .where(eq(paidSubmissions.assignedTo, adminId))
      .orderBy(desc(paidSubmissions.createdAt));
  }
}

export const paidSubmissionRepository = new PaidSubmissionRepository();
