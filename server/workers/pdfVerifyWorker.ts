import * as fs from "node:fs";
import * as path from "node:path";
import * as tmp from "tmp";
import type { Job } from "bullmq";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { users, verificationResults, type TrustedPattern } from "@shared/schema";
import { storage } from "../storage";
import { PDFAnalyzer } from "../services/pdfAnalyzer";
import { COSAuthenticityChecker } from "../services/cosAuthenticityChecker";
import { combineWithCosVerdict } from "../utils/cosVerdictCombiner";
import { resolveVerificationWithTrust } from "../utils/trustedReference";
import {
  buildForensicEvidence,
  emptyStructuralFeatures,
  toEvidenceVerdict,
} from "../services/forensicTypes";
import { withRetry } from "../utils/dbRetry";
import { emitToUser } from "../services/socketGateway";
import { logger } from "../utils/logger";
import { fetchPdfUpload, deletePdfUpload } from "../utils/pdfUploadStore";

export interface PdfVerifyJobData {
  userId: string;
  uploadId: string;
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
  const { userId, uploadId, originalname, documentHash, receiptId, ipAddress, useCredits, useDailyLimit } = job.data;
  await job.updateProgress(5);

  // A stalled/redelivered BullMQ job (e.g. the worker's Redis lock expired
  // mid-run and another worker picked the job back up) can re-run this
  // processor after a prior attempt already committed successfully.
  // receiptId is unique in verification_results, so a blind re-run would hit
  // a constraint violation on the insert below and the job would end up
  // permanently "failed" despite having actually succeeded once already.
  // Short-circuit instead: if the result already exists, this attempt is a
  // no-op duplicate.
  const existing = await storage.getVerificationByReceiptId(receiptId);
  if (existing) {
    await deletePdfUpload(uploadId);
    await job.updateProgress(100);
    return { verificationId: existing.id, receiptId, result: existing.result };
  }

  const maxAttempts = job.opts.attempts ?? 1;
  const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
  // tmp.fileSync() (rather than a hand-built os.tmpdir() path) creates the
  // file atomically with the O_EXCL flag and restrictive 0600 permissions in
  // one syscall, closing both the symlink-race and other-users-can-read
  // classes of "insecure temporary file" — a manually constructed path can't
  // guarantee either regardless of how random the filename is.
  const scratchFile = tmp.fileSync({ postfix: '.pdf' });
  const scratchPath = scratchFile.name;

  let result: string = "genuine";
  let analysis: any = null;
  let metadata: any = null;
  let isAdminOverride = false;
  let adminOverrideStatus: string | null = null;
  let adminOverrideSource: any = null;

  try {
    const upload = await fetchPdfUpload(uploadId);
    if (!upload) {
      throw new Error(`PDF upload ${uploadId} not found — already consumed or expired`);
    }
    await fs.promises.writeFile(scratchPath, upload.fileBytes);

    const priorFlag = await storage.getAdminFlaggedVerificationByHash(documentHash);
    const priorApproval = priorFlag ? undefined : await storage.getAdminApprovedVerificationByHash(documentHash);

    if (priorFlag) {
      isAdminOverride = true;
      adminOverrideStatus = 'fake';
      adminOverrideSource = priorFlag;
      result = 'fake';
      analysis = buildAdminOverrideAnalysis('fake', priorFlag.adminFeedback || 'Flagged as fake by a human reviewer.');
      metadata = (priorFlag.metadata as any) || {};
      (analysis as any).forensicEvidence = buildForensicEvidence({
        documentHash,
        extractedFeatures: {},
        structuralFeatures: emptyStructuralFeatures(),
        forensicChecks: (Array.isArray((analysis as any).checks) ? (analysis as any).checks : []).map((c: any) => ({
          checkId: `override:${c.name ?? 'admin-review'}`,
          passed: !!c.passed,
          detail: c.message,
        })),
        provenance: {
          uploadMethod: 'bullmq-worker',
          filenameSanitized: path.basename(originalname),
          magicVerified: true,
          processingTimestamp: new Date().toISOString(),
        },
        finalVerdict: 'FAKE',
        finalConfidence: 99,
      });
    } else if (priorApproval) {
      isAdminOverride = true;
      adminOverrideStatus = 'approved';
      adminOverrideSource = priorApproval;
      result = 'genuine';
      analysis = buildAdminOverrideAnalysis('approved', priorApproval.adminFeedback || 'Confirmed genuine by a human reviewer.');
      metadata = (priorApproval.metadata as any) || {};
      (analysis as any).forensicEvidence = buildForensicEvidence({
        documentHash,
        extractedFeatures: {},
        structuralFeatures: emptyStructuralFeatures(),
        forensicChecks: (Array.isArray((analysis as any).checks) ? (analysis as any).checks : []).map((c: any) => ({
          checkId: `override:${c.name ?? 'admin-review'}`,
          passed: !!c.passed,
          detail: c.message,
        })),
        provenance: {
          uploadMethod: 'bullmq-worker',
          filenameSanitized: path.basename(originalname),
          magicVerified: true,
          processingTimestamp: new Date().toISOString(),
        },
        finalVerdict: 'GENUINE',
        finalConfidence: 99,
      });
    } else {
      await job.updateProgress(10);
      const pdfAnalyzer = new PDFAnalyzer();
      const pdfBinary = upload.fileBytes.toString('binary');
      await job.updateProgress(20);

      const [extractedMetadata, trustedPatterns] = await Promise.all([
        pdfAnalyzer.extractMetadata(scratchPath),
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
      // The 17-gate runs FIRST (synchronous): its failed check IDs feed
      // check-ID signal matching inside pattern analysis below.
      const cosCheckResult = new COSAuthenticityChecker().check(pdfBinary, extractedMetadata);
      const analysisResult = await pdfAnalyzer.analyzeAgainstTrustedPatterns(extractedMetadata, trustedPatterns, {
        ...adminContext,
        currentFailedCheckIds: cosCheckResult.checks
          .filter((c) => !c.passed)
          .map((c) => c.checkId ?? c.name),
      });
      analysis = analysisResult;
      (analysis as any).cosCheck = cosCheckResult;
      const outcome = resolveVerificationWithTrust(
        {
          patternResult: analysisResult.result,
          patternConfidence: analysis.confidence as number,
          patternChecks: Array.isArray(analysis.checks) ? analysis.checks : [],
          cosVerdict: cosCheckResult.verdict,
          cosReason: cosCheckResult.reason,
          cosChecks: Array.isArray(cosCheckResult.checks) ? cosCheckResult.checks : [],
          trustedPatterns: trustedPatterns as TrustedPattern[],
          documentHash,
        },
        combineWithCosVerdict,
      );
      if (outcome.result !== analysisResult.result) {
        logger.info(`[PDFWorker] cosCheck ${cosCheckResult.verdict} overrides '${analysisResult.result}' -> ${outcome.result}`);
      }
      if (outcome.trustedReference.matched && outcome.trustedReference.status === 'conflict') {
        logger.info(`[PDFWorker] TRUSTED_REFERENCE_CONFLICT pattern ${outcome.trustedReference.patternId}: hash matches but current six-check FAILS (${(outcome.trustedReference.conflictChecks || []).join(', ')}) -> ${outcome.result} for human review`);
      }
      result = outcome.result;
      analysis.result = outcome.result;
      analysis.confidence = outcome.confidence;
      analysis.checks = outcome.checks;
      (analysis as any).trustedReference = outcome.trustedReference;
      // Immutable internal evidence bundle — verdict logic above untouched.
      try {
        const structuralFeatures = pdfAnalyzer.extractStructuralFeatures(pdfBinary);
        const parsedXmp = (extractedMetadata as any).parsedXmp ?? {};
        const requiredXmp = ['dc:date', 'dc:format', 'dc:language', 'pdf:PDFVersion', 'pdf:Producer', 'xmp:CreateDate', 'xmp:CreatorTool', 'xmp:MetadataDate'];
        const xmpPresence: Record<string, boolean> = {};
        for (const f of requiredXmp) xmpPresence[f] = !!parsedXmp[f];
        (analysis as any).forensicEvidence = buildForensicEvidence({
          documentHash,
          extractedFeatures: {
            producer: (extractedMetadata as any).producer ?? null,
            creator: (extractedMetadata as any).creator ?? null,
            pdfVersion: (extractedMetadata as any).pdfVersion ?? null,
            creationDate: (extractedMetadata as any).creationDate ?? null,
            modificationDate: (extractedMetadata as any).modificationDate ?? null,
            pages: (extractedMetadata as any).pages ?? null,
            fontCount: (extractedMetadata as any).fontCount ?? 0,
            wordCount: (extractedMetadata as any).wordCount ?? null,
            characterCount: (extractedMetadata as any).characterCount ?? null,
            isEncrypted: (extractedMetadata as any).isEncrypted ?? false,
            hasDigitalSignature: (extractedMetadata as any).hasDigitalSignature ?? false,
            xmpPresence,
            hasRealXmp: !!(extractedMetadata as any).rawXmpData,
          },
          structuralFeatures,
          forensicChecks: [
            ...(Array.isArray(outcome.checks) ? outcome.checks : []).map((c: any) => ({
              checkId: `pattern:${c.name ?? 'unknown'}`,
              passed: !!c.passed,
              detail: c.message,
            })),
            ...(Array.isArray(cosCheckResult.checks) ? cosCheckResult.checks : []).map((c: any) => ({
              checkId: `cos:${c.name ?? 'unknown'}`,
              passed: !!c.passed,
              detail: c.detail,
            })),
          ],
          provenance: {
            uploadMethod: 'bullmq-worker',
            filenameSanitized: path.basename(originalname),
            magicVerified: true,
            processingTimestamp: new Date().toISOString(),
          },
          finalVerdict: toEvidenceVerdict(outcome.result),
          finalConfidence: outcome.confidence,
          abstentionReason:
            outcome.result === 'suspicious'
              ? (cosCheckResult.reason ?? 'Conflicting or unverifiable signals — human review recommended.')
              : null,
        });
      } catch (e) {
        logger.warn({ err: e }, '[PDFWorker] forensic evidence bundle build failed (non-fatal)');
      }
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
    // Success: the durable upload row is no longer needed by anyone.
    await deletePdfUpload(uploadId);
    return { verificationId, receiptId, result };
  } catch (err) {
    // Only delete the durable upload row on the job's last allowed attempt —
    // an earlier attempt's failure may be transient, and a retry (possibly
    // picked up by a different worker instance) still needs to fetch these
    // bytes. See PdfVerifyJobData/pdfUploadStore.ts for the durable-handoff
    // rationale.
    if (isLastAttempt) {
      await deletePdfUpload(uploadId);
    }
    throw err;
  } finally {
    // The scratch file is disposable and re-creatable from the durable row
    // on any retry, so it's always safe to clean up after every attempt.
    // removeCallback() also closes the fd tmp.fileSync() opened.
    try { scratchFile.removeCallback(); } catch { /* already gone */ }
  }
}
