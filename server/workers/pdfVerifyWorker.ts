import * as fs from "fs";
import * as path from "path";
import type { Job } from "bullmq";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { users, verificationResults } from "@shared/schema";
import { storage } from "../storage";
import { PDFAnalyzer } from "../services/pdfAnalyzer";
import { COSAuthenticityChecker } from "../services/cosAuthenticityChecker";
import { combineWithCosVerdict } from "../utils/cosVerdictCombiner";
import { withRetry } from "../utils/dbRetry";
import { emitToUser } from "../services/socketGateway";
import { logger } from "../utils/logger";

export interface PdfVerifyJobData {
  userId: string;
  filePath: string;
  originalname: string;
  documentHash: string;
  receiptId: string;
  ipAddress: string | null;
  useCredits: boolean;
  useDailyLimit: boolean;
}

function buildAdminOverrideAnalysis(status: 'fake' | 'approved', reason: string) {
  const isFake = status === 'fake';
  return {
    result: isFake ? 'fake' : 'genuine',
    confidence: 99,
    details: { summary: `This document was previously reviewed by an administrator and confirmed ${isFake ? 'fake' : 'genuine'}. ${reason}` },
    checks: [{ name: 'Admin Human Review Override', passed: !isFake, severity: isFake ? 'critical' : 'info', message: reason }],
  };
}

export async function processPdfVerifyJob(job: Job<PdfVerifyJobData>): Promise<{ verificationId: number; receiptId: string; result: string }> {
  const { userId, filePath, originalname, documentHash, receiptId, ipAddress, useCredits, useDailyLimit } = job.data;
  await job.updateProgress(5);
  let result: string = "genuine";
  let analysis: any = null;
  let metadata: any = null;
  let isAdminOverride = false;
  let adminOverrideStatus: string | null = null;
  let adminOverrideSource: any = null;

  try {
    const priorFlag = await storage.getAdminFlaggedVerificationByHash(documentHash);
    const priorApproval = priorFlag ? undefined : await storage.getAdminApprovedVerificationByHash(documentHash);

    if (priorFlag) {
      isAdminOverride = true;
      adminOverrideStatus = 'fake';
      adminOverrideSource = priorFlag;
      result = 'fake';
      analysis = buildAdminOverrideAnalysis('fake', priorFlag.adminFeedback || 'Flagged as fake by a human reviewer.');
      metadata = (priorFlag.metadata as any) || {};
    } else if (priorApproval) {
      isAdminOverride = true;
      adminOverrideStatus = 'approved';
      adminOverrideSource = priorApproval;
      result = 'genuine';
      analysis = buildAdminOverrideAnalysis('approved', priorApproval.adminFeedback || 'Confirmed genuine by a human reviewer.');
      metadata = (priorApproval.metadata as any) || {};
    } else {
      await job.updateProgress(10);
      const pdfAnalyzer = new PDFAnalyzer();
      const fileBuffer = await fs.promises.readFile(filePath);
      const pdfBinary = fileBuffer.toString('binary');
      await job.updateProgress(20);

      const [extractedMetadata, trustedPatterns] = await Promise.all([
        pdfAnalyzer.extractMetadata(filePath),
        storage.getTrustedPatterns(),
      ]);
      await job.updateProgress(60);
      const [activeRules, hitlFakes] = await Promise.all([
        storage.getActiveGlobalAiRules().catch(() => []),
        storage.getAdminFakeKnowledge(20).catch(() => []),
      ]);
      const adminContext = {
        globalRules: (activeRules as any[]).map((r: any) => ({ category: r.category, ruleText: r.ruleText, priority: r.priority })),
        hitlKnowledge: (hitlFakes as any[]).map((v: any) => ({ filename: v.filename, result: v.result, confidence: v.confidence, adminFeedback: v.adminFeedback, metadata: v.metadata })),
      };
      const [analysisResult, cosCheckResult] = await Promise.all([
        pdfAnalyzer.analyzeAgainstTrustedPatterns(extractedMetadata, trustedPatterns, adminContext),
        Promise.resolve(new COSAuthenticityChecker().check(pdfBinary, extractedMetadata)),
      ]);
      analysis = analysisResult;
      (analysis as any).cosCheck = cosCheckResult;
      const combined = combineWithCosVerdict(analysisResult.result, analysis.confidence as number, cosCheckResult.verdict);
      if (combined.result !== analysisResult.result) {
        logger.info(`[PDFWorker] cosCheck ${cosCheckResult.verdict} overrides '${analysisResult.result}' -> ${combined.result}`);
      }
      result = combined.result;
      analysis.result = combined.result;
      analysis.confidence = combined.confidence;
      metadata = {
        format: 'Pdf',
        mimeType: 'application/pdf',
        pdfVersion: extractedMetadata.pdfVersion || null,
        title: extractedMetadata.title || null,
        author: extractedMetadata.author || null,
        subject: extractedMetadata.subject || null,
        creator: extractedMetadata.creator || null,
        producer: extractedMetadata.producer || null,
        creationDate: extractedMetadata.creationDate || null,
        modificationDate: extractedMetadata.modificationDate || null,
        pageCount: extractedMetadata.pages || null,
        wordCount: extractedMetadata.wordCount || null,
        characterCount: extractedMetadata.characterCount || null,
        fontCount: extractedMetadata.fontCount || 0,
        fileSize: extractedMetadata.fileSize || null,
        isEncrypted: extractedMetadata.isEncrypted ?? false,
        hasDigitalSignature: extractedMetadata.hasDigitalSignature ?? false,
        xmp_tags: extractedMetadata.xmp_tags || {},
        fonts: extractedMetadata.fonts || [],
      };
    }

    await job.updateProgress(85);
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
        userId,
        filename: path.basename(originalname),
        result,
        confidence: Math.floor(analysis.confidence),
        metadata: isAdminOverride ? (adminOverrideSource!.metadata ?? {}) : metadata,
        analysisDetails: analysis,
        ipAddress: ipAddress,
        receiptId,
        documentHash,
      };
      if (isAdminOverride) {
        insertValues.adminStatus = adminOverrideStatus;
        insertValues.adminFeedback = adminOverrideSource!.adminFeedback;
        insertValues.adminReviewedBy = adminOverrideSource!.adminReviewedBy;
        insertValues.adminReviewedAt = adminOverrideSource!.adminReviewedAt;
      }
      const [verification] = await tx.insert(verificationResults).values(insertValues).returning();
      return verification.id;
    }), 'pdf-verify-worker');

    await job.updateProgress(100);
    const payload = { verificationId, receiptId, documentHash, result, confidence: analysis.confidence, isAdminOverride };
    try { emitToUser(userId, "VERIFICATION_COMPLETE", payload); } catch {}
    try { emitToUser(userId, "VERIFICATION_PROGRESS", { jobId: job.id, progress: 100, status: "completed", ...payload }); } catch {}
    return { verificationId, receiptId, result };
  } finally {
    await fs.promises.unlink(filePath).catch(() => {});
  }
}
