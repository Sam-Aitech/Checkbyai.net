export interface CallbackConfig {
  maxAttempts: number;
  retryBaseMs: number;
  timeoutMs: number;
}

// Per-job wall-clock budget before the trigger endpoint kills the run.
// Override without code changes by setting BUDGET_<JOB>_MS env vars.
export const JOB_TIMEOUT_MS: Record<string, number> = {
  sponsorMonitorJob: Number(process.env.BUDGET_SPONSOR_MONITOR_MS)   || 25 * 60 * 1000,
  jobAlertJob:       Number(process.env.BUDGET_JOB_ALERT_MS)         || 15 * 60 * 1000,
  enrichmentSeed:    Number(process.env.BUDGET_ENRICHMENT_SEED_MS)   || 10 * 60 * 1000,
  enrichmentBatch:   Number(process.env.BUDGET_ENRICHMENT_BATCH_MS)  || 30 * 60 * 1000,
  notificationDrain: Number(process.env.BUDGET_NOTIFICATION_DRAIN_MS) || 10 * 60 * 1000,
};

// Callback retry policy: exponential backoff.
// base=500ms × 2^(attempt-1): attempt 1=500ms, attempt 2=1000ms, attempt 3=2000ms.
// Override with CALLBACK_MAX_ATTEMPTS / CALLBACK_RETRY_BASE_MS / CALLBACK_TIMEOUT_MS.
export const CALLBACK_CONFIG: CallbackConfig = {
  maxAttempts: Number(process.env.CALLBACK_MAX_ATTEMPTS)  || 3,
  retryBaseMs:  Number(process.env.CALLBACK_RETRY_BASE_MS) || 500,
  timeoutMs:    Number(process.env.CALLBACK_TIMEOUT_MS)    || 10_000,
};
