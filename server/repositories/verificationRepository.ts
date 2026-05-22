import { verificationResults, users, trustedPatterns, type VerificationResult } from "@shared/schema";
import { db } from "../db";
import { eq, desc, gte, count, sql, isNull, and, getTableColumns, inArray } from "drizzle-orm";

export class VerificationRepository {
  async createVerificationResult(
    filename: string,
    result: string,
    confidence: number,
    metadata: any,
    analysisDetails: any,
    ipAddress?: string,
    userId?: string,
    receiptId?: string,
    documentHash?: string
  ): Promise<number> {
    const [verification] = await db
      .insert(verificationResults)
      .values({
        userId,
        filename,
        result,
        confidence,
        metadata,
        analysisDetails,
        ipAddress,
        receiptId,
        documentHash,
      })
      .returning();
    return verification.id;
  }

  async getVerificationsByUserId(userId: string, limit: number = 50): Promise<VerificationResult[]> {
    return await db
      .select()
      .from(verificationResults)
      .where(and(eq(verificationResults.userId, userId), isNull(verificationResults.deletedAt)))
      .orderBy(desc(verificationResults.verifiedAt))
      .limit(limit);
  }

  async getVerificationByReceiptId(receiptId: string): Promise<VerificationResult | undefined> {
    const [result] = await db
      .select()
      .from(verificationResults)
      .where(and(eq(verificationResults.receiptId, receiptId), isNull(verificationResults.deletedAt)));
    return result;
  }

  async getAdminFlaggedVerificationByHash(documentHash: string): Promise<VerificationResult | undefined> {
    const [result] = await db
      .select()
      .from(verificationResults)
      .where(
        sql`${verificationResults.documentHash} = ${documentHash}
            AND ${verificationResults.adminStatus} = 'fake'
            AND ${verificationResults.adminFeedback} IS NOT NULL
            AND ${verificationResults.deletedAt} IS NULL`
      )
      .orderBy(desc(verificationResults.adminReviewedAt))
      .limit(1);
    return result;
  }

  async getRecentActivity(limit: number = 20): Promise<VerificationResult[]> {
    return await db
      .select()
      .from(verificationResults)
      .where(isNull(verificationResults.deletedAt))
      .orderBy(desc(verificationResults.verifiedAt))
      .limit(limit);
  }

  async getVerificationById(id: number): Promise<VerificationResult | undefined> {
    const [result] = await db
      .select()
      .from(verificationResults)
      .where(and(eq(verificationResults.id, id), isNull(verificationResults.deletedAt)));
    return result;
  }

  async getPaginatedVerificationLogs(options: {
    page: number;
    limit: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    period?: string;
  }): Promise<{
    data: (VerificationResult & { userEmail?: string | null })[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, status, search, period } = options;
    let { startDate, endDate } = options;
    const offset = (page - 1) * limit;

    if (period) {
      const now = new Date();
      if (period === 'today') {
        const todayStr = now.toISOString().split('T')[0];
        startDate = todayStr;
        endDate = todayStr;
      } else {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : null;
        if (days) {
          const from = new Date(now);
          from.setDate(from.getDate() - days);
          startDate = from.toISOString().split('T')[0];
          endDate = undefined;
        }
      }
    }

    const conditions = [isNull(verificationResults.deletedAt)];

    if (status && status !== 'all') {
      conditions.push(eq(verificationResults.result, status));
    }
    if (startDate) {
      conditions.push(gte(verificationResults.verifiedAt, new Date(startDate)));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(sql`${verificationResults.verifiedAt} <= ${end}`);
    }
    if (search) {
      conditions.push(sql`${verificationResults.filename} ILIKE ${'%' + search + '%'}`);
    }

    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

    const [countResult] = await db
      .select({ count: count() })
      .from(verificationResults)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const data = await db
      .select({
        ...getTableColumns(verificationResults),
        userEmail: users.email,
      })
      .from(verificationResults)
      .leftJoin(users, eq(verificationResults.userId, users.id))
      .where(whereClause)
      .orderBy(desc(verificationResults.verifiedAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats(): Promise<{
    trustedPatterns: number;
    verificationsToday: number;
    totalUsers: number;
    proUsers: number;
  }> {
    const today = new Date().toISOString().split('T')[0];

    const [
      trustedPatternsCount,
      verificationsToday,
      totalUsers,
      proUsers,
    ] = await Promise.all([
      db.select({ count: count() }).from(trustedPatterns).where(eq(trustedPatterns.status, 'active')),
      db.select({ count: count() }).from(verificationResults).where(and(gte(verificationResults.verifiedAt, new Date(today)), isNull(verificationResults.deletedAt))),
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(users).where(inArray(users.subscriptionStatus, ['starter', 'pro', 'unlimited', 'enterprise'])),
    ]);

    return {
      trustedPatterns: trustedPatternsCount[0].count,
      verificationsToday: verificationsToday[0].count,
      totalUsers: totalUsers[0].count,
      proUsers: proUsers[0].count,
    };
  }

  async updateVerificationFeedback(id: number, data: {
    adminStatus: string;
    adminFeedback?: string | null;
    adminReviewedBy: string;
    adminReviewedAt: Date;
    accuracyScore?: number | null;
    overrideResult?: string;
  }): Promise<VerificationResult> {
    const setFields: Record<string, any> = {
      adminStatus: data.adminStatus,
      adminFeedback: data.adminFeedback,
      adminReviewedBy: data.adminReviewedBy,
      adminReviewedAt: data.adminReviewedAt,
      accuracyScore: data.accuracyScore,
    };
    if (data.overrideResult) {
      setFields.result = data.overrideResult;
    }
    const [result] = await db
      .update(verificationResults)
      .set(setFields)
      .where(eq(verificationResults.id, id))
      .returning();
    return result;
  }

  async getAdminFakeKnowledge(limit: number = 15): Promise<VerificationResult[]> {
    return await db
      .select()
      .from(verificationResults)
      .where(and(eq(verificationResults.adminStatus, 'fake'), isNull(verificationResults.deletedAt)))
      .orderBy(desc(verificationResults.adminReviewedAt))
      .limit(limit);
  }

  async deleteVerificationLog(id: number): Promise<void> {
    await db.update(verificationResults).set({ deletedAt: new Date() }).where(eq(verificationResults.id, id));
  }

  async getVerificationLogsWithHITL(page: number, limit: number, adminStatus?: string): Promise<{
    data: VerificationResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;

    const statusClause = adminStatus && adminStatus !== 'all'
      ? eq(verificationResults.adminStatus, adminStatus)
      : undefined;

    const whereClause = statusClause
      ? and(statusClause, isNull(verificationResults.deletedAt))
      : isNull(verificationResults.deletedAt);

    const [countResult] = await db
      .select({ count: count() })
      .from(verificationResults)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const data = await db
      .select()
      .from(verificationResults)
      .where(whereClause)
      .orderBy(desc(verificationResults.verifiedAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export const verificationRepository = new VerificationRepository();
