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
import { assertSafeUploadFilename, sanitizeUploadPath, UPLOADS_DIR } from "../utils/uploadGuard";

function sanitizeLog(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

function generateReceiptId(): string {
  const random1 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const random2 = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CBA-${random1}-${random2}`;
}

async function generateDocumentHash(filePath: string): Promise<string> {
  const fileBuffer = await fs.promises.readFile(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
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
  app.post('/api/verify', verifyLimiter, upload.single('file'), async (req: any, res) => {
    let safeFilePath: string | undefined;
    try {
      // Beta gate: CoS Check is invite-only
      if (!req.isAuthenticated()) {
        return res.status(403).json({
          message: 'CoS Check is currently in closed beta. Please log in and request access.',
          code: 'beta_login_required',
        });
      }

      const betaUserId = req.user.id;
      const betaUser = betaUserId ? await storage.getUser(betaUserId) : null;
      if (!betaUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Access gate: allow if any of the following is true
      const isAdminUser = betaUser.role === 'admin';
      const hasCosSubscription = betaUser.cosCheckSubscription === true;
      const hasPaidPlanWithCos = ['pro', 'unlimited', 'enterprise'].includes(betaUser.subscriptionStatus || '');
      const hasAdminApproval = betaUser.cosCheckApproved === true;

      if (!isAdminUser && !hasCosSubscription && !hasPaidPlanWithCos && !hasAdminApproval) {
        return res.status(403).json({
          message: 'Your account is pending COS Check access. Please contact support or upgrade your subscription.',
          code: 'cos_access_denied',
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      assertSafeUploadFilename(req.file.originalname);
      safeFilePath = sanitizeUploadPath(req.file.path);
      const safePath = path.join(UPLOADS_DIR, path.basename(safeFilePath));

      let userId: string | undefined = betaUserId;

      // Skip IP rate limit for exempt users (admin-approved or IP-exempt flag)
      if (!betaUser.ipExempt && !isAdminUser) {
        const clientIp = getClientIp(req);
        const hashedIp = hashIpAddress(clientIp);
        const ipRecord = await storage.getIpVerification(hashedIp);
        if (ipRecord) {
          const lastVerification = new Date(ipRecord.lastVerificationDate);
          const now = new Date();
          const daysSinceVerification = (now.getTime() - lastVerification.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceVerification < 1) {
            return res.status(429).json({
              message: 'You have already verified a document today. Upgrade or wait until tomorrow.',
              code: 'ip_rate_limited',
            });
          }
        }
        (req as any).hashedIp = hashedIp;
      }

      // Determine deduction strategy but don't deduct yet (defer until after analysis)
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
            // Check daily free limit before analysis (fast fail)
            const canVerify = await storage.checkDailyLimit(userId);
            if (!canVerify) {
              return res.status(429).json({
                message: 'Daily verification limit reached. Purchase credits or upgrade for unlimited verifications.',
                upgradeRequired: true,
                credits: 0
              });
            }
            useDailyLimit = true;
          }
        }
      }

      // Generate document hash for audit trail
      const documentHash = await generateDocumentHash(safePath);
      const receiptId = generateReceiptId();

      // ── Admin-override short-circuit ──────────────────────────────────────
      const priorAdminFlag = await storage.getAdminFlaggedVerificationByHash(documentHash);

      let result: string;
      let analysis: any;
      let metadata: any;
      let isAdminOverride = false;

      if (priorAdminFlag) {
        isAdminOverride = true;
        result = 'fake';
        const reason = priorAdminFlag.adminFeedback || 'Flagged as fake by a human reviewer.';
        analysis = {
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
        metadata = (priorAdminFlag.metadata as any) || {};
      } else {
        // Normal AI analysis path — load admin knowledge to feed into analysis
        const pdfAnalyzer = new PDFAnalyzer();

        // Read the file buffer once: used for the document hash AND passed to the
        // CoS checker so it can count startxref occurrences without a second disk read.
        const fileBuffer = await fs.promises.readFile(safePath);
        const pdfBinary = fileBuffer.toString('binary');

        const [extractedMetadata, trustedPatterns] = await Promise.all([
          pdfAnalyzer.extractMetadata(safePath),
          storage.getTrustedPatterns(),
        ]);

        // Load admin-accumulated knowledge in parallel (non-fatal if missing)
        const [activeRules, hitlFakes] = await Promise.all([
          storage.getActiveGlobalAiRules().catch(() => []),
          storage.getAdminFakeKnowledge(20).catch(() => []),
        ]);

        const adminContext = {
          globalRules: activeRules.map((r: any) => ({
            category: r.category,
            ruleText: r.ruleText,
            priority: r.priority,
          })),
          hitlKnowledge: hitlFakes.map((v: any) => ({
            filename: v.filename,
            result: v.result,
            confidence: v.confidence,
            adminFeedback: v.adminFeedback,
            metadata: v.metadata,
          })),
        };

        // Run AI analysis and CoS authenticity check truly in parallel.
        const [analysisResult, cosCheckResult] = await Promise.all([
          pdfAnalyzer.analyzeAgainstTrustedPatterns(extractedMetadata, trustedPatterns, adminContext),
          Promise.resolve(new COSAuthenticityChecker().check(pdfBinary, extractedMetadata)),
        ]);
        analysis = analysisResult;
        analysis.cosCheck = cosCheckResult;

        // The specialist COS authenticity checker (6 targeted checks) is authoritative.
        // If it clears the document as GENUINE, trust it over the general pattern analyser
        // which can false-positive on Apache FOP version string differences.
        if (cosCheckResult.verdict === 'GENUINE' && analysisResult.result !== 'genuine') {
          console.log(`[COS] cosCheck GENUINE overrides pattern analysis '${sanitizeLog(analysisResult.result)}' — treating as genuine`);
          result = 'genuine';
          analysis.result = 'genuine';
          analysis.confidence = Math.max(analysis.confidence as number, 85);
        } else {
          result = analysisResult.result;
        }
        metadata = {
          // File Format Info
          format: 'Pdf',
          mimeType: 'application/pdf',
          pdfVersion: extractedMetadata.pdfVersion || null,
          // PDF Properties
          title: extractedMetadata.title || null,
          author: extractedMetadata.author || null,
          subject: extractedMetadata.subject || null,
          creator: extractedMetadata.creator || null,
          producer: extractedMetadata.producer || null,
          creationDate: extractedMetadata.creationDate || null,
          modificationDate: extractedMetadata.modificationDate || null,
          // Document Statistics
          pageCount: extractedMetadata.pages || null,
          wordCount: extractedMetadata.wordCount || null,
          characterCount: extractedMetadata.characterCount || null,
          fontCount: extractedMetadata.fontCount || 0,
          fileSize: extractedMetadata.fileSize || null,
          // Security
          isEncrypted: extractedMetadata.isEncrypted ?? false,
          hasDigitalSignature: extractedMetadata.hasDigitalSignature ?? false,
          // XMP Tags
          xmp_tags: extractedMetadata.xmp_tags || {},
          // Fonts
          fonts: extractedMetadata.fonts || [],
        };
      }
      // ─────────────────────────────────────────────────────────────────────

      // Atomically deduct credit + store result (if one fails, both roll back)
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
          filename: req.file!.originalname,
          result,
          confidence: Math.floor(analysis.confidence),
          metadata: isAdminOverride ? (priorAdminFlag!.metadata ?? {}) : metadata,
          analysisDetails: analysis,
          ipAddress: req.ip,
          receiptId,
          documentHash,
        };
        // Carry forward admin override fields so this record is also marked
        if (isAdminOverride) {
          insertValues.adminStatus = 'fake';
          insertValues.adminFeedback = priorAdminFlag!.adminFeedback;
          insertValues.adminReviewedBy = priorAdminFlag!.adminReviewedBy;
          insertValues.adminReviewedAt = priorAdminFlag!.adminReviewedAt;
        }
        const [verification] = await tx.insert(verificationResults).values(insertValues).returning();
        return verification.id;
      }), 'verify-result');

      res.json({
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

    } catch (error: any) {
      console.error('Verification error:', error instanceof Error ? sanitizeLog(error.message) : 'Unknown error');
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      let safeMessage = 'Verification failed';
      if (statusCode === 400) {
        const errorText = typeof error?.message === 'string' ? error.message : '';
        if (errorText.includes('INVALID_UPLOAD_FILENAME')) {
          safeMessage = 'Invalid filename format';
        } else if (errorText.includes('INVALID_UPLOAD_PATH') || errorText.includes('PATH_TRAVERSAL_BLOCKED')) {
          safeMessage = 'Invalid upload path';
        } else {
          safeMessage = 'Invalid upload input';
        }
      }
      res.status(statusCode).json({ message: safeMessage });
    } finally {
      // Delete uploaded file immediately after processing (security measure)
      if (req.file && safeFilePath) {
        try {
          const fsModule = await import('fs');
          fsModule.promises.unlink(path.join(UPLOADS_DIR, path.basename(safeFilePath))).catch(() => {
            // Silently fail if file already deleted
          });
        } catch (err) {
          console.error('Error deleting uploaded file:', err);
        }
      }
    }
  });

  app.get('/api/receipt/:receiptId', async (req, res) => {
    try {
      const { receiptId } = req.params;
      const verification = await storage.getVerificationByReceiptId(receiptId);

      if (!verification) {
        return res.status(404).json({ message: 'Receipt not found' });
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

      res.json(receiptData);
    } catch (error) {
      console.error("Error fetching receipt:", error);
      res.status(500).json({ message: "Failed to fetch receipt" });
    }
  });

  app.get('/api/my-verifications', isAuthenticated, async (req: any, res) => {
    try {
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

      res.json(history);
    } catch (error) {
      console.error("Error fetching verification history:", error);
      res.status(500).json({ message: "Failed to fetch verification history" });
    }
  });
}
