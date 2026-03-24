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
import { rebuildSponsorIndex } from "./utils/sponsorSearch";
import { startSponsorMonitorCron, checkAndTriggerIfNeeded } from "./utils/sponsorMonitorJob";
import { startJobAlertScheduler } from "./utils/jobAlertJob";

// Start background schedulers
startJobAlertScheduler();

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  cleanupOldProcessedCheckouts().catch((err) =>
    console.error("[Startup] Failed to clean processed checkouts:", err)
  );

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
  registerNotificationRoutes(app);
  registerStatsRoutes(app);
  registerAdminRoutes(app);

  rebuildSponsorIndex().catch((err) => {
    console.error("[SponsorSearch] Failed to build initial index:", err);
  });

  startSponsorMonitorCron();

  const httpServer = createServer(app);
  return httpServer;
}
