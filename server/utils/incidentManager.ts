import { eq } from "drizzle-orm";
import { db } from "../db";
import { incidentTickets } from "@shared/schema";
import { generateCorrelationId, type JobHealthSnapshot } from "./jobTelemetry";
import { runSponsorMonitorJob } from "./sponsorMonitorJob";
import { runJobAlertJob } from "./jobAlertJob";
import { seedEnrichmentQueue, runEnrichmentBatch } from "./enrichmentWorker";
import { processQueuedEngineEvents } from "../services/notificationEngine";
import { logger } from "./logger";

const log = logger.child({ module: "IncidentManager" });

// ── Types ──────────────────────────────────────────────────────────────────────

export type IncidentSeverity = "P0" | "P1" | "P2" | "P3";

interface SeverityThresholds {
  staleP3Minutes: number;
  staleP2Minutes: number;
  staleP1Minutes: number;
  staleP0Minutes: number;
}

// ── Severity matrix ────────────────────────────────────────────────────────────
// Hourly jobs: alert window starts at 75 min (1 missed run buffer).
// Daily jobs: alert window starts at 26 h (1 missed daily run + 1 h buffer).

const JOB_THRESHOLDS: Record<string, SeverityThresholds> = {
  notificationDrain: { staleP3Minutes: 75,       staleP2Minutes: 90,      staleP1Minutes: 180,     staleP0Minutes: 360     },
  enrichmentBatch:   { staleP3Minutes: 75,       staleP2Minutes: 90,      staleP1Minutes: 180,     staleP0Minutes: 360     },
  enrichmentSeed:    { staleP3Minutes: 26 * 60,  staleP2Minutes: 36 * 60, staleP1Minutes: 48 * 60, staleP0Minutes: 72 * 60 },
  jobAlertJob:       { staleP3Minutes: 26 * 60,  staleP2Minutes: 36 * 60, staleP1Minutes: 48 * 60, staleP0Minutes: 72 * 60 },
  sponsorMonitorJob: { staleP3Minutes: 26 * 60,  staleP2Minutes: 36 * 60, staleP1Minutes: 48 * 60, staleP0Minutes: 72 * 60 },
};

// ── Severity evaluation ────────────────────────────────────────────────────────

export function evaluateSeverity(snapshot: JobHealthSnapshot): IncidentSeverity | null {
  const thresholds = JOB_THRESHOLDS[snapshot.jobName];
  if (!thresholds) return null;

  // Never succeeded + has a recorded failure = at minimum P1
  if (!snapshot.lastSuccessAt && snapshot.lastFailureAt) return "P1";

  const stale = snapshot.staleByMinutes;
  if (stale === null) return null;

  if (stale >= thresholds.staleP0Minutes) return "P0";
  if (stale >= thresholds.staleP1Minutes) return "P1";
  if (stale >= thresholds.staleP2Minutes) return "P2";
  if (stale >= thresholds.staleP3Minutes) return "P3";
  return null;
}

// ── Incident ticket creation ───────────────────────────────────────────────────

function buildTitle(jobName: string, severity: IncidentSeverity, staleMinutes: number | null): string {
  const staleHours =
    staleMinutes !== null ? ` (stale ${Math.round((staleMinutes / 60) * 10) / 10}h)` : "";
  return `[${severity}] ${jobName} health degraded${staleHours}`;
}

export async function createIncidentTicket(
  snapshot: JobHealthSnapshot,
  severity: IncidentSeverity,
): Promise<number> {
  const result = await db
    .insert(incidentTickets)
    .values({
      jobName: snapshot.jobName,
      severity,
      status: "open",
      title: buildTitle(snapshot.jobName, severity, snapshot.staleByMinutes),
      context: {
        jobName: snapshot.jobName,
        running: snapshot.running,
        lastSuccessAt: snapshot.lastSuccessAt,
        lastFailureAt: snapshot.lastFailureAt,
        lastRunMode: snapshot.lastRunMode,
        staleByMinutes: snapshot.staleByMinutes,
        evaluatedAt: new Date().toISOString(),
      },
    })
    .returning({ id: incidentTickets.id });

  const id = result[0]?.id;
  if (!id) throw new Error("Failed to create incident ticket — no id returned");
  log.warn({ id, jobName: snapshot.jobName, severity }, "Incident ticket created");
  return id;
}

// ── Bounded auto-remediation ───────────────────────────────────────────────────
// Only fires for P0 and P1. One attempt per incident — no retry loop.
// Logs intent and outcome; updates remediationCorrelationId regardless.

async function runJobDirect(jobName: string, correlationId: string): Promise<void> {
  const orchestration = { correlationId, triggerSource: "incident" as const };

  if (jobName === "sponsorMonitorJob") {
    await runSponsorMonitorJob("incident", false, orchestration);
    return;
  }
  if (jobName === "jobAlertJob") {
    await runJobAlertJob(orchestration);
    return;
  }
  if (jobName === "notificationDrain") {
    await processQueuedEngineEvents(orchestration);
    return;
  }
  if (jobName === "enrichmentSeed") {
    await seedEnrichmentQueue();
    return;
  }
  if (jobName === "enrichmentBatch") {
    await runEnrichmentBatch();
    return;
  }
  throw new Error(`Unknown job name for remediation: ${jobName}`);
}

export async function tryAutoRemediate(params: {
  incidentId: number;
  jobName: string;
  severity: IncidentSeverity;
}): Promise<string | null> {
  if (params.severity !== "P0" && params.severity !== "P1") return null;

  const correlationId = generateCorrelationId();
  log.warn({ ...params, correlationId }, "Auto-remediation starting");

  try {
    await runJobDirect(params.jobName, correlationId);
    await db
      .update(incidentTickets)
      .set({ status: "auto-remediated", remediationCorrelationId: correlationId })
      .where(eq(incidentTickets.id, params.incidentId));
    log.info({ ...params, correlationId }, "Auto-remediation succeeded");
  } catch (err) {
    log.error({ err, ...params, correlationId }, "Auto-remediation failed — recording attempt");
    await db
      .update(incidentTickets)
      .set({ remediationCorrelationId: correlationId })
      .where(eq(incidentTickets.id, params.incidentId));
  }

  return correlationId;
}
