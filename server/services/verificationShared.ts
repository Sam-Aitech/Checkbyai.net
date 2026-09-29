import { sql, eq } from "drizzle-orm";
import { users } from "@shared/schema";
import type { db } from "../db";
import { logger } from "../utils/logger";
import {
  buildForensicEvidence,
  emptyStructuralFeatures,
  toEvidenceVerdict,
  type ForensicProvenance,
  type StructuralFeatures,
} from "./forensicTypes";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface AdminOverrideEvidenceInput {
  analysis: any;
  documentHash: string;
  uploadMethod: ForensicProvenance["uploadMethod"];
  filename: string;
  verdict: "FAKE" | "GENUINE";
}

/**
 * Evidence bundle for a verification short-circuited by a human admin override.
 * The parser did not run on this path, so this records an explicit override
 * bundle so every persisted verification still carries pinned versions + hash.
 */
export function buildAdminOverrideEvidence(input: AdminOverrideEvidenceInput) {
  const checks = Array.isArray(input.analysis?.checks) ? input.analysis.checks : [];
  return buildForensicEvidence({
    documentHash: input.documentHash,
    extractedFeatures: {},
    structuralFeatures: emptyStructuralFeatures(),
    forensicChecks: checks.map((c: any) => ({
      checkId: `override:${c.name ?? "admin-review"}`,
      passed: !!c.passed,
      detail: c.message,
    })),
    provenance: {
      uploadMethod: input.uploadMethod,
      filenameSanitized: input.filename,
      magicVerified: true,
      processingTimestamp: new Date().toISOString(),
    },
    finalVerdict: input.verdict,
    finalConfidence: 99,
  });
}

/** Flatten pattern-engine and CoS check results into evidence check rows. */
export function buildPatternAndCosForensicChecks(
  outcomeChecks: unknown,
  cosChecks: unknown,
) {
  return [
    ...(Array.isArray(outcomeChecks) ? outcomeChecks : []).map((c: any) => ({
      checkId: `pattern:${c.name ?? "unknown"}`,
      passed: !!c.passed,
      detail: c.message,
    })),
    ...(Array.isArray(cosChecks) ? cosChecks : []).map((c: any) => ({
      checkId: `cos:${c.name ?? "unknown"}`,
      passed: !!c.passed,
      detail: c.detail,
    })),
  ];
}

const REQUIRED_XMP_FIELDS = [
  "dc:date",
  "dc:format",
  "dc:language",
  "pdf:PDFVersion",
  "pdf:Producer",
  "xmp:CreateDate",
  "xmp:CreatorTool",
  "xmp:MetadataDate",
] as const;

interface PdfVerdictEvidenceInput {
  pdfBinary: string;
  extractedMetadata: any;
  extractStructuralFeatures: (pdfBinary: string) => StructuralFeatures;
  outcome: { result: string; confidence: number; checks: unknown };
  cosCheckResult: { checks: unknown; reason?: string | null };
  documentHash: string;
  receiptId?: string;
  uploadMethod: ForensicProvenance["uploadMethod"];
  filename: string;
  logTag: string;
}

/**
 * Attach the immutable internal evidence bundle to a parsed-PDF verdict.
 *
 * Building the bundle must never change or block the served verdict, but a
 * failure must not be silent either: every persisted verification is supposed
 * to carry a bundle. On failure we log at error with the document hash and
 * receipt id (so it can be found and alerted on) and persist
 * `analysis.forensicEvidenceError` so the row is visibly marked and offline
 * shadow-eval / corpus tooling can distinguish "failed" from "never built".
 */
export function attachPdfVerdictEvidence(analysis: any, input: PdfVerdictEvidenceInput): void {
  try {
    const md = input.extractedMetadata;
    const parsedXmp = md.parsedXmp ?? {};
    const xmpPresence: Record<string, boolean> = {};
    for (const field of REQUIRED_XMP_FIELDS) xmpPresence[field] = !!parsedXmp[field];
    analysis.forensicEvidence = buildForensicEvidence({
      documentHash: input.documentHash,
      extractedFeatures: {
        producer: md.producer ?? null,
        creator: md.creator ?? null,
        pdfVersion: md.pdfVersion ?? null,
        creationDate: md.creationDate ?? null,
        modificationDate: md.modificationDate ?? null,
        pages: md.pages ?? null,
        fontCount: md.fontCount ?? 0,
        wordCount: md.wordCount ?? null,
        characterCount: md.characterCount ?? null,
        isEncrypted: md.isEncrypted ?? false,
        hasDigitalSignature: md.hasDigitalSignature ?? false,
        xmpPresence,
        hasRealXmp: !!md.rawXmpData,
      },
      structuralFeatures: input.extractStructuralFeatures(input.pdfBinary),
      forensicChecks: buildPatternAndCosForensicChecks(input.outcome.checks, input.cosCheckResult.checks),
      provenance: {
        uploadMethod: input.uploadMethod,
        filenameSanitized: input.filename,
        magicVerified: true,
        processingTimestamp: new Date().toISOString(),
      },
      finalVerdict: toEvidenceVerdict(input.outcome.result as Parameters<typeof toEvidenceVerdict>[0]),
      finalConfidence: input.outcome.confidence,
      abstentionReason:
        input.outcome.result === "suspicious"
          ? (input.cosCheckResult.reason ?? "Conflicting or unverifiable signals — human review recommended.")
          : null,
    });
  } catch (err) {
    logger.error(
      { err, documentHash: input.documentHash, receiptId: input.receiptId, uploadMethod: input.uploadMethod },
      `${input.logTag} forensic evidence bundle build failed — verdict unaffected, error marker persisted`,
    );
    analysis.forensicEvidenceError = {
      message: err instanceof Error ? err.message : String(err),
      at: new Date().toISOString(),
    };
  }
}

interface UsageChargeInput {
  userId?: string | null;
  useCredits: boolean;
  useDailyLimit: boolean;
}

/** Charge one verification against the user's credits or daily allowance. */
export async function chargeVerificationUsage(tx: Tx, input: UsageChargeInput): Promise<void> {
  const { userId, useCredits, useDailyLimit } = input;
  if (!userId) return;
  if (useCredits) {
    await tx
      .update(users)
      .set({ credits: sql`GREATEST(COALESCE(${users.credits}, 0) - 1, 0)`, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return;
  }
  if (!useDailyLimit) return;
  const today = new Date().toISOString().split("T")[0];
  const [currentUser] = await tx
    .select({ dailyVerificationsUsed: users.dailyVerificationsUsed, lastVerificationDate: users.lastVerificationDate })
    .from(users)
    .where(eq(users.id, userId));
  const usageToday = currentUser?.lastVerificationDate === today ? (currentUser.dailyVerificationsUsed || 0) + 1 : 1;
  await tx
    .update(users)
    .set({
      dailyVerificationsUsed: usageToday,
      totalVerificationsUsed: sql`COALESCE(${users.totalVerificationsUsed}, 0) + 1`,
      lastVerificationDate: today,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
