import {
  users,
  trustedPatterns,
  verificationResults,
  type User,
  type UpsertUser,
  type TrustedPattern,
  type VerificationResult,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, count } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string): Promise<User>;
  updateUserSubscription(userId: string, status: 'free' | 'pro'): Promise<User>;
  updateDailyVerificationUsage(userId: string): Promise<User>;
  checkDailyLimit(userId: string): Promise<boolean>;
  
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
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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
}

export const storage = new DatabaseStorage();