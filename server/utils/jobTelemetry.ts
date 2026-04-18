import crypto from "crypto";
import { logger } from "./logger";

const log = logger.child({ module: "JobTelemetry" });

// ── Types ──────────────────────────────────────────────────────────────────────

export type JobResult = "success" | "failed" | "skipped" | "retried";
export type TriggerSource = "cron" | "manual" | "webhook" | "queue" | "incident";
export type RunMode = "inline" | "queue" | "worker" | "shadow";

/** Phase 1 job lifecycle event contract.  All fields required. */
export interface JobLifecycleEvent {
  correlationId: string;
  jobName: string;
  triggerSource: TriggerSource;
  runMode: RunMode;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  result: JobResult;
  failureReason: string | null;
}

/** Per-job health state exposed by /api/health. */
export interface JobHealthSnapshot {
  jobName: string;
  running: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastRunMode: RunMode | null;
  staleByMinutes: number | null;
}

// ── In-memory health registry ─────────────────────────────────────────────────

interface HealthState {
  running: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastRunMode: RunMode | null;
}

const registry = new Map<string, HealthState>();

function getState(jobName: string): HealthState {
  return (
    registry.get(jobName) ?? {
      running: false,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastRunMode: null,
    }
  );
}

export function getJobHealthSnapshot(jobName: string): JobHealthSnapshot {
  const s = getState(jobName);
  const staleByMinutes =
    s.lastSuccessAt
      ? Math.floor((Date.now() - new Date(s.lastSuccessAt).getTime()) / 60_000)
      : null;
  return { jobName, ...s, staleByMinutes };
}

export function getAllJobHealthSnapshots(): JobHealthSnapshot[] {
  return Array.from(registry.keys()).map(getJobHealthSnapshot);
}

// ── Correlation IDs ───────────────────────────────────────────────────────────

export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

// ── Lifecycle helpers ─────────────────────────────────────────────────────────

/**
 * Call at job start (after lock acquisition).
 * Updates registry to running=true and emits a structured "started" log event.
 * Returns correlationId and startedAt — keep both for finishJobRun().
 */
export function startJobRun(
  jobName: string,
  triggerSource: TriggerSource,
  runMode: RunMode,
  correlationIdOverride?: string,
): { correlationId: string; startedAt: string } {
  const correlationId = correlationIdOverride ?? generateCorrelationId();
  const startedAt = new Date().toISOString();
  registry.set(jobName, { ...getState(jobName), running: true, lastRunMode: runMode });
  log.info({ correlationId, jobName, triggerSource, runMode, startedAt, event: "started" });
  return { correlationId, startedAt };
}

/**
 * Call in the finally block of a job run.
 * Updates registry and emits a structured "completed" log event.
 */
export function finishJobRun(params: {
  correlationId: string;
  jobName: string;
  triggerSource: TriggerSource;
  runMode: RunMode;
  startedAt: string;
  result: JobResult;
  failureReason?: string | null;
}): void {
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - new Date(params.startedAt).getTime();
  const prev = getState(params.jobName);

  registry.set(params.jobName, {
    running: false,
    lastRunMode: params.runMode,
    lastSuccessAt:
      params.result === "success" ? completedAt : prev.lastSuccessAt,
    lastFailureAt:
      params.result === "failed" ? completedAt : prev.lastFailureAt,
  });

  const event: JobLifecycleEvent = {
    correlationId: params.correlationId,
    jobName: params.jobName,
    triggerSource: params.triggerSource,
    runMode: params.runMode,
    startedAt: params.startedAt,
    completedAt,
    durationMs,
    result: params.result,
    failureReason: params.failureReason ?? null,
  };

  log.info({ ...event, event: "completed" });
}
