import type { Express, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errorHandler";
import { success } from "../lib/response";
import { recordRum } from "../utils/perfMonitor";
import rateLimit from "express-rate-limit";
import { logger } from "../utils/logger";

const rumLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const rumSchema = z.object({
  name: z.enum(["CLS", "INP", "FCP", "LCP", "TTFB"]),
  value: z.number().finite().nonnegative().max(3600000),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
  url: z.string().max(500).optional(),
});

export function registerRumRoutes(app: Express): void {
  app.post("/api/rum", rumLimiter, asyncHandler(async (req: Request, res: Response) => {
    const parsed = rumSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues.length }, "[RUM] Rejected invalid beacon");
      success(res, { accepted: false });
      return;
    }
    recordRum(parsed.data.name, parsed.data.value);
    success(res, { accepted: true });
  }));
}
