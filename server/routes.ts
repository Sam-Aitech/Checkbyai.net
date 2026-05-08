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
import { rebuildSponsorIndex } from "./utils/sponsorSearch";
import { startSponsorMonitorCron, checkAndTriggerIfNeeded } from "./utils/sponsorMonitorJob";
import { startJobAlertScheduler } from "./utils/jobAlertJob";
import { startEnrichmentCron } from "./utils/enrichmentWorker";
import { startCentralScheduler } from "./utils/scheduler";

// Start background schedulers.
// Central scheduler must run first so it can claim any cut-over jobs
// before the inline cron starters check their CUTOVER_* flags.
startCentralScheduler();
startJobAlertScheduler();
startEnrichmentCron();

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  cleanupOldProcessedCheckouts().catch((err) =>
    console.error("[Startup] Failed to clean processed checkouts:", err)
  );

  // Startup catchup: fires 5 minutes after boot to recover from overnight cron failures
  // or server restarts that happened after 00:30 UTC. The advisory lock and idempotency
  // checks inside runSponsorMonitorJob prevent duplicate runs if the cron already fired.
  setTimeout(() => {
    checkAndTriggerIfNeeded(true).catch((err) =>
      console.error("[SponsorMonitor] Startup catchup check failed:", err)
    );
  }, 5 * 60 * 1000);

  // Continue checking every hour as ongoing safety net
  setInterval(() => {
    checkAndTriggerIfNeeded().catch((err) =>
      console.error("[SponsorMonitor] Trigger check failed:", err)
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
  registerEnrichmentRoutes(app);

  rebuildSponsorIndex().catch((err) => {
    console.error("[SponsorSearch] Failed to build initial index:", err);
  });

  startSponsorMonitorCron();

  const httpServer = createServer(app);
  return httpServer;
}
