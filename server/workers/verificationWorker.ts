import type { Job } from "bullmq";
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { withRetry } from "../utils/dbRetry";
import { users, verificationResults } from "@shared/schema";
import { runVerificationAnalysis } from "../services/verificationAnalysis";
import { getDocumentStore } from "../services/documentStore";
import { emitToUser } from "../services/socketGateway";
import { UPLOADS_DIR } from "../utils/uploadGuard";
import { logger } from "../utils/logger";

export interface VerificationJobData {
  documentKey: string;
  userId: string;
  receiptId: string;
  documentHash: string;
  originalName: string;
  ipAddress?: string;
  useCredits: boolean;
  useDailyLimit: boolean;
}

export async function processVerificationJob(job: Job<VerificationJobData>) {
  const { documentKey, userId, receiptId, documentHash, originalName, ipAddress, useCredits, useDailyLimit } = job.data;
  logger.info(`[VerificationWorker] Job ${job.id} started for receipt ${receiptId} (key ${documentKey})`);
  emitToUser(userId, "verify:progress", { jobId: job.id, receiptId, stage: "extracting" });
  await job.updateProgress(10);

  const tmpPath = path.join(UPLOADS_DIR, `worker-${job.id}-${randomBytes(4).toString("hex")}.pdf`);

  try {
    await fs.promises.writeFile(tmpPath, await getDocumentStore().get(documentKey));
    await job.updateProgress(15);

    const { result, analysis, metadata } = await runVerificationAnalysis(tmpPath);
    emitToUser(userId, "verify:progress", { jobId: job.id, receiptId, stage: "analyzing" });
    await job.updateProgress(70);

    const verificationId = await withRetry(() => db.transaction(async (tx) => {
      if (useCredits && userId) {
        await tx.update(users).set({
          credits: sql`GREATEST(COALESCE(${users.credits}, 0) - 1, 0)`,
          updatedAt: new Date(),
        }).where(eq(users.id, userId));
      } else if (useDailyLimit && userId) {
        const today = new Date().toISOString().split("T")[0];
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
      const [verification] = await tx.insert(verificationResults).values({
        userId,
        filename: path.basename(originalName),
        result,
        confidence: Math.floor(analysis.confidence),
        metadata,
        analysisDetails: analysis,
        ipAddress,
        receiptId,
        documentHash,
      }).returning();
      return verification.id;
    }), "verify-result");

    await job.updateProgress(100);
    const payload = {
      jobId: job.id,
      receiptId,
      verificationId,
      result,
      confidence: analysis.confidence,
      details: analysis.details,
      checks: analysis.checks || [],
      forensicAnalysis: analysis.details?.forensicAnalysis || null,
      metadata,
      cosCheck: analysis.cosCheck ?? null,
    };
    emitToUser(userId, "verify:progress", { ...payload, stage: "done" });
    logger.info(`[VerificationWorker] Job ${job.id} complete — ${result}`);
    await getDocumentStore().delete(documentKey).catch(() => {});
    return payload;
  } catch (err) {
    emitToUser(userId, "verify:progress", { jobId: job.id, receiptId, stage: "failed", error: err instanceof Error ? err.message : String(err) });
    if (isLastAttempt(job)) {
      await getDocumentStore().delete(documentKey).catch(() => {});
    } else {
      logger.info(`[VerificationWorker] Job ${job.id} will retry — keeping ${documentKey}`);
    }
    throw err;
  } finally {
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

export function isLastAttempt(job: Pick<Job, "attemptsMade" | "opts">): boolean {
  const maxAttempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= maxAttempts;
}
