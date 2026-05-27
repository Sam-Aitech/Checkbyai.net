import { paidSubmissions, type PaidSubmission, type InsertPaidSubmission } from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";

export class PaidSubmissionRepository {
  async createPaidSubmission(data: InsertPaidSubmission): Promise<PaidSubmission> {
    const [submission] = await db
      .insert(paidSubmissions)
      .values(data)
      .returning();
    return submission;
  }

  async getPaidSubmission(id: number): Promise<PaidSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(paidSubmissions)
      .where(eq(paidSubmissions.id, id));
    return submission;
  }

  async getPaidSubmissionBySessionId(sessionId: string): Promise<PaidSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(paidSubmissions)
      .where(eq(paidSubmissions.stripeSessionId, sessionId));
    return submission;
  }

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
