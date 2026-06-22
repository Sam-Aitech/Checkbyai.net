import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { registerHealthRoutes } from "./routes/health";
import { registerSeoRoutes } from "./routes/seo";
import { registerAuthRoutes } from "./routes/auth";
import { registerBillingRoutes, cleanupOldProcessedCheckouts } from "./routes/billing";
import { registerVerificationRoutes } from "./routes/verification";
import { registerSponsorRoutes } from "./routes/sponsors";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerStatsRoutes } from "./routes/stats";
import { registerAdminRoutes } from "./routes/admin";
import { registerSupportRoutes } from "./routes/support";
import { registerEnrichmentRoutes } from "./routes/enrichment";
import { registerOpsRoutes } from "./routes/ops";
import { registerSponsorPageRoutes } from "./routes/sponsorPages";
import { registerFeedbackRoutes } from "./routes/feedback";
import { registerPushSubscriptionRoutes } from "./routes/pushSubscriptions";
import { rebuildSponsorIndex } from "./utils/sponsorSearch";
import { startSponsorMonitorCron, checkAndTriggerIfNeeded } from "./utils/sponsorMonitorJob";
import { startJobAlertScheduler } from "./utils/jobAlertJob";
import { startEnrichmentCron } from "./utils/enrichmentWorker";
import { logger } from "./utils/logger";
import { startCentralScheduler } from "./utils/scheduler";
import { initSocketGateway } from "./services/socketGateway";

// Start background schedulers.
// Central scheduler must run first so it can claim any cut-over jobs
// before the inline cron starters check their CUTOVER_* flags.
startCentralScheduler();
startJobAlertScheduler();
startEnrichmentCron();

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  cleanupOldProcessedCheckouts().catch((err) =>
    logger.error({ err }, "[Startup] Failed to clean processed checkouts:")
  );

  // Startup catchup: fires 5 minutes after boot to recover from overnight cron failures
  // or server restarts that happened after 00:30 UTC. The table-backed lock and idempotency
  // checks inside runSponsorMonitorJob prevent duplicate runs if the cron already fired.
  setTimeout(() => {
    checkAndTriggerIfNeeded(true).catch((err) =>
      logger.error({ err }, "[SponsorMonitor] Startup catchup check failed:")
    );
  }, 5 * 60 * 1000);

  // Continue checking every hour as ongoing safety net
  setInterval(() => {
    checkAndTriggerIfNeeded().catch((err) =>
      logger.error({ err }, "[SponsorMonitor] Trigger check failed:")
    );
  }, 60 * 60 * 1000);

  registerHealthRoutes(app);
  registerSeoRoutes(app);
  registerAuthRoutes(app);
  registerBillingRoutes(app);
  registerVerificationRoutes(app);
  registerSponsorRoutes(app);
  registerSponsorPageRoutes(app);
  registerNotificationRoutes(app);
  registerStatsRoutes(app);
  registerAdminRoutes(app);
  registerOpsRoutes(app);
  registerSupportRoutes(app);
  registerFeedbackRoutes(app);
  registerPushSubscriptionRoutes(app);
  registerEnrichmentRoutes(app);

  rebuildSponsorIndex().catch((err) => {
    logger.error({ err }, "[SponsorSearch] Failed to build initial index:");
  });

  startSponsorMonitorCron();

  const httpServer = createServer(app);
  initSocketGateway(httpServer);
  return httpServer;
}
