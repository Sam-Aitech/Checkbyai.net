import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { jobTriggerAudit } from "@shared/schema";

export const SHADOW_JOB_NAMES = [
  "sponsorMonitorJob",
  "jobAlertJob",
  "enrichmentSeed",
  "enrichmentBatch",
  "notificationDrain",
] as const;

export type ShadowJobName = (typeof SHADOW_JOB_NAMES)[number];
export type ShadowResult = "success" | "failed" | "skipped";

export interface ShadowRunSnapshot {
  jobName: ShadowJobName;
  result: ShadowResult;
  metrics: Record<string, number>;
  notes: string[];
}

export interface ProductionBaseline {
  correlationId: string | null;
  result: ShadowResult;
  durationMs: number | null;
}

export interface ParityComputation {
  parityScore: number;
  outcomeMatch: boolean;
  durationDriftMs: number | null;
  recordsDrift: number | null;
  changeDriftJson: Record<string, unknown>;
  driftSummary: string;
}

function toMetric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function clampScore(score: number): number {
  if (score < 0) return 0;
  if (score > 1) return 1;
  return Number(score.toFixed(4));
}

function mapAuditStatusToResult(status: string | null | undefined): ShadowResult {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "skipped";
}

export function computeParityReport(params: {
  shadow: ShadowRunSnapshot;
  production: ProductionBaseline | null;
}): ParityComputation {
  const production = params.production;
  if (!production) {
    return {
      parityScore: 0,
      outcomeMatch: false,
      durationDriftMs: null,
      recordsDrift: null,
      changeDriftJson: {},
      driftSummary: "No production baseline found for this job",
    };
  }

  const outcomeMatch = production.result === params.shadow.result;
  const durationDriftMs =
    params.shadow.metrics.durationMs != null && production.durationMs != null
      ? Math.abs(Math.round(params.shadow.metrics.durationMs - production.durationMs))
      : null;

  const shadowRecords = toMetric(params.shadow.metrics.recordsProcessed);
  const prodRecords = toMetric(params.shadow.metrics.productionRecordsProcessed);
  const recordsDrift = prodRecords > 0 || shadowRecords > 0
    ? Math.abs(Math.round(shadowRecords - prodRecords))
    : null;

  let score = outcomeMatch ? 0.7 : 0;

  if (durationDriftMs != null) {
    if (durationDriftMs <= 10_000) score += 0.2;
    else if (durationDriftMs <= 60_000) score += 0.1;
  }

  if (recordsDrift != null) {
    if (recordsDrift === 0) score += 0.1;
    else if (recordsDrift <= 5) score += 0.05;
  }

  const parityScore = clampScore(score);

  const driftMessages: string[] = [];
  if (!outcomeMatch) {
    driftMessages.push(`Outcome mismatch: shadow=${params.shadow.result}, production=${production.result}`);
  }
  if (durationDriftMs != null && durationDriftMs > 60_000) {
    driftMessages.push(`Duration drift high at ${durationDriftMs}ms`);
  }
  if (recordsDrift != null && recordsDrift > 5) {
    driftMessages.push(`Records drift is ${recordsDrift}`);
  }

  return {
    parityScore,
    outcomeMatch,
    durationDriftMs,
    recordsDrift,
    changeDriftJson: {
      shadowMetrics: params.shadow.metrics,
      productionCorrelationId: production.correlationId,
    },
    driftSummary: driftMessages.join("; ") || "Shadow output is within expected parity tolerance",
  };
}

export async function getLatestProductionBaseline(jobName: ShadowJobName): Promise<ProductionBaseline | null> {
  const rows = await db
    .select({
      correlationId: jobTriggerAudit.correlationId,
      status: jobTriggerAudit.status,
      durationMs: jobTriggerAudit.durationMs,
    })
    .from(jobTriggerAudit)
    .where(
      and(
        eq(jobTriggerAudit.jobName, jobName),
        sql`${jobTriggerAudit.status} IN ('success', 'failed')`,
      ),
    )
    .orderBy(desc(jobTriggerAudit.triggeredAt))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    correlationId: row.correlationId,
    result: mapAuditStatusToResult(row.status),
    durationMs: row.durationMs,
  };
}

export async function runShadowSnapshot(jobName: ShadowJobName): Promise<ShadowRunSnapshot> {
  const notes: string[] = ["Read-only shadow execution"];

  if (jobName === "sponsorMonitorJob") {
    const summaryRows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS "recordsProcessed",
        COUNT(*) FILTER (WHERE status <> 'pending')::int AS "changesDetected"
      FROM sponsor_changes
      WHERE detected_at >= NOW() - INTERVAL '24 hours'
    `);

    const raw = summaryRows.rows[0] as any;
    return {
      jobName,
      result: "success",
      metrics: {
        recordsProcessed: toMetric(raw?.recordsProcessed),
        changesDetected: toMetric(raw?.changesDetected),
      },
      notes,
    };
  }

  if (jobName === "jobAlertJob") {
    const summaryRows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS "recordsProcessed",
        COUNT(*) FILTER (WHERE sent_at >= NOW() - INTERVAL '24 hours')::int AS "alertsSent"
      FROM notif_log
      WHERE event_type = 'weekly_digest'
    `);

    const raw = summaryRows.rows[0] as any;
    return {
      jobName,
      result: "success",
      metrics: {
        recordsProcessed: toMetric(raw?.recordsProcessed),
        alertsSent: toMetric(raw?.alertsSent),
      },
      notes,
    };
  }

  if (jobName === "enrichmentSeed") {
    const summaryRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS "recordsProcessed",
        COUNT(*) FILTER (WHERE status = 'completed')::int AS "alreadyCompleted"
      FROM enrichment_queue
    `);

    const raw = summaryRows.rows[0] as any;
    return {
      jobName,
      result: "success",
      metrics: {
        recordsProcessed: toMetric(raw?.recordsProcessed),
        alreadyCompleted: toMetric(raw?.alreadyCompleted),
      },
      notes,
    };
  }

  if (jobName === "enrichmentBatch") {
    const summaryRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= NOW() - INTERVAL '24 hours')::int AS "recordsProcessed",
        COUNT(*) FILTER (WHERE status IN ('failed', 'captcha_blocked') AND updated_at >= NOW() - INTERVAL '24 hours')::int AS "errors"
      FROM enrichment_queue
    `);

    const raw = summaryRows.rows[0] as any;
    return {
      jobName,
      result: "success",
      metrics: {
        recordsProcessed: toMetric(raw?.recordsProcessed),
        errors: toMetric(raw?.errors),
      },
      notes,
    };
  }

  const summaryRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued')::int AS "recordsProcessed",
      COUNT(*) FILTER (WHERE status = 'sent')::int AS "delivered"
    FROM notif_engine_log
  `);

  const raw = summaryRows.rows[0] as any;
  return {
    jobName,
    result: "success",
    metrics: {
      recordsProcessed: toMetric(raw?.recordsProcessed),
      delivered: toMetric(raw?.delivered),
    },
    notes,
  };
}
