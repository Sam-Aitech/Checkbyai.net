import { logger } from "../utils/logger";
import { isAdmin } from "../auth";

// ---------------------------------------------------------------------------
// In-memory metrics store.
// NOTE: These counters are per-process and reset on restart. They are NOT
// shared across multiple instances (Kubernetes pods, PM2 clusters, etc.).
// For production multi-instance deployments, replace with a Redis-backed
// counter or a time-series service (e.g. Prometheus + pushgateway, Datadog).
// The /metrics routes below are gated behind isAdmin and are intentionally
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
                                    );
                }
        }
  }

  if (metrics.avgSearchResponseTime > ALERT_THRESHOLDS.searchResponseTime) {
        if (shouldAlert("searchResponseTime", now)) {
                sendAlert(
                          "SEARCH_SLOW_RESPONSE_TIME",
                          `Average search response time is ${metrics.avgSearchResponseTime.toFixed(0)}ms`
                        );
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
                                      "REGISTRATION_HIGH_FAILURE_RATE",
                                      `Registration failure rate is ${(failureRate * 100).toFixed(1)}% (${metrics.registrationFailures}/${metrics.registrationAttempts})`
                                    );
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
 * Send an alert (in production, integrate with email/SMS/Slack/PagerDuty).
 */
function sendAlert(alertType: string, message: string): void {
    const timestamp = new Date().toISOString();
    metrics.lastAlertSent[alertType] = Date.now();

  // Use structured logger only — no bare console.log in production.
  logger.warn({ alertType, message, timestamp }, `[ALERT] ${alertType}: ${message}`);

  // TODO: wire up a real notification channel before enabling in production:
  //   - Email service (Resend / Brevo)
  //   - SMS service (Twilio)
  //   - Slack webhook
  //   - PagerDuty
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
 * SECURITY: Both routes are protected by isAdmin middleware.
 *
 * PRODUCTION NOTE: These routes expose in-memory counters that are
 * per-process and non-durable. They are only registered outside of
 * production (NODE_ENV !== 'production') until a durable, multi-instance
 * metrics backend is in place. In production, disable these routes and use
 * a dedicated observability platform (Prometheus, Datadog, etc.).
 */
export function registerMonitoringRoutes(app: any): void {
    const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
        logger.warn(
          {},
                "[Monitoring] In-memory /metrics routes are DISABLED in production. " +
                "Wire up a durable metrics backend before re-enabling."
              );
        return;
  }

  // GET /metrics — admin-only, returns current in-memory counters.
  app.get("/metrics", isAdmin, (_req: any, res: any) => {
        res.json({
                metrics: getMetrics(),
                timestamp: new Date().toISOString(),
                thresholds: ALERT_THRESHOLDS,
                warning: "In-memory counters only — not shared across instances and reset on restart.",
        });
  });

  // POST /metrics/reset — admin-only, resets all counters.
  app.post("/metrics/reset", isAdmin, (_req: any, res: any) => {
        resetMetrics();
        res.json({ message: "Metrics reset successfully", timestamp: new Date().toISOString() });
  });
}
