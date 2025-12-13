import {
  users,
  ipVerifications,
  trustedPatterns,
  verificationResults,
  feedback,
  paidSubmissions,
  type User,
  type UpsertUser,
  type IpVerification,
  type InsertIpVerification,
  type TrustedPattern,
  type VerificationResult,
  type Feedback,
  type InsertFeedback,
  type PaidSubmission,
  type InsertPaidSubmission,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, count, avg, sql } from "drizzle-orm";

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
  updateUserSubscription(userId: string, status: 'free' | 'pro'): Promise<User>;
  updateDailyVerificationUsage(userId: string): Promise<User>;
  checkDailyLimit(userId: string): Promise<boolean>;
  
  // IP verification operations (for anonymous users)
  getIpVerification(hashedIp: string): Promise<IpVerification | undefined>;
  upsertIpVerification(data: InsertIpVerification): Promise<IpVerification>;
  
  // Trusted patterns operations
  getTrustedPatterns(): Promise<TrustedPattern[]>;
  createTrustedPattern(filename: string, metadata: any, patterns: any): Promise<number>;
  deleteTrustedPattern(id: number): Promise<void>;
  
  // Verification operations
  createVerificationResult(
    filename: string,
    result: string,
    confidence: number,
    metadata: any,
    analysisDetails: any,
    ipAddress?: string,
    userId?: string
  ): Promise<number>;
  getRecentActivity(limit?: number): Promise<VerificationResult[]>;
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
  getAssignedSubmissions(adminId: string): Promise<PaidSubmission[]>;
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

  async updateUserSubscription(userId: string, status: 'free' | 'pro'): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        subscriptionStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
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
    
    // Pro users have unlimited access
    if (user.subscriptionStatus === 'pro') return true;
    
    const today = new Date().toISOString().split('T')[0];
    
    // If last verification was not today, they can verify
    if (user.lastVerificationDate !== today) return true;
    
    // Free users get 1 verification per day
    return (user.dailyVerificationsUsed || 0) < 1;
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

  async createTrustedPattern(filename: string, metadata: any, patterns: any): Promise<number> {
    const [pattern] = await db
      .insert(trustedPatterns)
      .values({
        filename,
        metadata,
        patterns,
      })
      .returning();
    return pattern.id;
  }

  async deleteTrustedPattern(id: number): Promise<void> {
    await db.update(trustedPatterns).set({ status: 'deleted' }).where(eq(trustedPatterns.id, id));
  }

  // Verification operations
  async createVerificationResult(
    filename: string,
    result: string,
    confidence: number,
    metadata: any,
    analysisDetails: any,
    ipAddress?: string,
    userId?: string
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
      })
      .returning();
    return verification.id;
  }

  async getRecentActivity(limit: number = 20): Promise<VerificationResult[]> {
    return await db
      .select()
      .from(verificationResults)
      .orderBy(desc(verificationResults.verifiedAt))
      .limit(limit);
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
      .where(eq(users.subscriptionStatus, 'pro'));
    
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

  async getAssignedSubmissions(adminId: string): Promise<PaidSubmission[]> {
    return await db
      .select()
      .from(paidSubmissions)
      .where(eq(paidSubmissions.assignedTo, adminId))
      .orderBy(desc(paidSubmissions.createdAt));
  }
}

export const storage = new DatabaseStorage();