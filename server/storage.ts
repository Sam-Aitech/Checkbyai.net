import {
  users,
  ipVerifications,
  trustedPatterns,
  globalAiRules,
  verificationResults,
  feedback,
  paidSubmissions,
  expertRequests,
  type User,
  type UpsertUser,
  type IpVerification,
  type InsertIpVerification,
  type TrustedPattern,
  type GlobalAiRule,
  type InsertGlobalAiRule,
  type VerificationResult,
  type Feedback,
  type InsertFeedback,
  type PaidSubmission,
  type InsertPaidSubmission,
  type ExpertRequest,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, count, avg, sql, inArray } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserVerificationCode(identifier: string, code: string, expiry: Date): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
  verifyUser(identifier: string): Promise<User | undefined>;
  updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string): Promise<User>;
  updateUserSubscription(userId: string, data: { subscriptionStatus: string; stripeSubscriptionId?: string | null; stripeCustomerId?: string }): Promise<User>;
  updateUserStripeCustomer(userId: string, customerId: string): Promise<User>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  addCredits(userId: string, amount: number): Promise<User>;
  deductCredits(userId: string, amount: number): Promise<User>;
  getCredits(userId: string): Promise<number>;
  updateDailyVerificationUsage(userId: string): Promise<User>;
  checkDailyLimit(userId: string): Promise<boolean>;
  updateUserVerificationLimit(userId: string, limit: number | null): Promise<User | undefined>;
  updateCosCheckApproval(userId: string, approved: boolean): Promise<void>;

  // Expert requests operations
  createExpertRequest(userId: string, stripeSessionId?: string): Promise<number>;
  
  // IP verification operations (for anonymous users)
  getIpVerification(hashedIp: string): Promise<IpVerification | undefined>;
  upsertIpVerification(data: InsertIpVerification): Promise<IpVerification>;
  
  // Trusted patterns operations
  getTrustedPatterns(): Promise<TrustedPattern[]>;
  createTrustedPattern(filename: string, metadata: any, patterns: any, aiInstructions?: string): Promise<number>;
  updateTrustedPatternInstructions(id: number, aiInstructions: string): Promise<void>;
  deleteTrustedPattern(id: number): Promise<void>;
  
  // Global AI rules operations
  getGlobalAiRules(): Promise<GlobalAiRule[]>;
  getActiveGlobalAiRules(): Promise<GlobalAiRule[]>;
  createGlobalAiRule(data: InsertGlobalAiRule): Promise<GlobalAiRule>;
  updateGlobalAiRule(id: number, data: Partial<InsertGlobalAiRule>): Promise<GlobalAiRule>;
  deleteGlobalAiRule(id: number): Promise<void>;
  toggleGlobalAiRule(id: number, isActive: boolean): Promise<void>;
  
  // Verification operations
  createVerificationResult(
    filename: string,
    result: string,
    confidence: number,
    metadata: any,
    analysisDetails: any,
    ipAddress?: string,
    userId?: string,
    receiptId?: string,
    documentHash?: string
  ): Promise<number>;
  getVerificationsByUserId(userId: string, limit?: number): Promise<VerificationResult[]>;
  getVerificationByReceiptId(receiptId: string): Promise<VerificationResult | undefined>;
  getRecentActivity(limit?: number): Promise<VerificationResult[]>;
  getVerificationById(id: number): Promise<VerificationResult | undefined>;
  getPaginatedVerificationLogs(options: {
    page: number;
    limit: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<{
    data: VerificationResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getStats(): Promise<{
    trustedPatterns: number;
    verificationsToday: number;
    suspiciousToday: number;
    totalUsers: number;
    proUsers: number;
  }>;
  
  // Feedback operations
  createFeedback(feedbackData: InsertFeedback): Promise<Feedback>;
  getFeedbackStats(): Promise<{
    totalFeedback: number;
    averageRating: number;
    helpfulCount: number;
    accuracyBreakdown: { correct: number; incorrect: number; unsure: number };
    recentFeedback: Feedback[];
  }>;
  
  // Paid submissions operations
  createPaidSubmission(data: InsertPaidSubmission): Promise<PaidSubmission>;
  getPaidSubmission(id: number): Promise<PaidSubmission | undefined>;
  getPaidSubmissionBySessionId(sessionId: string): Promise<PaidSubmission | undefined>;
  updatePaidSubmission(id: number, data: Partial<InsertPaidSubmission>): Promise<PaidSubmission>;
  getPendingPaidSubmissions(): Promise<PaidSubmission[]>;
  getAllPaidSubmissions(): Promise<PaidSubmission[]>;
  getAssignedSubmissions(adminId: string): Promise<PaidSubmission[]>;
  
  // User management operations
  getPaginatedUsers(options: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{
    data: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  updateUserRestriction(userId: string, restricted: boolean, reason?: string): Promise<void>;
  
  // HITL (Human-in-the-Loop) operations
  updateVerificationFeedback(id: number, data: {
    adminStatus: string;
    adminFeedback?: string | null;
    adminReviewedBy: string;
    adminReviewedAt: Date;
    accuracyScore?: number | null;
  }): Promise<VerificationResult>;
  getAdminFakeKnowledge(limit?: number): Promise<VerificationResult[]>;
  deleteVerificationLog(id: number): Promise<void>;
  getVerificationLogsWithHITL(page: number, limit: number, adminStatus?: string): Promise<{
    data: VerificationResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserVerificationCode(identifier: string, code: string, expiry: Date): Promise<void> {
    // Update by email or phone
    await db
      .update(users)
      .set({
        verificationCode: code,
        codeExpiry: expiry,
        updatedAt: new Date(),
      })
      .where(sql`${users.email} = ${identifier} OR ${users.phone} = ${identifier}`);
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db
      .update(users)
      .set({
        hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async verifyUser(identifier: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        isVerified: true,
        verificationCode: null,
        codeExpiry: null,
        updatedAt: new Date(),
      })
      .where(sql`${users.email} = ${identifier} OR ${users.phone} = ${identifier}`)
      .returning();
    return user;
  }

  async updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserSubscription(userId: string, data: { subscriptionStatus: string; stripeSubscriptionId?: string | null; stripeCustomerId?: string }): Promise<User> {
    const updateData: any = {
      subscriptionStatus: data.subscriptionStatus,
      updatedAt: new Date(),
    };
    if (data.stripeSubscriptionId !== undefined) {
      updateData.stripeSubscriptionId = data.stripeSubscriptionId;
    }
    if (data.stripeCustomerId) {
      updateData.stripeCustomerId = data.stripeCustomerId;
    }
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserStripeCustomer(userId: string, customerId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
    return user;
  }

  async addCredits(userId: string, amount: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        credits: sql`COALESCE(${users.credits}, 0) + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async deductCredits(userId: string, amount: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        credits: sql`GREATEST(COALESCE(${users.credits}, 0) - ${amount}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getCredits(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    return user?.credits || 0;
  }

  async updateDailyVerificationUsage(userId: string): Promise<User> {
    const today = new Date().toISOString().split('T')[0];
    const user = await this.getUser(userId);
    
    if (!user) throw new Error('User not found');
    
    // Reset count if it's a new day
    const usageToday = user.lastVerificationDate === today ? (user.dailyVerificationsUsed || 0) + 1 : 1;
    
    const [updatedUser] = await db
      .update(users)
      .set({
        dailyVerificationsUsed: usageToday,
        lastVerificationDate: today,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    return updatedUser;
  }

  async checkDailyLimit(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;
    
    if (user.subscriptionStatus === 'unlimited' || user.subscriptionStatus === 'enterprise') return true;
    
    // Admin-assigned unlimited access (verificationLimit = -1)
    if (user.verificationLimit === -1) return true;
    
    // Admin-assigned custom limit (total verifications)
    if (user.verificationLimit !== null && user.verificationLimit > 0) {
      return (user.totalVerificationsUsed || 0) < user.verificationLimit;
    }
    
    // Default: 1 verification per day for free users
    const today = new Date().toISOString().split('T')[0];
    
    // If last verification was not today, they can verify
    if (user.lastVerificationDate !== today) return true;
    
    // Free users get 1 verification per day
    return (user.dailyVerificationsUsed || 0) < 1;
  }

  async updateUserVerificationLimit(userId: string, limit: number | null): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({
        verificationLimit: limit,
        totalVerificationsUsed: 0, // Reset usage when limit changes
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async updateCosCheckApproval(userId: string, approved: boolean): Promise<void> {
    await db
      .update(users)
      .set({
        cosCheckApproved: approved,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  // Expert requests operations
  async createExpertRequest(userId: string, stripeSessionId?: string): Promise<number> {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + 24); // 24-hour SLA
    
    const [request] = await db
      .insert(expertRequests)
      .values({
        userId,
        fileUrl: '', // Will be updated when user uploads document
        status: 'pending',
        priority: true,
        stripeSessionId: stripeSessionId || null,
        deadline,
      })
      .returning();
    return request.id;
  }

  // IP verification operations (for anonymous users)
  async getIpVerification(hashedIp: string): Promise<IpVerification | undefined> {
    const [record] = await db
      .select()
      .from(ipVerifications)
      .where(eq(ipVerifications.ipAddress, hashedIp));
    return record;
  }

  async upsertIpVerification(data: InsertIpVerification): Promise<IpVerification> {
    const [record] = await db
      .insert(ipVerifications)
      .values(data)
      .onConflictDoUpdate({
        target: ipVerifications.ipAddress,
        set: {
          lastVerificationDate: data.lastVerificationDate,
          verificationCount: sql`${ipVerifications.verificationCount} + 1`,
        },
      })
      .returning();
    return record;
  }

  // Trusted patterns operations
  async getTrustedPatterns(): Promise<TrustedPattern[]> {
    return await db.select().from(trustedPatterns).where(eq(trustedPatterns.status, 'active'));
  }

  async createTrustedPattern(filename: string, metadata: any, patterns: any, aiInstructions?: string): Promise<number> {
    const [pattern] = await db
      .insert(trustedPatterns)
      .values({
        filename,
        metadata,
        patterns,
        aiInstructions,
      })
      .returning();
    return pattern.id;
  }

  async updateTrustedPatternInstructions(id: number, aiInstructions: string): Promise<void> {
    await db
      .update(trustedPatterns)
      .set({ aiInstructions, lastUpdated: new Date() })
      .where(eq(trustedPatterns.id, id));
  }

  async deleteTrustedPattern(id: number): Promise<void> {
    await db.update(trustedPatterns).set({ status: 'deleted' }).where(eq(trustedPatterns.id, id));
  }

  // Global AI rules operations
  async getGlobalAiRules(): Promise<GlobalAiRule[]> {
    return await db.select().from(globalAiRules).orderBy(desc(globalAiRules.priority));
  }

  async getActiveGlobalAiRules(): Promise<GlobalAiRule[]> {
    return await db
      .select()
      .from(globalAiRules)
      .where(eq(globalAiRules.isActive, true))
      .orderBy(desc(globalAiRules.priority));
  }

  async createGlobalAiRule(data: InsertGlobalAiRule): Promise<GlobalAiRule> {
    const [rule] = await db
      .insert(globalAiRules)
      .values(data)
      .returning();
    return rule;
  }

  async updateGlobalAiRule(id: number, data: Partial<InsertGlobalAiRule>): Promise<GlobalAiRule> {
    const [rule] = await db
      .update(globalAiRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(globalAiRules.id, id))
      .returning();
    return rule;
  }

  async deleteGlobalAiRule(id: number): Promise<void> {
    await db.delete(globalAiRules).where(eq(globalAiRules.id, id));
  }

  async toggleGlobalAiRule(id: number, isActive: boolean): Promise<void> {
    await db
      .update(globalAiRules)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(globalAiRules.id, id));
  }

  // Verification operations
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
      .where(eq(verificationResults.userId, userId))
      .orderBy(desc(verificationResults.verifiedAt))
      .limit(limit);
  }

  async getVerificationByReceiptId(receiptId: string): Promise<VerificationResult | undefined> {
    const [result] = await db
      .select()
      .from(verificationResults)
      .where(eq(verificationResults.receiptId, receiptId));
    return result;
  }

  async getRecentActivity(limit: number = 20): Promise<VerificationResult[]> {
    return await db
      .select()
      .from(verificationResults)
      .orderBy(desc(verificationResults.verifiedAt))
      .limit(limit);
  }

  async getVerificationById(id: number): Promise<VerificationResult | undefined> {
    const [result] = await db
      .select()
      .from(verificationResults)
      .where(eq(verificationResults.id, id));
    return result;
  }

  async getPaginatedVerificationLogs(options: {
    page: number;
    limit: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<{
    data: VerificationResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, status, startDate, endDate, search } = options;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];
    
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

    // Get total count
    const [countResult] = await db
      .select({ count: count() })
      .from(verificationResults)
      .where(whereClause);
    
    const total = Number(countResult?.count || 0);

    // Get paginated data
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

  async getStats(): Promise<{
    trustedPatterns: number;
    verificationsToday: number;
    suspiciousToday: number;
    totalUsers: number;
    proUsers: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    
    const [trustedPatternsCount] = await db
      .select({ count: count() })
      .from(trustedPatterns)
      .where(eq(trustedPatterns.status, 'active'));
    
    const [verificationsToday] = await db
      .select({ count: count() })
      .from(verificationResults)
      .where(gte(verificationResults.verifiedAt, new Date(today)));
    
    const [suspiciousToday] = await db
      .select({ count: count() })
      .from(verificationResults)
      .where(
        gte(verificationResults.verifiedAt, new Date(today))
      );
    
    const [totalUsers] = await db
      .select({ count: count() })
      .from(users);
    
    const [proUsers] = await db
      .select({ count: count() })
      .from(users)
      .where(inArray(users.subscriptionStatus, ['starter', 'pro', 'unlimited', 'enterprise']));
    
    return {
      trustedPatterns: trustedPatternsCount.count,
      verificationsToday: verificationsToday.count,
      suspiciousToday: Math.floor(suspiciousToday.count * 0.15), // Approximate suspicious rate
      totalUsers: totalUsers.count,
      proUsers: proUsers.count,
    };
  }

  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const [newFeedback] = await db
      .insert(feedback)
      .values(feedbackData)
      .returning();
    return newFeedback;
  }

  async getFeedbackStats(): Promise<{
    totalFeedback: number;
    averageRating: number;
    helpfulCount: number;
    accuracyBreakdown: { correct: number; incorrect: number; unsure: number };
    recentFeedback: Feedback[];
  }> {
    const [totalCount] = await db
      .select({ count: count() })
      .from(feedback);

    const [avgRating] = await db
      .select({ average: avg(feedback.rating) })
      .from(feedback);

    const [helpfulCount] = await db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.helpful, true));

    const [correctCount] = await db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.accuracy, 'correct'));

    const [incorrectCount] = await db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.accuracy, 'incorrect'));

    const [unsureCount] = await db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.accuracy, 'unsure'));

    const recentFeedback = await db
      .select()
      .from(feedback)
      .orderBy(desc(feedback.createdAt))
      .limit(10);

    return {
      totalFeedback: Number(totalCount.count) || 0,
      averageRating: Number(avgRating.average) || 0,
      helpfulCount: Number(helpfulCount.count) || 0,
      accuracyBreakdown: {
        correct: Number(correctCount.count) || 0,
        incorrect: Number(incorrectCount.count) || 0,
        unsure: Number(unsureCount.count) || 0,
      },
      recentFeedback,
    };
  }

  // Paid submissions operations
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

  async getPaginatedUsers(options: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{
    data: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, search } = options;
    const offset = (page - 1) * limit;

    const whereClause = search
      ? sql`${users.email} ILIKE ${'%' + search + '%'} OR ${users.username} ILIKE ${'%' + search + '%'}`
      : undefined;

    const [countResult] = await db
      .select({ count: count() })
      .from(users)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const data = await db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
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

  async updateUserRestriction(userId: string, restricted: boolean, reason?: string): Promise<void> {
    await db
      .update(users)
      .set({
        isRestricted: restricted,
        restrictionReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  // HITL (Human-in-the-Loop) operations
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
    // When admin overrides to fake, flip the official result immediately
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
      .where(eq(verificationResults.adminStatus, 'fake'))
      .orderBy(desc(verificationResults.adminReviewedAt))
      .limit(limit);
  }

  async deleteVerificationLog(id: number): Promise<void> {
    await db.delete(verificationResults).where(eq(verificationResults.id, id));
  }

  async getVerificationLogsWithHITL(page: number, limit: number, adminStatus?: string): Promise<{
    data: VerificationResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;

    const whereClause = adminStatus && adminStatus !== 'all'
      ? eq(verificationResults.adminStatus, adminStatus)
      : undefined;

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

export const storage = new DatabaseStorage();