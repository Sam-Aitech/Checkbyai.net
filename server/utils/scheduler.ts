/**
 * Central scheduler — Phase 4 Controlled Cutover
 *
 * Owns all cron registrations after each job is cut over from its inline cron.
 * Each job has a dedicated CUTOVER_<JOBNAME> env flag (default: "false").
 * Rollback = set the flag to "false"; the inline cron in the job file
 * resumes ownership immediately on the next server restart.
 *
 * Cutover order (lowest → highest blast radius):
 *   1. notificationDrain  — hourly
 *   2. enrichmentBatch    — hourly :15
 *   3. enrichmentSeed     — daily 02:00 UTC
 *   4. jobAlertJob        — daily 02:00 UTC Mon-Fri
 *   5. sponsorMonitorJob  — daily 00:30 UTC Mon-Fri  (highest risk, cut last)
 */

import cron from "node-cron";
import { processQueuedEngineEvents } from "../services/notificationEngine";
import { runEnrichmentBatch, seedEnrichmentQueue } from "./enrichmentWorker";
import { runJobAlertJob } from "./jobAlertJob";
import { runSponsorMonitorJob } from "./sponsorMonitorJob";
import { runConsolidatedNotificationJob } from "../services/consolidatedNotificationEngine";
import { finishJobRun, startJobRun } from "./jobTelemetry";
import { logger } from "./logger";

const log = logger.child({ module: "Scheduler" });

// ── Cutover flags ──────────────────────────────────────────────────────────────

function isCutover(jobKey: string): boolean {
  const val = (process.env[`CUTOVER_${jobKey}`] ?? "false").trim().toLowerCase();
  return val === "true" || val === "1";
}

export type CutoverJobKey =
  | "NOTIFICATION_DRAIN"
  | "ENRICHMENT_BATCH"
  | "ENRICHMENT_SEED"
  | "JOB_ALERT"
  | "SPONSOR_MONITOR"
  | "CONSOLIDATED_NOTIFICATIONS";

export interface CutoverStatus {
  job: CutoverJobKey;
  cutover: boolean;
  schedule: string;
  owner: "central-scheduler" | "inline-cron";
}

const JOB_SCHEDULES: Record<CutoverJobKey, string> = {
  NOTIFICATION_DRAIN: "0 * * * *",
  ENRICHMENT_BATCH: "15 * * * *",
  ENRICHMENT_SEED: "0 2 * * *",
  JOB_ALERT: "0 2 * * 1-5",
  SPONSOR_MONITOR: "30 0 * * 1-5",
  CONSOLIDATED_NOTIFICATIONS: "0 7,19 * * *", // Run at 7:00 AM and 7:00 PM
};

export function getCutoverStatusSnapshot(): CutoverStatus[] {
  return (Object.keys(JOB_SCHEDULES) as CutoverJobKey[]).map((key) => {
    const cutover = isCutover(key);
    return {
      job: key,
      cutover,
      schedule: JOB_SCHEDULES[key],
      owner: cutover ? "central-scheduler" : "inline-cron",
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function runWithTelemetry(
  jobName: string,
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  const t = startJobRun(jobName as any, "cron", "inline");
  let result: "success" | "failed" = "success";
  let failureReason: string | null = null;
  try {
    await fn();
    log.info({ jobName }, `${label} complete.`);
  } catch (err) {
    result = "failed";
    failureReason = err instanceof Error ? err.message : String(err);
    log.error({ err, jobName }, `${label} failed.`);
  } finally {
    finishJobRun({ ...t, jobName, triggerSource: "cron", runMode: "inline", result, failureReason });
  }
}

// ── Scheduler bootstrap ────────────────────────────────────────────────────────

export function startCentralScheduler(): void {
  const opts = { timezone: "UTC" };

  if (isCutover("NOTIFICATION_DRAIN")) {
    cron.schedule(JOB_SCHEDULES.NOTIFICATION_DRAIN, () => {
      log.info("Central scheduler: notificationDrain firing.");
      runWithTelemetry("notificationDrain", "Notification drain", () =>
        processQueuedEngineEvents({ triggerSource: "cron" }),
      ).catch((err) => log.error({ err }, "notificationDrain outer error."));
    }, opts);
    log.info("Central scheduler: NOTIFICATION_DRAIN registered (0 * * * * UTC).");
  }

  if (isCutover("ENRICHMENT_BATCH")) {
    cron.schedule(JOB_SCHEDULES.ENRICHMENT_BATCH, () => {
      log.info("Central scheduler: enrichmentBatch firing.");
      runWithTelemetry("enrichmentBatch", "Enrichment batch", () =>
        runEnrichmentBatch(),
      ).catch((err) => log.error({ err }, "enrichmentBatch outer error."));
    }, opts);
    log.info("Central scheduler: ENRICHMENT_BATCH registered (15 * * * * UTC).");
  }

  if (isCutover("ENRICHMENT_SEED")) {
    cron.schedule(JOB_SCHEDULES.ENRICHMENT_SEED, () => {
      log.info("Central scheduler: enrichmentSeed firing.");
      runWithTelemetry("enrichmentSeed", "Enrichment seed", () =>
        seedEnrichmentQueue().then((r) => { log.info(r, "Seed result."); }),
      ).catch((err) => log.error({ err }, "enrichmentSeed outer error."));
    }, opts);
    log.info("Central scheduler: ENRICHMENT_SEED registered (0 2 * * * UTC).");
  }

  if (isCutover("JOB_ALERT")) {
    cron.schedule(JOB_SCHEDULES.JOB_ALERT, () => {
      log.info("Central scheduler: jobAlertJob firing.");
      runWithTelemetry("jobAlertJob", "Job alert", () =>
        runJobAlertJob({ triggerSource: "cron" }),
      ).catch((err) => log.error({ err }, "jobAlertJob outer error."));
    }, opts);
    log.info("Central scheduler: JOB_ALERT registered (0 2 * * 1-5 UTC).");
  }

  if (isCutover("SPONSOR_MONITOR")) {
    cron.schedule(JOB_SCHEDULES.SPONSOR_MONITOR, () => {
      log.info("Central scheduler: sponsorMonitorJob firing.");
      runSponsorMonitorJob("cron").catch((err) =>
        log.error({ err }, "sponsorMonitorJob outer error."),
      );
    }, opts);
    log.info("Central scheduler: SPONSOR_MONITOR registered (30 0 * * 1-5 UTC).");
  }

  if (isCutover("CONSOLIDATED_NOTIFICATIONS")) {
    cron.schedule(JOB_SCHEDULES.CONSOLIDATED_NOTIFICATIONS, () => {
      log.info("Central scheduler: CONSOLIDATED_NOTIFICATIONS firing.");
      runWithTelemetry("consolidatedNotifications", "Consolidated notifications digest", () =>
        runConsolidatedNotificationJob(),
      ).catch((err) => log.error({ err }, "consolidatedNotifications outer error."));
    }, opts);
    log.info("Central scheduler: CONSOLIDATED_NOTIFICATIONS registered (0 7,19 * * * UTC).");
  }

  const active = getCutoverStatusSnapshot().filter((s) => s.cutover).map((s) => s.job);
  if (active.length === 0) {
    log.info("Central scheduler started: no jobs cut over yet (all inline-cron owned).");
  } else {
    log.info({ active }, `Central scheduler started: ${active.length} job(s) cut over.`);
  }
}
