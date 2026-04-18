import crypto from "crypto";
import type { Express } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { jobTriggerAudit, shadowParityReports, shadowRunResults } from "@shared/schema";
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
import { computeParityReport, getLatestProductionBaseline, runShadowSnapshot } from "../utils/shadowMode";

const log = logger.child({ module: "OpsRoutes" });

const CALLBACK_TIMEOUT_MS = 10_000;
const CALLBACK_MAX_ATTEMPTS = 3;
const CALLBACK_RETRY_BASE_MS = 500;
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
const JOB_TIMEOUT_MS: Record<JobName, number> = {
  sponsorMonitorJob: 25 * 60 * 1000,
  jobAlertJob: 15 * 60 * 1000,
  enrichmentSeed: 10 * 60 * 1000,
  enrichmentBatch: 30 * 60 * 1000,
  notificationDrain: 10 * 60 * 1000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  if (!secret) {
    throw new Error("CALLBACK_SIGNING_SECRET is not configured");
  }

  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS);

  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Checkbyai-Signature": signature,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Callback endpoint returned ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function deliverCallbackWithRetry(params: {
  triggerId: string;
  callbackUrl: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= CALLBACK_MAX_ATTEMPTS; attempt += 1) {
    try {
      await sendSignedCallback(params.callbackUrl, params.payload);
      await db
        .update(jobTriggerAudit)
        .set({
          callbackStatus: "sent",
          callbackAttempts: attempt,
          callbackLastError: null,
          callbackLastAttemptAt: new Date(),
        })
        .where(eq(jobTriggerAudit.triggerId, params.triggerId));
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await db
        .update(jobTriggerAudit)
        .set({
          callbackStatus: "failed",
          callbackAttempts: attempt,
          callbackLastError: lastError,
          callbackLastAttemptAt: new Date(),
        })
        .where(eq(jobTriggerAudit.triggerId, params.triggerId));

      if (attempt < CALLBACK_MAX_ATTEMPTS) {
        const backoff = CALLBACK_RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
  }

  throw new Error(lastError ?? "Callback delivery failed after retries");
}

function dispatchCallbackDelivery(params: {
  triggerId: string;
  callbackUrl: string;
  payload: Record<string, unknown>;
}): void {
  void deliverCallbackWithRetry(params).catch((err) => {
    log.warn({ err, triggerId: params.triggerId }, "Callback delivery exhausted retries");
  });
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
      dispatchCallbackDelivery({
        triggerId: params.triggerId,
        callbackUrl: params.callbackUrl,
        payload: {
        triggerId: params.triggerId,
        correlationId: params.correlationId,
        jobName: params.jobName,
        status: "success",
        completedAt: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    await markAuditCompleted({ triggerId: params.triggerId, status: "failed", failureReason, startedAt });

    if (params.callbackUrl) {
      dispatchCallbackDelivery({
        triggerId: params.triggerId,
        callbackUrl: params.callbackUrl,
        payload: {
          triggerId: params.triggerId,
          correlationId: params.correlationId,
          jobName: params.jobName,
          status: "failed",
          failureReason,
          completedAt: new Date().toISOString(),
        },
      });
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
      const idempotencyBucket = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS);
      const storedIdempotencyKey = `${idempotencyKey}:${idempotencyBucket}`;
      const previousBucketKey = `${idempotencyKey}:${idempotencyBucket - 1}`;

      let replayResponse: { triggerId: string; correlationId: string } | null = null;
      await db.transaction(async (tx) => {
        const lockKey = `${jobNameRaw}:${storedIdempotencyKey}`;
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(
            (('x' || substr(md5(${lockKey}), 1, 16))::bit(64))::bigint
          )
        `);

        const replayWindowStart = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
        const existing = await tx
          .select({ triggerId: jobTriggerAudit.triggerId, correlationId: jobTriggerAudit.correlationId })
          .from(jobTriggerAudit)
          .where(
            and(
              eq(jobTriggerAudit.jobName, jobNameRaw),
              sql`${jobTriggerAudit.idempotencyKey} IN (${storedIdempotencyKey}, ${previousBucketKey})`,
              gte(jobTriggerAudit.triggeredAt, replayWindowStart),
            ),
          )
          .orderBy(desc(jobTriggerAudit.triggeredAt))
          .limit(1);

        if (existing.length > 0) {
          replayResponse = { triggerId: existing[0].triggerId, correlationId: existing[0].correlationId };
          return;
        }

        await tx.insert(jobTriggerAudit).values({
          triggerId,
          correlationId,
          jobName: jobNameRaw,
          idempotencyKey: storedIdempotencyKey,
          triggeredBy: String(userId),
          triggerSource: "manual",
          callbackUrl,
          callbackStatus: callbackUrl ? "pending" : null,
          callbackAttempts: 0,
          reason,
          status: "accepted",
        });
      });

      const replay = replayResponse as { triggerId: string; correlationId: string } | null;
      if (replay !== null) {
        return res.status(409).json({
          status: "already_accepted",
          triggerId: replay.triggerId,
          correlationId: replay.correlationId,
          message: "Idempotent replay detected in 24h window",
        });
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

  app.post("/api/ops/jobs/:jobName/shadow", requireRole("admin"), opsTriggerLimiter, async (req: any, res) => {
    const jobNameRaw = String(req.params.jobName ?? "").trim();
    if (!isJobName(jobNameRaw)) {
      return res.status(400).json({ message: "Unsupported jobName" });
    }
    const jobName: JobName = jobNameRaw;

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const correlationId = generateCorrelationId();
    const telemetry = startJobRun(jobName, "manual", "shadow", correlationId);
    const startedAt = Date.now();

    try {
      const shadowSnapshot = await runShadowSnapshot(jobName);
      const production = await getLatestProductionBaseline(jobName);
      const parity = computeParityReport({ shadow: shadowSnapshot, production });

      const shadowInsert = await db
        .insert(shadowRunResults)
        .values({
          correlationId,
          jobName,
          runMode: "shadow",
          triggerSource: "manual",
          triggeredBy: String(userId),
          snapshotJson: {
            ...shadowSnapshot,
            productionCorrelationId: production?.correlationId ?? null,
          },
          result: shadowSnapshot.result,
          durationMs: Date.now() - startedAt,
          startedAt: new Date(telemetry.startedAt),
          completedAt: new Date(),
        })
        .returning({ id: shadowRunResults.id });

      const shadowRunId = shadowInsert[0]?.id;
      if (!shadowRunId) {
        throw new Error("Failed to persist shadow run result");
      }

      const parityInsert = await db
        .insert(shadowParityReports)
        .values({
          shadowRunId,
          productionCorrelationId: production?.correlationId ?? null,
          jobName,
          parityScore: parity.parityScore.toFixed(4),
          outcomeMatch: parity.outcomeMatch,
          durationDriftMs: parity.durationDriftMs,
          recordsDrift: parity.recordsDrift,
          changeDriftJson: parity.changeDriftJson,
          driftSummary: parity.driftSummary,
        })
        .returning({ id: shadowParityReports.id });

      finishJobRun({
        ...telemetry,
        jobName,
        triggerSource: "manual",
        runMode: "shadow",
        result: "success",
      });

      return res.status(202).json({
        status: "accepted",
        correlationId,
        jobName,
        runMode: "shadow",
        shadowRunId,
        parityReportId: parityInsert[0]?.id ?? null,
        parityScore: parity.parityScore,
      });
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : String(err);
      finishJobRun({
        ...telemetry,
        jobName,
        triggerSource: "manual",
        runMode: "shadow",
        result: "failed",
        failureReason,
      });
      log.error({ err, correlationId, jobName }, "Failed to execute shadow run");
      return res.status(500).json({ message: "Failed to execute shadow run" });
    }
  });

  app.get("/api/ops/shadow-runs", requireRole("analyst"), async (req, res) => {
    try {
      const jobName = req.query.jobName ? String(req.query.jobName).trim() : null;
      const requestedLimit = Number(req.query.limit ?? 20);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.floor(requestedLimit), 1), 200)
        : 20;

      const rows = jobName
        ? await db
            .select()
            .from(shadowRunResults)
            .where(eq(shadowRunResults.jobName, jobName))
            .orderBy(desc(shadowRunResults.createdAt))
            .limit(limit)
        : await db
            .select()
            .from(shadowRunResults)
            .orderBy(desc(shadowRunResults.createdAt))
            .limit(limit);

      return res.json({
        count: rows.length,
        items: rows,
      });
    } catch (err) {
      log.error({ err }, "Failed to list shadow runs");
      return res.status(500).json({ message: "Failed to list shadow runs" });
    }
  });

  app.get("/api/ops/parity-reports", requireRole("analyst"), async (req, res) => {
    try {
      const jobName = req.query.jobName ? String(req.query.jobName).trim() : null;
      const minScoreRaw = req.query.minScore != null ? Number(req.query.minScore) : null;
      const limitRaw = Number(req.query.limit ?? 20);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 200) : 20;

      const rows = await db
        .select()
        .from(shadowParityReports)
        .orderBy(desc(shadowParityReports.createdAt))
        .limit(limit);

      const filtered = rows.filter((row) => {
        if (jobName && row.jobName !== jobName) {
          return false;
        }

        if (minScoreRaw == null || !Number.isFinite(minScoreRaw)) {
          return true;
        }

        const parityScore = Number(row.parityScore);
        return Number.isFinite(parityScore) ? parityScore >= minScoreRaw : false;
      });

      return res.json({
        count: filtered.length,
        items: filtered,
      });
    } catch (err) {
      log.error({ err }, "Failed to list parity reports");
      return res.status(500).json({ message: "Failed to list parity reports" });
    }
  });

  app.get("/api/ops/parity-reports/:id", requireRole("analyst"), async (req, res) => {
    try {
      const id = Number(req.params.id ?? NaN);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid parity report id" });
      }

      const rows = await db
        .select()
        .from(shadowParityReports)
        .where(eq(shadowParityReports.id, id))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ message: "Parity report not found" });
      }

      return res.json(rows[0]);
    } catch (err) {
      log.error({ err }, "Failed to read parity report");
      return res.status(500).json({ message: "Failed to read parity report" });
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
