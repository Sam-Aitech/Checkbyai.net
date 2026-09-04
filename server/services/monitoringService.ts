import { logger } from "../utils/logger";
import { sendViaResend } from "../utils/notificationDispatcher";
import { requireRole } from "../middleware/roleGuard";

// ---------------------------------------------------------------------------
// In-memory metrics store.
// NOTE: These counters are per-process and reset on restart. They are NOT
// shared across multiple instances (Kubernetes pods, PM2 clusters, etc.).
// For production multi-instance deployments, replace with a Redis-backed
// counter or a time-series service (e.g. Prometheus + pushgateway, Datadog).
// The /metrics routes below are gated behind requireRole("admin") and are intentionally
// only registered in non-production environments until a durable store is
// wired up — see registerMonitoringRoutes() for details.
// ---------------------------------------------------------------------------

interface Metrics {
    searchRequests: number;
    searchErrors: number;
    // Running sum used to compute the average without an off-by-one error.
  searchResponseTimeSum: number;
    avgSearchResponseTime: number;
    registrationAttempts: number;
    registrationSuccess: number;
    registrationFailures: number;
    lastAlertSent: Record<string, number>;
}

const metrics: Metrics = {
    searchRequests: 0,
    searchErrors: 0,
    searchResponseTimeSum: 0,
    avgSearchResponseTime: 0,
    registrationAttempts: 0,
    registrationSuccess: 0,
    registrationFailures: 0,
    lastAlertSent: {},
};

// Alert thresholds
const ALERT_THRESHOLDS = {
    searchErrorRate: 0.05,          // 5% error rate triggers alert
    searchResponseTime: 2000,       // 2 s avg response time
    registrationFailureRate: 0.10,  // 10% failure rate
    databaseConnectionFailures: 3,  // 3 consecutive failures
};

// Cooldown periods for alerts (in milliseconds)
const ALERT_COOLDOWN: Record<string, number> = {
    searchErrorRate: 300_000,           // 5 minutes
    searchResponseTime: 300_000,        // 5 minutes
    registrationFailureRate: 300_000,   // 5 minutes
    databaseConnectionFailures: 600_000 // 10 minutes
};

/**
 * Record a search request.
 * Uses a running sum for the response-time average to avoid the off-by-one
 * error that arises when the counter is incremented before the division.
 */
export function recordSearchRequest(success: boolean, responseTimeMs: number): void {
    metrics.searchRequests++;
    if (!success) {
          metrics.searchErrors++;
    }

  // Correct cumulative moving average: accumulate the sum first, then divide.
  metrics.searchResponseTimeSum += responseTimeMs;
    metrics.avgSearchResponseTime = metrics.searchResponseTimeSum / metrics.searchRequests;

  checkSearchAlerts();
}

/**
 * Record a registration attempt.
 */
export function recordRegistrationAttempt(success: boolean): void {
    metrics.registrationAttempts++;
    if (success) {
          metrics.registrationSuccess++;
    } else {
          metrics.registrationFailures++;
    }
    checkRegistrationAlerts();
}

/**
 * Check if search metrics warrant an alert.
 */
function checkSearchAlerts(): void {
    const now = Date.now();

  // Only alert after a meaningful sample size.
  if (metrics.searchRequests >= 20) {
         const errorRate = metrics.searchErrors / metrics.searchRequests;
         if (errorRate > ALERT_THRESHOLDS.searchErrorRate) {
                  if (shouldAlert("searchErrorRate", now)) {
                           sendAlert(
                                       "SEARCH_HIGH_ERROR_RATE",
                                       `Search error rate is ${(errorRate * 100).toFixed(1)}% (${metrics.searchErrors}/${metrics.searchRequests})`
                                     ).catch(err => logger.error({ err }, "Failed to send alert"));
                 }
         }
  }

   if (metrics.avgSearchResponseTime > ALERT_THRESHOLDS.searchResponseTime) {
         if (shouldAlert("searchResponseTime", now)) {
                 sendAlert(
                           "SEARCH_SLOW_RESPONSE_TIME",
                           `Average search response time is ${metrics.avgSearchResponseTime.toFixed(0)}ms`
                         ).catch(err => logger.error({ err }, "Failed to send alert"));
         }
   }
}

/**
 * Check if registration metrics warrant an alert.
 */
function checkRegistrationAlerts(): void {
    const now = Date.now();

  if (metrics.registrationAttempts >= 10) {
         const failureRate = metrics.registrationFailures / metrics.registrationAttempts;
         if (failureRate > ALERT_THRESHOLDS.registrationFailureRate) {
                 if (shouldAlert("registrationFailureRate", now)) {
                           sendAlert(
                                       "HIGH_REGISTRATION_FAILURE_RATE",
                                       `Registration failure rate is ${(failureRate * 100).toFixed(1)}% (${metrics.registrationFailures}/${metrics.registrationAttempts})`
                                     ).catch(err => logger.error({ err }, "Failed to send alert"));
                 }
         }
  }
}

/**
 * Check if we should send an alert based on cooldown.
 */
function shouldAlert(alertType: string, now: number): boolean {
    const lastSent = metrics.lastAlertSent[alertType] || 0;
    const cooldown = ALERT_COOLDOWN[alertType] ?? 300_000;
    return now - lastSent > cooldown;
}

/**
 * Send an alert via Resend email.
 */
async function sendAlert(alertType: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    metrics.lastAlertSent[alertType] = Date.now();

  // Use structured logger only — no bare console.log in production.
  logger.warn({ alertType, message, timestamp }, `[ALERT] ${alertType}: ${message}`);

  // Send via Resend email
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      logger.warn({ alertType }, 'ADMIN_EMAIL not configured - skipping alert email');
      return;
    }

    const emailSubject = `[CheckByAI Alert] ${alertType}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #dc3545; margin-top: 0;">CheckByAI System Alert</h2>
          <p><strong>Alert Type:</strong> ${alertType}</p>
          <p><strong>Message:</strong> ${message}</p>
          <p><strong>Timestamp:</strong> ${timestamp}</p>
        </div>
        <div style="margin-top: 20px; font-size: 12px; color: #6c757d;">
          This is an automated alert from your CheckByAI Sponsor Monitor system.
        </div>
      </div>
    `;

    await sendViaResend(adminEmail, emailSubject, emailHtml);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 
                  `[MonitoringService] Failed to send alert email`);
  }
}

/**
 * Get a snapshot of current in-memory metrics.
 */
export function getMetrics(): Omit<Metrics, "lastAlertSent"> & { lastAlertSent: Record<string, number> } {
    return { ...metrics };
}

/**
 * Reset all in-memory metrics counters (useful for testing).
 */
export function resetMetrics(): void {
    metrics.searchRequests = 0;
    metrics.searchErrors = 0;
    metrics.searchResponseTimeSum = 0;
    metrics.avgSearchResponseTime = 0;
    metrics.registrationAttempts = 0;
    metrics.registrationSuccess = 0;
    metrics.registrationFailures = 0;
}

/**
 * Register internal monitoring routes.
 *
 * SECURITY: Both routes are protected by requireRole("admin") middleware.
 *
 * PRODUCTION NOTE: These routes expose in-memory counters that are
 * per-process and non-durable. In production they are disabled by default.
 * Set ENABLE_ADMIN_METRICS_ROUTES=true to opt in.
 */
export function registerMonitoringRoutes(app: any): void {
  const isProd = process.env.NODE_ENV === "production";
  const metricsEnabled = process.env.ENABLE_ADMIN_METRICS_ROUTES === "true";

  if (isProd && !metricsEnabled) {
    logger.warn(
      {},
      "[Monitoring] In-memory /metrics routes are DISABLED in production. " +
      "Set ENABLE_ADMIN_METRICS_ROUTES=true to enable."
    );
    return;
  }

   // GET /metrics — admin-only, returns current in-memory counters.
   app.get("/metrics", requireRole("admin"), (_req: any, res: any) => {
         res.json({
                 metrics: getMetrics(),
                 timestamp: new Date().toISOString(),
                 thresholds: ALERT_THRESHOLDS,
                 warning: "In-memory counters only — not shared across instances and reset on restart.",
         });
   });

   // POST /metrics/reset — admin-only, resets all counters.
   app.post("/metrics/reset", requireRole("admin"), (_req: any, res: any) => {
         resetMetrics();
         res.json({ message: "Metrics reset successfully", timestamp: new Date().toISOString() });
   });

   // GET /metrics/perf — admin-only percentile snapshot: per-route latency
   // (p50/p95/p99), event-loop delay, heap, and BullMQ queue wait/service
   // timings. Per-process reservoirs; reset via POST /metrics/perf/reset.
   // Used by scripts/load for before/after evidence runs.
   app.get("/metrics/perf", requireRole("admin"), async (_req: any, res: any) => {
         const { getPerfSnapshot } = await import("../utils/perfMonitor");
         const { getQueueCounts } = await import("./jobQueue");
         res.json({
                 perf: getPerfSnapshot(),
                 queues: await getQueueCounts(),
                 warning: "Per-process reservoirs — run load against a single instance and reset before each run.",
         });
   });

   app.post("/metrics/perf/reset", requireRole("admin"), async (_req: any, res: any) => {
         const { resetPerfMonitor } = await import("../utils/perfMonitor");
         resetPerfMonitor();
         res.json({ message: "Perf reservoirs reset", timestamp: new Date().toISOString() });
   });
}
