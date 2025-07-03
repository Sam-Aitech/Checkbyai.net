import { 
  users, 
  trustedPatterns, 
  verificationResults,
  type User, 
  type InsertUser,
  type TrustedPattern,
  type InsertTrustedPattern,
  type VerificationResult,
  type InsertVerificationResult
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, count, and, gte } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  
  // Trusted Patterns
  getTrustedPatterns(): Promise<TrustedPattern[]>;
  createTrustedPattern(pattern: InsertTrustedPattern): Promise<TrustedPattern>;
  deleteTrustedPattern(id: number): Promise<void>;
  
  // Verification Results
  createVerificationResult(result: InsertVerificationResult): Promise<VerificationResult>;
  getRecentActivity(): Promise<VerificationResult[]>;
  
  // Statistics
  getStats(): Promise<{
    trustedPatterns: number;
    verificationsToday: number;
    suspiciousDocs: number;
    successRate: string;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getTrustedPatterns(): Promise<TrustedPattern[]> {
    return await db.select().from(trustedPatterns).orderBy(desc(trustedPatterns.uploadedAt));
  }

  async createTrustedPattern(pattern: InsertTrustedPattern): Promise<TrustedPattern> {
    const [result] = await db
      .insert(trustedPatterns)
      .values(pattern)
      .returning();
    return result;
  }

  async deleteTrustedPattern(id: number): Promise<void> {
    await db.delete(trustedPatterns).where(eq(trustedPatterns.id, id));
  }

  async createVerificationResult(result: InsertVerificationResult): Promise<VerificationResult> {
    const [created] = await db
      .insert(verificationResults)
      .values(result)
      .returning();
    return created;
  }

  async getRecentActivity(): Promise<VerificationResult[]> {
    return await db
      .select()
      .from(verificationResults)
      .orderBy(desc(verificationResults.verifiedAt))
      .limit(10);
  }

  async getStats(): Promise<{
    trustedPatterns: number;
    verificationsToday: number;
    suspiciousDocs: number;
    successRate: string;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count trusted patterns
    const [patternsCount] = await db
      .select({ count: count() })
      .from(trustedPatterns)
      .where(eq(trustedPatterns.status, 'active'));

    // Count verifications today
    const [verificationsToday] = await db
      .select({ count: count() })
      .from(verificationResults)
      .where(gte(verificationResults.verifiedAt, today));

    // Count suspicious documents
    const [suspiciousCount] = await db
      .select({ count: count() })
      .from(verificationResults)
      .where(eq(verificationResults.result, 'suspicious'));

    // Calculate success rate (genuine + suspicious / total)
    const [totalVerifications] = await db
      .select({ count: count() })
      .from(verificationResults);

    const [genuineCount] = await db
      .select({ count: count() })
      .from(verificationResults)
      .where(eq(verificationResults.result, 'genuine'));

    const successCount = genuineCount.count + suspiciousCount.count;
    const successRate = totalVerifications.count > 0 
      ? ((successCount / totalVerifications.count) * 100).toFixed(1)
      : '0.0';

    return {
      trustedPatterns: patternsCount.count,
      verificationsToday: verificationsToday.count,
      suspiciousDocs: suspiciousCount.count,
      successRate
    };
  }
}

export const storage = new DatabaseStorage();