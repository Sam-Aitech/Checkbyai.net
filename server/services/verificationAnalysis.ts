import * as fs from "fs";
import { storage } from "../storage";
import { PDFAnalyzer } from "./pdfAnalyzer";
import { COSAuthenticityChecker } from "./cosAuthenticityChecker";
import { logger } from "../utils/logger";

export interface VerificationAnalysisResult {
  result: string;
  analysis: any;
  metadata: any;
}

export async function runVerificationAnalysis(safeFilePath: string): Promise<VerificationAnalysisResult> {
  const pdfAnalyzer = new PDFAnalyzer();
  const fileBuffer = await fs.promises.readFile(safeFilePath);
  const pdfBinary = fileBuffer.toString("binary");

  const [extractedMetadata, trustedPatterns] = await Promise.all([
    pdfAnalyzer.extractMetadata(safeFilePath),
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

  const analysis: any = analysisResult;
  analysis.cosCheck = cosCheckResult;

  let result: string;
  if (cosCheckResult.verdict === "GENUINE" && analysisResult.result !== "genuine") {
    logger.info(`[COS] cosCheck GENUINE overrides pattern analysis '${analysisResult.result}' — treating as genuine`);
    result = "genuine";
    analysis.result = "genuine";
    analysis.confidence = Math.max(analysis.confidence as number, 85);
  } else {
    result = analysisResult.result;
  }

  const metadata = {
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

  return { result, analysis, metadata };
}
