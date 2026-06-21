import type { Express } from "express";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { withRetry } from "../utils/dbRetry";
import { users, verificationResults } from "@shared/schema";
import { isAuthenticated } from "../auth";
import { verifyLimiter } from "../middleware/rateLimiter";
import { analyzeCosDocument } from "../services/cosAnalysisCore";
import { getClientIp, hashIpAddress } from "../ipRateLimit";
import { sanitizeUploadPath, assertSafeUploadFilename } from "../utils/uploadGuard";
import { success } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";

// Configure multer for file uploads with security limits
export const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

export function registerVerificationRoutes(app: Express): void {
  app.post('/api/verify', verifyLimiter, upload.single('file'), asyncHandler(async (req: any, res) => {
    if (!req.isAuthenticated()) {
      throw new ApiError(403, 'CoS Check is currently in closed beta. Please log in and request access.');
    }

    const betaUserId = req.user.id;
    const betaUser = betaUserId ? await storage.getUser(betaUserId) : null;
    if (!betaUser) {
      throw new ApiError(404, 'User not found');
    }

    const isAdminUser = betaUser.role === 'admin';
    const hasCosSubscription = betaUser.cosCheckSubscription === true;
    const hasPaidPlanWithCos = ['pro', 'unlimited', 'enterprise'].includes(betaUser.subscriptionStatus || '');
    const hasAdminApproval = betaUser.cosCheckApproved === true;

    if (!isAdminUser && !hasCosSubscription && !hasPaidPlanWithCos && !hasAdminApproval) {
      throw new ApiError(403, 'Your account is pending COS Check access. Please contact support or upgrade your subscription.');
    }

    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    const safeFilePath = sanitizeUploadPath(req.file.path);
    assertSafeUploadFilename(req.file.originalname);

    let userId: string | undefined = betaUserId;

    if (!betaUser.ipExempt && !isAdminUser) {
      const clientIp = getClientIp(req);
      const hashedIp = hashIpAddress(clientIp);
      const ipRecord = await storage.getIpVerification(hashedIp);
      if (ipRecord) {
        const lastVerification = new Date(ipRecord.lastVerificationDate);
        const now = new Date();
        const daysSinceVerification = (now.getTime() - lastVerification.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceVerification < 1) {
          // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
          await fs.promises.unlink(safeFilePath).catch(() => {});
          throw new ApiError(429, 'You have already verified a document today. Upgrade or wait until tomorrow.');
        }
      }
      (req as any).hashedIp = hashedIp;
    }

    let useCredits = false;
    let useDailyLimit = false;

    if (userId) {
      const user = betaUser;
      const hasUnlimited = isAdminUser || hasCosSubscription || user.subscriptionStatus === 'unlimited' || user.subscriptionStatus === 'enterprise' || user.verificationLimit === -1;

      if (!hasUnlimited) {
        const credits = user.credits || 0;
        if (credits > 0) {
          useCredits = true;
        } else {
          const canVerify = await storage.checkDailyLimit(userId);
          if (!canVerify) {
            // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
            await fs.promises.unlink(safeFilePath).catch(() => {});
            throw new ApiError(429, 'Daily verification limit reached. Purchase credits or upgrade for unlimited verifications.');
          }
          useDailyLimit = true;
        }
      }
    }

    const { result, analysis, metadata, documentHash, receiptId, isAdminOverride, priorAdminFlag } =
      await analyzeCosDocument(safeFilePath);

    const verificationId = await withRetry(() => db.transaction(async (tx) => {
      if (useCredits && userId) {
        await tx.update(users).set({
          credits: sql`GREATEST(COALESCE(${users.credits}, 0) - 1, 0)`,
          updatedAt: new Date(),
        }).where(eq(users.id, userId));
      } else if (useDailyLimit && userId) {
        const today = new Date().toISOString().split('T')[0];
        const [currentUser] = await tx.select({
          dailyVerificationsUsed: users.dailyVerificationsUsed,
          lastVerificationDate: users.lastVerificationDate,
        }).from(users).where(eq(users.id, userId));
        const usageToday = currentUser?.lastVerificationDate === today
          ? (currentUser.dailyVerificationsUsed || 0) + 1 : 1;
        await tx.update(users).set({
          dailyVerificationsUsed: usageToday,
          lastVerificationDate: today,
          updatedAt: new Date(),
        }).where(eq(users.id, userId));
      }
      const insertValues: any = {
        userId,
        filename: path.basename(req.file!.originalname),
        result,
        confidence: Math.floor(analysis.confidence),
        metadata: isAdminOverride ? (priorAdminFlag!.metadata ?? {}) : metadata,
        analysisDetails: analysis,
        ipAddress: req.ip,
        receiptId,
        documentHash,
      };
      if (isAdminOverride) {
        insertValues.adminStatus = 'fake';
        insertValues.adminFeedback = priorAdminFlag!.adminFeedback;
        insertValues.adminReviewedBy = priorAdminFlag!.adminReviewedBy;
        insertValues.adminReviewedAt = priorAdminFlag!.adminReviewedAt;
      }
      const [verification] = await tx.insert(verificationResults).values(insertValues).returning();
      return verification.id;
    }), 'verify-result');

    success(res, {
      id: verificationId,
      receiptId,
      documentHash,
      result,
      confidence: analysis.confidence,
      details: analysis.details,
      checks: analysis.checks || [],
      forensicAnalysis: analysis.details?.forensicAnalysis || null,
      adminOverride: isAdminOverride,
      metadata: isAdminOverride ? {} : metadata,
      cosCheck: analysis.cosCheck ?? null,
      timestamp: new Date().toISOString()
    });

    try {
      // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
      await fs.promises.unlink(safeFilePath);
    } catch (err) {
      // Silently fail if file already deleted
    }
  }));

  app.get('/api/receipt/:receiptId', asyncHandler(async (req, res) => {
    const { receiptId } = req.params;
    const verification = await storage.getVerificationByReceiptId(receiptId);

    if (!verification) {
      throw new ApiError(404, 'Receipt not found');
    }

    const receiptData = {
      receiptId: verification.receiptId,
      documentHash: verification.documentHash,
      result: verification.result,
      confidence: verification.confidence,
      verifiedAt: verification.verifiedAt,
      checksPerformed: (verification.analysisDetails as any)?.checks?.length || 0,
      integrityHash: crypto.createHash('sha256')
        .update(`${verification.receiptId}:${verification.documentHash}:${verification.result}:${verification.confidence}:${verification.verifiedAt}`)
        .digest('hex')
    };

    success(res, receiptData);
  }));

  app.get('/api/my-verifications', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const verifications = await storage.getVerificationsByUserId(userId);

    const history = verifications.map(v => ({
      id: v.id,
      receiptId: v.receiptId,
      documentHash: v.documentHash,
      filename: v.filename,
      result: v.result,
      confidence: v.confidence,
      verifiedAt: v.verifiedAt,
      adminStatus: v.adminStatus,
      checks: (v.analysisDetails as any)?.checks || [],
    }));

    success(res, history);
  }));
}
