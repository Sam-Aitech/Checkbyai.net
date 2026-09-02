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
import { PDFAnalyzer } from "../services/pdfAnalyzer";
import { COSAuthenticityChecker } from "../services/cosAuthenticityChecker";
import { getClientIp, hashIpAddress } from "../ipRateLimit";
import { sanitizeUploadPath, assertSafeUploadFilename, assertPdfMagicBytes } from "../utils/uploadGuard";
import { combineWithCosVerdict } from "../utils/cosVerdictCombiner";
import { success } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";
import { logger } from "../utils/logger";
import { isQueueAvailable, getPdfVerifyQueue } from "../services/jobQueue";

function buildAdminOverrideAnalysis(status: 'fake' | 'approved', reason: string) {
  const isFake = status === 'fake';
  return {
    result: isFake ? 'fake' : 'genuine',
    confidence: 99,
    details: {
      summary: `This document was previously reviewed by an administrator and confirmed ${isFake ? 'fake' : 'genuine'}. ${reason}`,
    },
    checks: [
      {
        name: 'Admin Human Review Override',
        passed: !isFake,
        severity: isFake ? 'critical' : 'info',
        message: isFake
          ? `A human administrator has reviewed this exact document and determined it is NOT genuine. Reason: ${reason}`
          : `A human administrator has reviewed this exact document and confirmed it IS genuine. ${reason}`,
      },
    ],
  };
}

function generateReceiptId(): string {
  const random1 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const random2 = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CBA-${random1}-${random2}`;
}

// Callers must pass an already-sanitized path (sanitizeUploadPath()) — this
// function itself does no validation.
async function generateDocumentHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath); // codeql[js/path-injection] - callers pass a path already validated by sanitizeUploadPath
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

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
  app.get('/api/verify/status/:jobId', isAuthenticated, asyncHandler(async (req: any, res) => {
    const { jobId } = req.params;
    if (!jobId) throw new ApiError(400, "jobId required");
    // jobId is `verify-${documentHash.slice(0,16)}-${userId}-${nonce}`, not a
    // receiptId (`CBA-XXXXXXXX-XXXXXXXX`) — the fallback lookups below (used
    // once BullMQ evicts the job record via removeOnComplete/removeOnFail)
    // must match on that format, not storage.getVerificationByReceiptId(),
    // which never matches a jobId and made a genuinely completed
    // verification permanently report "not_found" once its job aged out.
    // Greedy `.+` for userId (not `.+?`) so a userId containing its own
    // hyphens (e.g. a UUID) is captured whole — it backtracks only enough to
    // satisfy the required trailing `-<8 hex>` nonce.
    const jobIdMatch = /^verify-([0-9a-f]{16})-(.+)-[0-9a-f]{8}$/.exec(jobId);
    const lookupFallback = async () => {
      if (!jobIdMatch) return null;
      const [, hashPrefix, userId] = jobIdMatch;
      return storage.getVerificationByDocHashPrefixAndUser(hashPrefix, userId).catch(() => null);
    };
    const queue = getPdfVerifyQueue();
    if (!queue) {
      const v = await lookupFallback();
      if (v) success(res, { status: "completed", progress: 100, verificationId: v.id, receiptId: v.receiptId, result: v.result });
      else success(res, { status: "not_found" });
      return;
    }
    const job = await queue.getJob(jobId);
    if (!job) {
      const byHash = await lookupFallback();
      if (byHash) success(res, { status: "completed", progress: 100, verificationId: byHash.id, receiptId: byHash.receiptId, result: byHash.result });
      else success(res, { status: "not_found" });
      return;
    }
    const state = await job.getState();
    const progress = (job.progress as number) || 0;
    if (state === "completed") success(res, { status: "completed", progress: 100, jobId, returnvalue: job.returnvalue });
    else if (state === "failed") success(res, { status: "failed", progress, failedReason: job.failedReason });
    else if (state === "active") success(res, { status: "active", progress });
    else success(res, { status: state, progress });
  }));

  app.post('/api/verify', verifyLimiter, upload.single('file'), asyncHandler(async (req: any, res) => {
    if (!req.isAuthenticated()) {
      throw new ApiError(403, 'CoS Check is currently in closed beta. Please log in and request access.', 'beta_login_required');
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
      throw new ApiError(403, 'Your account is pending COS Check access. Please contact support or upgrade your subscription.', 'cos_access_denied');
    }

    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    const safeFilePath = sanitizeUploadPath(req.file.path);
    assertSafeUploadFilename(req.file.originalname);

    // The multer fileFilter only checks the client-supplied mimetype, which any
    // client can spoof. Read the file's actual magic bytes before doing anything
    // else with it.
    try {
      await assertPdfMagicBytes(safeFilePath); // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
    } catch (err) {
      await fs.promises.unlink(safeFilePath).catch(() => {}); // codeql[js/path-injection] - safeFilePath validated by sanitizeUploadPath
      throw new ApiError(400, "Uploaded file is not a valid PDF.");
    }

    // Always defined: the isAuthenticated() check above throws before this
    // point otherwise. Typed as `string` (not `string | undefined`) so
    // Queue<PdfVerifyJobData>.add() below — PdfVerifyJobData.userId is
    // required — actually enforces that at compile time instead of silently
    // accepting an unchecked possibly-undefined value.
    const userId: string = betaUserId;

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

    const documentHash = await generateDocumentHash(safeFilePath);
    const receiptId = generateReceiptId();

    const priorAdminFlag = await storage.getAdminFlaggedVerificationByHash(documentHash);
    const priorAdminApproval = priorAdminFlag ? undefined : await storage.getAdminApprovedVerificationByHash(documentHash);

    let result: string;
    let analysis: any;
    let metadata: any;
    let isAdminOverride = false;
    let adminOverrideStatus: 'fake' | 'approved' | null = null;
    let adminOverrideSource: typeof priorAdminFlag | typeof priorAdminApproval;
    let enqueueFailed = false;

    if (priorAdminFlag) {
      isAdminOverride = true;
      adminOverrideStatus = 'fake';
      adminOverrideSource = priorAdminFlag;
      result = 'fake';
      const reason = priorAdminFlag.adminFeedback || 'Flagged as fake by a human reviewer.';
      analysis = buildAdminOverrideAnalysis('fake', reason);
      metadata = (priorAdminFlag.metadata as any) || {};
    } else if (priorAdminApproval) {
      isAdminOverride = true;
      adminOverrideStatus = 'approved';
      adminOverrideSource = priorAdminApproval;
      result = 'genuine';
      const reason = priorAdminApproval.adminFeedback || 'Confirmed genuine by a human reviewer.';
      analysis = buildAdminOverrideAnalysis('approved', reason);
      metadata = (priorAdminApproval.metadata as any) || {};
    } else {
      const pdfQueue = getPdfVerifyQueue();
      const shouldQueue = isQueueAvailable() && !!pdfQueue && !isAdminOverride;
      if (shouldQueue) {
        // Nonce'd, not just `verify-${hash}-${userId}`: a deterministic id
        // meant a re-upload of the same document while a prior job for it
        // was still queued/active, or had failed and was kept around (up to
        // 7 days via removeOnFail), silently returned that stale job instead
        // of processing the new upload — and the new upload's temp file was
        // never referenced by any job, so it leaked.
        const jobId = `verify-${documentHash.slice(0, 16)}-${userId}-${crypto.randomBytes(4).toString('hex')}`;
        try {
          const job = await pdfQueue!.add('verify', {
            userId, filePath: safeFilePath, originalname: req.file!.originalname, documentHash, receiptId, ipAddress: req.ip ?? null, useCredits, useDailyLimit
          }, { jobId, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 86400, count: 5000 }, removeOnFail: { age: 604800, count: 5000 } });
          res.status(202);
          success(res, { jobId: job.id, receiptId, documentHash, status: 'accepted', mode: 'bullmq' });
          req.on('close', () => {
            if (!res.writableEnded) {
              pdfQueue!.getJob(job.id!).then(j => j?.remove().catch(()=>{})).catch(()=>{});
              fs.promises.unlink(safeFilePath).catch(()=>{}); // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
            }
          });
          return;
        } catch (e) {
          logger.warn({ err: e }, "[Verify] queue add failed, falling back to inline");
          // The gate below must know this specific enqueue attempt failed —
          // isQueueAvailable() only reflects Redis's boot-time reachability,
          // not whether *this* .add() call threw. Without this flag, a
          // transient enqueue failure (Redis otherwise healthy) fell through
          // to inline analysis, then skipped persistence entirely because
          // the gate saw Redis as available and assumed the job was queued —
          // the computed result and any credit/daily-limit deduction were
          // silently discarded, and the response claimed `queued: true` for
          // a job that was never actually queued.
          enqueueFailed = true;
        }
      }
      const pdfAnalyzer = new PDFAnalyzer();
      const pdfBinary = await fs.promises.readFile(safeFilePath).then(b => b.toString('binary')).catch(()=> ""); // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
      const [extractedMetadata, trustedPatterns] = await Promise.all([
        pdfAnalyzer.extractMetadata(safeFilePath),
        storage.getTrustedPatterns(),
      ]);
      const [activeRules, hitlFakes] = await Promise.all([
        storage.getActiveGlobalAiRules().catch(() => []),
        storage.getAdminFakeKnowledge(20).catch(() => []),
      ]);
      const adminContext = {
        globalRules: activeRules.map((r: any) => ({ category: r.category, ruleText: r.ruleText, priority: r.priority })),
        hitlKnowledge: hitlFakes.map((v: any) => ({ filename: v.filename, result: v.result, confidence: v.confidence, adminFeedback: v.adminFeedback, metadata: v.metadata })),
      };
      const [analysisResult, cosCheckResult] = await Promise.all([
        pdfAnalyzer.analyzeAgainstTrustedPatterns(extractedMetadata, trustedPatterns, adminContext),
        Promise.resolve(new COSAuthenticityChecker().check(pdfBinary, extractedMetadata)),
      ]);
      analysis = analysisResult;
      analysis.cosCheck = cosCheckResult;
      const combined = combineWithCosVerdict(analysisResult.result, analysis.confidence as number, cosCheckResult.verdict);
      if (combined.result !== analysisResult.result) logger.info(`[COS] cosCheck ${cosCheckResult.verdict} overrides pattern analysis '${analysisResult.result}' — treating as ${combined.result}`);
      result = combined.result;
      analysis.result = combined.result;
      analysis.confidence = combined.confidence;
      metadata = {
        format: 'Pdf', mimeType: 'application/pdf', pdfVersion: extractedMetadata.pdfVersion || null, title: extractedMetadata.title || null,
        author: extractedMetadata.author || null, subject: extractedMetadata.subject || null, creator: extractedMetadata.creator || null,
        producer: extractedMetadata.producer || null, creationDate: extractedMetadata.creationDate || null, modificationDate: extractedMetadata.modificationDate || null,
        pageCount: extractedMetadata.pages || null, wordCount: extractedMetadata.wordCount || null, characterCount: extractedMetadata.characterCount || null,
        fontCount: extractedMetadata.fontCount || 0, fileSize: extractedMetadata.fileSize || null, isEncrypted: extractedMetadata.isEncrypted ?? false,
        hasDigitalSignature: extractedMetadata.hasDigitalSignature ?? false, xmp_tags: extractedMetadata.xmp_tags || {}, fonts: extractedMetadata.fonts || [],
      };
    }

    if (isAdminOverride || enqueueFailed || !isQueueAvailable() || !getPdfVerifyQueue()) {
      const verificationId = await withRetry(() => db.transaction(async (tx) => {
        if (useCredits && userId) {
          await tx.update(users).set({ credits: sql`GREATEST(COALESCE(${users.credits}, 0) - 1, 0)`, updatedAt: new Date() }).where(eq(users.id, userId));
        } else if (useDailyLimit && userId) {
          const today = new Date().toISOString().split('T')[0];
          const [currentUser] = await tx.select({ dailyVerificationsUsed: users.dailyVerificationsUsed, lastVerificationDate: users.lastVerificationDate }).from(users).where(eq(users.id, userId));
          const usageToday = currentUser?.lastVerificationDate === today ? (currentUser.dailyVerificationsUsed || 0) + 1 : 1;
          await tx.update(users).set({ dailyVerificationsUsed: usageToday, lastVerificationDate: today, updatedAt: new Date() }).where(eq(users.id, userId));
        }
        const insertValues: any = {
          userId, filename: path.basename(req.file!.originalname), result, confidence: Math.floor(analysis.confidence),
          metadata: isAdminOverride ? (adminOverrideSource!.metadata ?? {}) : metadata, analysisDetails: analysis, ipAddress: req.ip, receiptId, documentHash,
        };
        if (isAdminOverride) {
          insertValues.adminStatus = adminOverrideStatus;
          insertValues.adminFeedback = adminOverrideSource!.adminFeedback;
          insertValues.adminReviewedBy = adminOverrideSource!.adminReviewedBy;
          insertValues.adminReviewedAt = adminOverrideSource!.adminReviewedAt;
        }
        const [verification] = await tx.insert(verificationResults).values(insertValues).returning();
        return verification.id;
      }), 'verify-result');
      success(res, {
        id: verificationId, receiptId, documentHash, result, confidence: analysis.confidence, details: analysis.details,
        checks: analysis.checks || [], forensicAnalysis: analysis.details?.forensicAnalysis || null, adminOverride: isAdminOverride,
        metadata: isAdminOverride ? {} : metadata, cosCheck: analysis.cosCheck ?? null, timestamp: new Date().toISOString()
      });
      try { await fs.promises.unlink(safeFilePath); } catch {} // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
      return;
    }
    // isAdminOverride is always false here — the branch above returns whenever it's true.
    success(res, { receiptId, documentHash, result, confidence: analysis.confidence, details: analysis.details, checks: analysis.checks || [], forensicAnalysis: analysis.details?.forensicAnalysis || null, adminOverride: false, metadata, cosCheck: analysis.cosCheck ?? null, timestamp: new Date().toISOString(), queued: true });
    try { await fs.promises.unlink(safeFilePath); } catch {} // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
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
