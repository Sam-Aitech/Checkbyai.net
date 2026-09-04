import type { Express } from "express";
import { registerPatternsController } from "./admin/patterns.controller";
import { registerVerificationsController } from "./admin/verifications.controller";
import { registerSponsorMonitorController } from "./admin/sponsorMonitor.controller";
import { registerUsersController } from "./admin/users.controller";
import { registerSystemController } from "./admin/system.controller";
import { registerPaidController } from "./admin/paid.controller";
import { registerNotificationsController } from "./admin/notifications.controller";

export function registerAdminRoutes(app: Express): void {
  registerPatternsController(app);
  registerVerificationsController(app);
  registerSponsorMonitorController(app);
  registerUsersController(app);
  registerSystemController(app);
  registerPaidController(app);
  registerNotificationsController(app);
}
