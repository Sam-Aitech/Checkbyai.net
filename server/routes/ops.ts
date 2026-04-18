import crypto from "crypto";
import type { Express } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { jobTriggerAudit } from "@shared/schema";
import { requireRole } from "../middleware/roleGuard";
import { opsTriggerLimiter } from "../middleware/rateLimiter";
import { isSafeCallbackUrl, signPayload } from "../utils/callbackSigner";
import { isUuidV4 } from "../utils/idempotency";
import { generateCorrelationId, startJobRun, finishJobRun } from "../utils/jobTelemetry";
import { runSponsorMonitorJob } from "../utils/sponsorMonitorJob";
import { runJobAlertJob } from "../utils/jobAlertJob";
import { seedEnrichmentQueue, runEnrichmentBatch } from "../utils/enrichmentWorker";
import { processQueuedEngineEvents } from "../services/notificationEngine";
import { logger } from "../utils/logger";

const log = logger.child({ module: "OpsRoutes" });

const CALLBACK_TIMEOUT_MS = 10_000;
const JOB_TIMEOUT_MS: Record<JobName, number> = {
  sponsorMonitorJob: 25 * 60 * 1000,
  jobAlertJob: 15 * 60 * 1000,
  enrichmentSeed: 10 * 60 * 1000,
  enrichmentBatch: 30 * 60 * 1000,
  notificationDrain: 10 * 60 * 1000,
};

const JOB_NAMES = [
  "sponsorMonitorJob",
  "jobAlertJob",
  "enrichmentSeed",
  "enrichmentBatch",
  "notificationDrain",
] as const;

type JobName = (typeof JOB_NAMES)[number];

function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value);
}

function parseTriggerBody(body: any): {
  idempotencyKey: string;
  callbackUrl: string | null;
  reason: string | null;
} {
  return {
    idempotencyKey: String(body?.idempotencyKey ?? "").trim(),
    callbackUrl: body?.callbackUrl ? String(body.callbackUrl).trim() : null,
    reason: body?.reason ? String(body.reason).trim().slice(0, 2000) : null,
  };
}

async function markAuditStatus(params: {
  triggerId: string;
  status: "running" | "success" | "failed";
  failureReason?: string | null;
}): Promise<void> {
  if (params.status === "running") {
    await db
      .update(jobTriggerAudit)
      .set({ status: "running" })
      .where(eq(jobTriggerAudit.triggerId, params.triggerId));
    return;
  }

  if (params.status === "success") {
    await db
      .update(jobTriggerAudit)
      .set({ status: "success", completedAt: new Date(), failureReason: null })
      .where(eq(jobTriggerAudit.triggerId, params.triggerId));
    return;
  }

  await db
    .update(jobTriggerAudit)
    .set({ status: "failed", completedAt: new Date(), failureReason: params.failureReason ?? "Unknown failure" })
    .where(eq(jobTriggerAudit.triggerId, params.triggerId));
}

async function markAuditCompleted(params: {
  triggerId: string;
  status: "success" | "failed";
  failureReason?: string | null;
  startedAt: number;
}): Promise<void> {
  await db
    .update(jobTriggerAudit)
    .set({
      status: params.status,
      failureReason: params.status === "failed" ? params.failureReason ?? "Unknown failure" : null,
      completedAt: new Date(),
      durationMs: Date.now() - params.startedAt,
    })
    .where(eq(jobTriggerAudit.triggerId, params.triggerId));
}

async function sendSignedCallback(callbackUrl: string, payload: Record<string, unknown>): Promise<void> {
  const secret = process.env.CALLBACK_SIGNING_SECRET;
  if (!secret) return;

  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS);

  try {
    await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Checkbyai-Signature": signature,
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function runTriggeredJob(params: {
  triggerId: string;
  correlationId: string;
  jobName: JobName;
  callbackUrl: string | null;
}): Promise<void> {
  const startedAt = Date.now();
  await markAuditStatus({ triggerId: params.triggerId, status: "running" });

  try {
    const timeoutMs = JOB_TIMEOUT_MS[params.jobName];
    await Promise.race([
      (async () => {
        if (params.jobName === "sponsorMonitorJob") {
          const result = await runSponsorMonitorJob(
            "admin-manual",
            true,
            { correlationId: params.correlationId, triggerSource: "manual" },
          );
          if (!result.success) {
            throw new Error(result.error ?? "sponsorMonitorJob failed");
          }
          return;
        }

        if (params.jobName === "jobAlertJob") {
          await runJobAlertJob({ correlationId: params.correlationId, triggerSource: "manual" });
          return;
        }

        if (params.jobName === "notificationDrain") {
          await processQueuedEngineEvents({ correlationId: params.correlationId, triggerSource: "manual" });
          return;
        }

        if (params.jobName === "enrichmentSeed") {
          const telemetry = startJobRun("enrichmentSeed", "manual", "inline", params.correlationId);
          try {
            await seedEnrichmentQueue();
            finishJobRun({ ...telemetry, jobName: "enrichmentSeed", triggerSource: "manual", runMode: "inline", result: "success" });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            finishJobRun({ ...telemetry, jobName: "enrichmentSeed", triggerSource: "manual", runMode: "inline", result: "failed", failureReason: message });
            throw err;
          }
          return;
        }

        const telemetry = startJobRun("enrichmentBatch", "manual", "inline", params.correlationId);
        try {
          const result = await runEnrichmentBatch();
          if (result.errors > 0) {
            throw new Error(`Enrichment batch completed with ${result.errors} errors`);
          }
          finishJobRun({ ...telemetry, jobName: "enrichmentBatch", triggerSource: "manual", runMode: "inline", result: "success" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          finishJobRun({ ...telemetry, jobName: "enrichmentBatch", triggerSource: "manual", runMode: "inline", result: "failed", failureReason: message });
          throw err;
        }
      })(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Job timed out after ${Math.floor(timeoutMs / 60000)} minutes`)), timeoutMs);
      }),
    ]);

    await markAuditCompleted({ triggerId: params.triggerId, status: "success", startedAt });
    if (params.callbackUrl) {
      await sendSignedCallback(params.callbackUrl, {
        triggerId: params.triggerId,
        correlationId: params.correlationId,
        jobName: params.jobName,
        status: "success",
        completedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    await markAuditCompleted({ triggerId: params.triggerId, status: "failed", failureReason, startedAt });

    if (params.callbackUrl) {
      try {
        await sendSignedCallback(params.callbackUrl, {
          triggerId: params.triggerId,
          correlationId: params.correlationId,
          jobName: params.jobName,
          status: "failed",
          failureReason,
          completedAt: new Date().toISOString(),
        });
      } catch (callbackErr) {
        log.warn({ err: callbackErr, triggerId: params.triggerId }, "Failed to deliver callback after job failure");
      }
    }

    log.error({ err, triggerId: params.triggerId, jobName: params.jobName }, "Triggered orchestration job failed");
  }
}

export function registerOpsRoutes(app: Express): void {
  app.post("/api/ops/jobs/:jobName/trigger", requireRole("admin"), opsTriggerLimiter, async (req: any, res) => {
    try {
      const jobNameRaw = String(req.params.jobName ?? "").trim();
      if (!isJobName(jobNameRaw)) {
        return res.status(400).json({ message: "Unsupported jobName" });
      }
      const jobName: JobName = jobNameRaw;

      const { idempotencyKey, callbackUrl, reason } = parseTriggerBody(req.body);
      if (!idempotencyKey || !isUuidV4(idempotencyKey)) {
        return res.status(400).json({ message: "idempotencyKey must be a UUID v4" });
      }

      if (callbackUrl && !(await isSafeCallbackUrl(callbackUrl))) {
        return res.status(400).json({ message: "callbackUrl must be a safe HTTPS endpoint" });
      }

      if (callbackUrl && !process.env.CALLBACK_SIGNING_SECRET) {
        return res.status(400).json({ message: "CALLBACK_SIGNING_SECRET must be configured for callbackUrl usage" });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const triggerId = crypto.randomUUID();
      const correlationId = generateCorrelationId();

      try {
        await db.insert(jobTriggerAudit).values({
          triggerId,
          correlationId,
          jobName: jobNameRaw,
          idempotencyKey,
          triggeredBy: String(userId),
          triggerSource: "manual",
          callbackUrl,
          reason,
          status: "accepted",
        });
      } catch (err: any) {
        // Unique index enforces race-safe idempotency for (jobName, idempotencyKey).
        if (err?.code === "23505") {
          const existing = await db
            .select({ triggerId: jobTriggerAudit.triggerId, correlationId: jobTriggerAudit.correlationId })
            .from(jobTriggerAudit)
            .where(and(eq(jobTriggerAudit.jobName, jobNameRaw), eq(jobTriggerAudit.idempotencyKey, idempotencyKey)))
            .orderBy(desc(jobTriggerAudit.triggeredAt))
            .limit(1);

          if (existing.length > 0) {
            return res.status(409).json({
              status: "already_accepted",
              triggerId: existing[0].triggerId,
              correlationId: existing[0].correlationId,
              message: "Idempotent replay detected",
            });
          }
        }

        throw err;
      }

      void runTriggeredJob({
        triggerId,
        correlationId,
        jobName,
        callbackUrl,
      }).catch((err) => {
        log.error({ err, triggerId, jobName }, "Unexpected background orchestration trigger error");
      });

      return res.status(202).json({
        status: "accepted",
        triggerId,
        correlationId,
        jobName,
        callbackSigned: Boolean(callbackUrl),
      });
    } catch (err) {
      log.error({ err }, "Failed to trigger orchestration job");
      return res.status(500).json({ message: "Failed to trigger orchestration job" });
    }
  });

  app.get("/api/ops/jobs/:jobName/status/:triggerId", requireRole("analyst"), async (req, res) => {
    try {
      const jobNameRaw = String(req.params.jobName ?? "").trim();
      const triggerId = String(req.params.triggerId ?? "").trim();

      if (!isJobName(jobNameRaw)) {
        return res.status(400).json({ message: "Unsupported jobName" });
      }
      if (!isUuidV4(triggerId)) {
        return res.status(400).json({ message: "Invalid triggerId format" });
      }

      const rows = await db
        .select()
        .from(jobTriggerAudit)
        .where(and(eq(jobTriggerAudit.jobName, jobNameRaw), eq(jobTriggerAudit.triggerId, triggerId)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ message: "Trigger not found" });
      }

      const row = rows[0];
      return res.json({
        triggerId: row.triggerId,
        correlationId: row.correlationId,
        jobName: row.jobName,
        status: row.status,
        triggeredBy: row.triggeredBy,
        triggeredAt: row.triggeredAt,
        completedAt: row.completedAt,
        durationMs: row.durationMs,
        failureReason: row.failureReason,
      });
    } catch (err) {
      log.error({ err }, "Failed to read orchestration status");
      return res.status(500).json({ message: "Failed to read orchestration status" });
    }
  });
}
