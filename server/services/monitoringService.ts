import { logger } from "../utils/logger";

// In-memory metrics store (in production, use Redis or time-series DB)
interface Metrics {
  searchRequests: number;
  searchErrors: number;
  avgSearchResponseTime: number;
  registrationAttempts: number;
  registrationSuccess: number;
  registrationFailures: number;
  lastAlertSent: Record<string, number>;
}

const metrics: Metrics = {
  searchRequests: 0,
  searchErrors: 0,
  avgSearchResponseTime: 0,
  registrationAttempts: 0,
  registrationSuccess: 0,
  registrationFailures: 0,
  lastAlertSent: {}
};

// Alert thresholds
const ALERT_THRESHOLDS = {
  searchErrorRate: 0.05, // 5% error rate triggers alert
  searchResponseTime: 2000, // 2s avg response time
  registrationFailureRate: 0.10, // 10% failure rate
  databaseConnectionFailures: 3 // 3 consecutive failures
};

// Cooldown periods for alerts (in milliseconds)
const ALERT_COOLDOWN = {
  searchErrorRate: 300000, // 5 minutes
  searchResponseTime: 300000, // 5 minutes
  registrationFailureRate: 300000, // 5 minutes
  databaseConnectionFailures: 600000 // 10 minutes
};

/**
 * Record a search request
 */
export function recordSearchRequest(success: boolean, responseTimeMs: number): void {
  metrics.searchRequests++;
  if (!success) {
    metrics.searchErrors++;
  }
  
  // Update rolling average response time
  metrics.avgSearchResponseTime = 
    (metrics.avgSearchResponseTime * (metrics.searchRequests - 1) + responseTimeMs) / metrics.searchRequests;
  
  // Check if we should trigger an alert
  checkSearchAlerts();
}

/**
 * Record a registration attempt
 */
export function recordRegistrationAttempt(success: boolean): void {
  metrics.registrationAttempts++;
  if (success) {
    metrics.registrationSuccess++;
  } else {
    metrics.registrationFailures++;
  }
  
  // Check if we should trigger an alert
  checkRegistrationAlerts();
}

/**
 * Check if search metrics warrant an alert
 */
function checkSearchAlerts(): void {
  const now = Date.now();
  
  // Check search error rate
  if (metrics.searchRequests >= 20) { // Only alert after meaningful sample
    const errorRate = metrics.searchErrors / metrics.searchRequests;
    if (errorRate > ALERT_THRESHOLDS.searchErrorRate) {
      if (shouldAlert('searchErrorRate', now)) {
        sendAlert('SEARCH_HIGH_ERROR_RATE', 
          `Search error rate is ${(errorRate * 100).toFixed(1)}% (${metrics.searchErrors}/${metrics.searchRequests})`);
      }
    }
  }
  
  // Check search response time
  if (metrics.avgSearchResponseTime > ALERT_THRESHOLDS.searchResponseTime) {
    if (shouldAlert('searchResponseTime', now)) {
      sendAlert('SEARCH_SLOW_RESPONSE_TIME',
        `Average search response time is ${metrics.avgSearchResponseTime.toFixed(0)}ms`);
    }
  }
}

/**
 * Check if registration metrics warrant an alert
 */
function checkRegistrationAlerts(): void {
  const now = Date.now();
  
  // Check registration failure rate
  if (metrics.registrationAttempts >= 10) { // Only alert after meaningful sample
    const failureRate = metrics.registrationFailures / metrics.registrationAttempts;
    if (failureRate > ALERT_THRESHOLDS.registrationFailureRate) {
      if (shouldAlert('registrationFailureRate', now)) {
        sendAlert('REGISTRATION_HIGH_FAILURE_RATE',
          `Registration failure rate is ${(failureRate * 100).toFixed(1)}% (${metrics.registrationFailures}/${metrics.registrationAttempts})`);
      }
    }
  }
}

/**
 * Check if we should send an alert based on cooldown
 */
function shouldAlert(alertType: string, now: number): boolean {
  const lastSent = metrics.lastAlertSent[alertType] || 0;
  const cooldown = ALERT_COOLDOWN[alertType] || 300000; // Default 5 minutes
  
  return now - lastSent > cooldown;
}

/**
 * Send an alert (in production, integrate with email/SMS/Slack)
 */
function sendAlert(alertType: string, message: string): void {
  const timestamp = new Date().toISOString();
  const alertMessage = `[ALERT] ${alertType}: ${message} at ${timestamp}`;
  
  // Log the alert
  logger.warn({ alertType, message }, alertMessage);
  
  // Update last sent time
  metrics.lastAlertSent[alertType] = Date.now();
  
  // In production, you would integrate with:
  // - Email service (Resend/Brevo)
  // - SMS service (Twilio) 
  // - Slack webhook
  // - PagerDuty
  // - etc.
  
  console.log(alertMessage); // For development visibility
}

/**
 * Get current metrics for reporting
 */
export function getMetrics(): Metrics {
  return { ...metrics };
}

/**
 * Reset metrics (useful for testing or periodic reset)
 */
export function resetMetrics(): void {
  metrics.searchRequests = 0;
  metrics.searchErrors = 0;
  metrics.avgSearchResponseTime = 0;
  metrics.registrationAttempts = 0;
  metrics.registrationSuccess = 0;
  metrics.registrationFailures = 0;
}

/**
 * Health check endpoint for monitoring service
 */
export function registerMonitoringRoutes(app: any): void {
  app.get('/metrics', (req, res) => {
    res.json({
      metrics: getMetrics(),
      timestamp: new Date().toISOString(),
      thresholds: ALERT_THRESHOLDS
    });
  });
  
  app.post('/metrics/reset', (req, res) => {
    resetMetrics();
    res.json({ message: 'Metrics reset successfully' });
  });
}