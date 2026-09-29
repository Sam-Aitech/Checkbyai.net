import { sql, eq } from "drizzle-orm";
import { users } from "@shared/schema";
import type { db } from "../db";
import { buildForensicEvidence, emptyStructuralFeatures, type ForensicProvenance } from "./forensicTypes";

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
