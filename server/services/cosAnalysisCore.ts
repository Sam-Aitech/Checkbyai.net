/**
 * Core CoS document analysis pipeline, shared by:
 *   - POST /api/verify          (authenticated, credit/limit gated)
 *   - POST /api/verify/single   (anonymous, paid Stripe session gated)
 *
 * Extracted from routes/verification.ts so both routes run the identical
 * forensic pipeline: admin-flag override → PDF metadata extraction →
 * trusted-pattern analysis + authenticity checker → verdict reconciliation.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import { storage } from "../storage";
import { PDFAnalyzer } from "./pdfAnalyzer";
import { COSAuthenticityChecker } from "./cosAuthenticityChecker";
import { logger } from "../utils/logger";

export interface CosAnalysisOutcome {
  result: string;
  analysis: any;
  metadata: any;
  documentHash: string;
  receiptId: string;
  isAdminOverride: boolean;
  priorAdminFlag: any | null;
}

export function generateReceiptId(): string {
  const random1 = crypto.randomBytes(4).toString("hex").toUpperCase();
  const random2 = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CBA-${random1}-${random2}`;
}

async function generateDocumentHash(filePath: string): Promise<string> {
  // codeql[js/path-injection] - filePath is validated by sanitizeUploadPath before being passed here
  const fileBuffer = await fs.promises.readFile(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

/**
 * Runs the full forensic analysis on an already-sanitised upload path.
 * Does NOT touch credits, limits, or the DB verification_results table —
 * callers own persistence and fulfilment.
 */
export async function analyzeCosDocument(safeFilePath: string): Promise<CosAnalysisOutcome> {
  const documentHash = await generateDocumentHash(safeFilePath);
  const receiptId = generateReceiptId();

  const priorAdminFlag = await storage.getAdminFlaggedVerificationByHash(documentHash);

  let result: string;
  let analysis: any;
  let metadata: any;
  let isAdminOverride = false;

  if (priorAdminFlag) {
    isAdminOverride = true;
    result = "fake";
    const reason = priorAdminFlag.adminFeedback || "Flagged as fake by a human reviewer.";
    analysis = {
      result: "fake",
      confidence: 99,
      details: {
        summary: `This document was previously reviewed by an administrator and confirmed fake. ${reason}`,
      },
      checks: [
        {
          name: "Admin Human Review Override",
          passed: false,
          severity: "critical",
          message: `A human administrator has reviewed this exact document and determined it is NOT genuine. Reason: ${reason}`,
        },
      ],
    };
    metadata = (priorAdminFlag.metadata as any) || {};
  } else {
    const pdfAnalyzer = new PDFAnalyzer();
    // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
    const fileBuffer = await fs.promises.readFile(safeFilePath);
    const pdfBinary = fileBuffer.toString("binary");

    const [extractedMetadata, trustedPatterns] = await Promise.all([
      pdfAnalyzer.extractMetadata(safeFilePath), // codeql[js/path-injection] - safeFilePath validated by sanitizeUploadPath
      storage.getTrustedPatterns(),
    ]);

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

    const [analysisResult, cosCheckResult] = await Promise.all([
      pdfAnalyzer.analyzeAgainstTrustedPatterns(extractedMetadata, trustedPatterns, adminContext),
      Promise.resolve(new COSAuthenticityChecker().check(pdfBinary, extractedMetadata)),
    ]);
    analysis = analysisResult;
    analysis.cosCheck = cosCheckResult;

    if (cosCheckResult.verdict === "GENUINE" && analysisResult.result !== "genuine") {
      logger.info(
        `[COS] cosCheck GENUINE overrides pattern analysis '${analysisResult.result}' — treating as genuine`,
      );
      result = "genuine";
      analysis.result = "genuine";
      analysis.confidence = Math.max(analysis.confidence as number, 85);
    } else {
      result = analysisResult.result;
    }
    metadata = {
      format: "Pdf",
      mimeType: "application/pdf",
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

  return { result, analysis, metadata, documentHash, receiptId, isAdminOverride, priorAdminFlag };
}
