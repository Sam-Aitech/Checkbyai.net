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
import { getClientIp, hashIpAddress } from "../ipRateLimit";
import { sanitizeUploadPath, assertSafeUploadFilename } from "../utils/uploadGuard";
import { success } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";
import { logger } from "../utils/logger";
import { runVerificationAnalysis } from "../services/verificationAnalysis";
import { isQueueAvailable, getVerificationQueue, VERIFICATION_JOB } from "../services/jobQueue";
import { getDocumentStore, buildDocumentKey } from "../services/documentStore";
import { getRedis } from "../utils/redisClient";
import { UPLOADS_DIR } from "../utils/uploadGuard";

function generateReceiptId(): string {
  const random1 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const random2 = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CBA-${random1}-${random2}`;
}

async function generateDocumentHash(filePath: string): Promise<string> {
  const fileBuffer = await fs.promises.readFile(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

export const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024,
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

async function persistVerification(input: {
  userId: string | undefined;
  originalName: string;
  result: string;
  analysis: any;
  metadata: any;
  ipAddress: string;
  receiptId: string;
  documentHash: string;
  useCredits: boolean;
  useDailyLimit: boolean;
  adminOverride?: { metadata: any; adminFeedback: any; adminReviewedBy: any; adminReviewedAt: any };
}): Promise<number> {
  return withRetry(() => db.transaction(async (tx) => {
    if (input.useCredits && input.userId) {
      await tx.update(users).set({
        credits: sql`GREATEST(COALESCE(${users.credits}, 0) - 1, 0)`,
        updatedAt: new Date(),
      }).where(eq(users.id, input.userId));
    } else if (input.useDailyLimit && input.userId) {
      const today = new Date().toISOString().split('T')[0];
      const [currentUser] = await tx.select({
        dailyVerificationsUsed: users.dailyVerificationsUsed,
        lastVerificationDate: users.lastVerificationDate,
      }).from(users).where(eq(users.id, input.userId));
      const usageToday = currentUser?.lastVerificationDate === today
        ? (currentUser.dailyVerificationsUsed || 0) + 1 : 1;
      await tx.update(users).set({
        dailyVerificationsUsed: usageToday,
        lastVerificationDate: today,
        updatedAt: new Date(),
      }).where(eq(users.id, input.userId));
    }
    const insertValues: any = {
      userId: input.userId,
      filename: path.basename(input.originalName),
      result: input.result,
      confidence: Math.floor(input.analysis.confidence),
      metadata: input.adminOverride ? (input.adminOverride.metadata ?? {}) : input.metadata,
      analysisDetails: input.analysis,
      ipAddress: input.ipAddress,
      receiptId: input.receiptId,
      documentHash: input.documentHash,
    };
    if (input.adminOverride) {
      insertValues.adminStatus = 'fake';
      insertValues.adminFeedback = input.adminOverride.adminFeedback;
      insertValues.adminReviewedBy = input.adminOverride.adminReviewedBy;
      insertValues.adminReviewedAt = input.adminOverride.adminReviewedAt;
    }
    const [verification] = await tx.insert(verificationResults).values(insertValues).returning();
    return verification.id;
  }), 'verify-result');
}

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

    const userId: string | undefined = betaUserId;

    if (!betaUser.ipExempt && !isAdminUser) {
      const clientIp = getClientIp(req);
      const hashedIp = hashIpAddress(clientIp);
      const ipRecord = await storage.getIpVerification(hashedIp);
      if (ipRecord) {
        const lastVerification = new Date(ipRecord.lastVerificationDate);
        const now = new Date();
        const daysSinceVerification = (now.getTime() - lastVerification.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceVerification < 1) {
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
            await fs.promises.unlink(safeFilePath).catch(() => {});
            throw new ApiError(429, 'Daily verification limit reached. Purchase credits or upgrade for unlimited verifications.');
          }
          useDailyLimit = true;
        }
      }
    }

    const documentHash = await generateDocumentHash(safeFilePath);
    const receiptId = generateReceiptId();
    const documentKey = buildDocumentKey(receiptId, documentHash);
    await getDocumentStore().put(documentKey, await fs.promises.readFile(safeFilePath));
    await fs.promises.unlink(safeFilePath).catch(() => {});

    const priorAdminFlag = await storage.getAdminFlaggedVerificationByHash(documentHash);

    if (priorAdminFlag) {
      const reason = priorAdminFlag.adminFeedback || 'Flagged as fake by a human reviewer.';
      const analysis = {
        result: 'fake',
        confidence: 99,
        details: {
          summary: `This document was previously reviewed by an administrator and confirmed fake. ${reason}`,
        },
        checks: [
          {
            name: 'Admin Human Review Override',
            passed: false,
            severity: 'critical',
            message: `A human administrator has reviewed this exact document and determined it is NOT genuine. Reason: ${reason}`,
          },
        ],
      };
      const verificationId = await persistVerification({
        userId,
        originalName: req.file.originalname,
        result: 'fake',
        analysis,
        metadata: {},
        ipAddress: req.ip,
        receiptId,
        documentHash,
        useCredits,
        useDailyLimit,
        adminOverride: {
          metadata: priorAdminFlag.metadata,
          adminFeedback: priorAdminFlag.adminFeedback,
          adminReviewedBy: priorAdminFlag.adminReviewedBy,
          adminReviewedAt: priorAdminFlag.adminReviewedAt,
        },
      });
      await fs.promises.unlink(safeFilePath).catch(() => {});
      await getDocumentStore().delete(documentKey).catch(() => {});
      success(res, {
        id: verificationId,
        receiptId,
        documentHash,
        result: 'fake',
        confidence: 99,
        details: analysis.details,
        checks: analysis.checks || [],
        forensicAnalysis: null,
        adminOverride: true,
        metadata: {},
        cosCheck: null,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const syncRequested = req.query.sync === '1' || req.query.sync === 'true';
    const syncAllowed = (process.env.ALLOW_SYNC_VERIFY || '').toLowerCase() === 'true';
    if (syncRequested && !syncAllowed) {
      await getDocumentStore().delete(documentKey).catch(() => {});
      throw new ApiError(400, 'Synchronous verification is disabled; submit the document normally to queue it.');
    }
    const queue = getVerificationQueue();

    if (isQueueAvailable() && queue) {
      const job = await queue.add(VERIFICATION_JOB, {
        documentKey,
        userId,
        receiptId,
        documentHash,
        originalName: req.file.originalname,
        ipAddress: req.ip,
        useCredits,
        useDailyLimit,
      }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      logger.info(`[Verify] Enqueued job ${job.id} for receipt ${receiptId}`);
      const redis = getRedis();
      if (redis && job.id) {
        await redis.set(
          `verify:job:${job.id}`,
          JSON.stringify({ receiptId, userId, documentHash }),
          'EX', 24 * 60 * 60,
        ).catch(() => {});
      }
      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          receiptId,
          documentHash,
          statusUrl: `/api/verify/job/${job.id}`,
        },
      });
      return;
    }

    if (!syncRequested || !syncAllowed) {
      await getDocumentStore().delete(documentKey).catch(() => {});
      logger.warn('[Verify] Queue unavailable — rejecting instead of consuming web-server CPU');
      res.set('Retry-After', '30');
      throw new ApiError(503, 'Verification queue unavailable — please retry shortly.');
    }
    const inlineTmp = path.join(UPLOADS_DIR, `inline-${receiptId}.pdf`);
    await fs.promises.writeFile(inlineTmp, await getDocumentStore().get(documentKey));
    try {
      const { result, analysis, metadata } = await runVerificationAnalysis(inlineTmp);
      const verificationId = await persistVerification({
        userId,
        originalName: req.file.originalname,
        result,
        analysis,
        metadata,
        ipAddress: req.ip,
        receiptId,
        documentHash,
        useCredits,
        useDailyLimit,
      });

      success(res, {
        id: verificationId,
        receiptId,
        documentHash,
        result,
        confidence: analysis.confidence,
        details: analysis.details,
        checks: analysis.checks || [],
        forensicAnalysis: analysis.details?.forensicAnalysis || null,
        adminOverride: false,
        metadata,
        cosCheck: analysis.cosCheck ?? null,
        timestamp: new Date().toISOString()
      });
    } finally {
      await fs.promises.unlink(inlineTmp).catch(() => {});
      await getDocumentStore().delete(documentKey).catch(() => {});
    }
  }));

  app.get('/api/verify/job/:jobId', isAuthenticated, asyncHandler(async (req: any, res) => {
    const queue = getVerificationQueue();
    if (!queue) {
      throw new ApiError(503, 'Verification queue unavailable');
    }
    const job = await queue.getJob(req.params.jobId);
    if (!job) {
      const redis = getRedis();
      if (redis) {
        const tombstone = await redis.get(`verify:job:${req.params.jobId}`).catch(() => null);
        if (tombstone) {
          const { receiptId, documentHash } = JSON.parse(tombstone) as { receiptId: string; documentHash: string };
          success(res, {
            status: 'evicted',
            receiptId,
            documentHash,
            receiptUrl: `/api/receipt/${receiptId}`,
          });
          return;
        }
      }
      throw new ApiError(404, 'Verification job not found');
    }
    const state = await job.getState();
    const progress = job.progress ?? 0;
    if (state === 'completed') {
      success(res, { status: 'completed', progress: 100, result: job.returnvalue });
      return;
    }
    if (state === 'failed') {
      success(res, { status: 'failed', progress, error: job.failedReason || 'Verification failed' });
      return;
    }
    success(res, { status: state, progress: typeof progress === 'number' ? progress : 0 });
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
