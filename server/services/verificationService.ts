import * as crypto from "crypto";
import * as fs from "fs";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { users, verificationResults } from "@shared/schema";
import { withRetry } from "../utils/dbRetry";
import { ApiError } from "../lib/apiError";

export class VerificationService {
  generateReceiptId(): string {
    const random1 = crypto.randomBytes(4).toString("hex").toUpperCase();
    const random2 = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `CBA-${random1}-${random2}`;
  }

  async generateDocumentHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.promises.readFile(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  }

  async checkAccess(userId: string): Promise<{
    allowed: boolean;
    useCredits: boolean;
    useDailyLimit: boolean;
  }> {
    const user = await storage.getUser(userId);
    if (!user) throw new ApiError(404, "User not found");

    const isAdminUser = user.role === "admin";
    const hasCosSubscription = user.cosCheckSubscription === true;
    const hasPaidPlanWithCos = ["pro", "unlimited", "enterprise"].includes(user.subscriptionStatus || "");
    const hasAdminApproval = user.cosCheckApproved === true;

    if (!isAdminUser && !hasCosSubscription && !hasPaidPlanWithCos && !hasAdminApproval) {
      throw new ApiError(403, "Your account is pending COS Check access. Please contact support or upgrade your subscription.");
    }

    const hasUnlimited = isAdminUser || hasCosSubscription || user.subscriptionStatus === "unlimited" || user.subscriptionStatus === "enterprise" || user.verificationLimit === -1;

    if (hasUnlimited) {
      return { allowed: true, useCredits: false, useDailyLimit: false };
    }

    const credits = user.credits || 0;
    if (credits > 0) {
      return { allowed: true, useCredits: true, useDailyLimit: false };
    }

    const canVerify = await storage.checkDailyLimit(userId);
    if (!canVerify) {
      return { allowed: false, useCredits: false, useDailyLimit: false };
    }

    return { allowed: true, useCredits: false, useDailyLimit: true };
  }

  async checkIpRateLimit(userId: string, clientIp: string): Promise<string | null> {
    const user = await storage.getUser(userId);
    if (!user || user.ipExempt || user.role === "admin") return null;

    const { hashIpAddress } = await import("../ipRateLimit");
    const hashedIp = hashIpAddress(clientIp);
    const ipRecord = await storage.getIpVerification(hashedIp);

    if (ipRecord) {
      const lastVerification = new Date(ipRecord.lastVerificationDate);
      const now = new Date();
      const daysSince = (now.getTime() - lastVerification.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 1) {
        throw new ApiError(429, "You have already verified a document today. Upgrade or wait until tomorrow.");
      }
    }

    return hashedIp;
  }

  async saveVerification(params: {
    userId?: string;
    filename: string;
    result: string;
    confidence: number;
    metadata: any;
    analysisDetails: any;
    ipAddress?: string;
    receiptId: string;
    documentHash: string;
    useCredits: boolean;
    useDailyLimit: boolean;
    isAdminOverride?: boolean;
    priorAdminFlag?: any;
  }) {
    return withRetry(async () => {
      return db.transaction(async (tx) => {
        if (params.useCredits && params.userId) {
          await tx.update(users).set({
            credits: sql`GREATEST(COALESCE(${users.credits}, 0) - 1, 0)`,
            updatedAt: new Date(),
          }).where(eq(users.id, params.userId));
        } else if (params.useDailyLimit && params.userId) {
          const today = new Date().toISOString().split("T")[0];
          const [currentUser] = await tx.select({
            dailyVerificationsUsed: users.dailyVerificationsUsed,
            lastVerificationDate: users.lastVerificationDate,
          }).from(users).where(eq(users.id, params.userId));
          const usageToday = currentUser?.lastVerificationDate === today
            ? (currentUser.dailyVerificationsUsed || 0) + 1
            : 1;
          await tx.update(users).set({
            dailyVerificationsUsed: usageToday,
            lastVerificationDate: today,
            updatedAt: new Date(),
          }).where(eq(users.id, params.userId));
        }

        const insertValues: any = {
          userId: params.userId,
          filename: params.filename,
          result: params.result,
          confidence: Math.floor(params.confidence),
          metadata: params.metadata,
          analysisDetails: params.analysisDetails,
          ipAddress: params.ipAddress,
          receiptId: params.receiptId,
          documentHash: params.documentHash,
        };

        if (params.isAdminOverride && params.priorAdminFlag) {
          insertValues.adminStatus = "fake";
          insertValues.adminFeedback = params.priorAdminFlag.adminFeedback;
          insertValues.adminReviewedBy = params.priorAdminFlag.adminReviewedBy;
          insertValues.adminReviewedAt = params.priorAdminFlag.adminReviewedAt;
        }

        const [verification] = await tx.insert(verificationResults).values(insertValues).returning();
        return verification.id;
      });
    }, "verify-result");
  }
}

export const verificationService = new VerificationService();
