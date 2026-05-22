/**
 * Pro Enrichment Routes
 * =====================
 * All endpoints require authentication. Pro plan (or admin) required.
 *
 * GET  /api/sponsors/:fingerprint/licence-timeline
 *   Returns the historical licence timeline for a sponsor.
 *   Powers the "Historical Licence Timeline" interactive chart on the Pro dashboard.
 *
 * GET  /api/sponsors/:fingerprint/company-health
 *   Returns the full Companies House enrichment record.
 *   Powers the "Company Health" metrics panel on the Pro dashboard.
 *
 * POST /api/sponsors/:fingerprint/enrich
 *   Priority-queues a sponsor for immediate enrichment (priority=10, jumps the queue).
 *   Used when a Pro user views an unenriched company profile.
 */

import type { Express } from "express";
import { db } from "../db";
import {
  sponsorEnrichment,
  sponsorLicenceTimeline,
  enrichmentQueue,
  sponsorCanonical,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { resolveTier } from "../utils/tierConfig";
import { enrichLimiter } from "../middleware/rateLimiter";
import { success, fail } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";

function requiresPro(req: any): void {
  const tier = resolveTier(req.user?.subscriptionStatus);
  if (!["pro", "unlimited", "enterprise"].includes(tier) && req.user?.role !== "admin") {
    throw new ApiError(403, "Pro plan required to access company intelligence data.");
  }
}

export function registerEnrichmentRoutes(app: Express): void {
  app.get(
    "/api/sponsors/:fingerprint/licence-timeline",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      requiresPro(req);

      const { fingerprint } = req.params;
      const timeline = await db
        .select()
        .from(sponsorLicenceTimeline)
        .where(eq(sponsorLicenceTimeline.fingerprint, fingerprint))
        .orderBy(desc(sponsorLicenceTimeline.recordedDate))
        .limit(200);

      success(res, { timeline });
    }),
  );

  app.get(
    "/api/sponsors/:fingerprint/company-health",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      requiresPro(req);

      const { fingerprint } = req.params;
      const [enrichment] = await db
        .select()
        .from(sponsorEnrichment)
        .where(eq(sponsorEnrichment.fingerprint, fingerprint))
        .limit(1);

      if (!enrichment) {
        success(res, { enrichment: null, status: "not_enriched" });
        return;
      }

      const ageDays = enrichment.scrapedAt
        ? (Date.now() - new Date(enrichment.scrapedAt).getTime()) / 86_400_000
        : Infinity;

      success(res, {
        enrichment,
        status: enrichment.scrapeStatus,
        stale: ageDays > 7,
      });
    }),
  );

  app.post(
    "/api/sponsors/:fingerprint/enrich",
    isAuthenticated,
    enrichLimiter,
    asyncHandler(async (req: any, res) => {
      requiresPro(req);

      const { fingerprint } = req.params;
      const [sponsor] = await db
        .select({ fingerprint: sponsorCanonical.fingerprint })
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.fingerprint, fingerprint))
        .limit(1);

      if (!sponsor) {
        throw new ApiError(404, "Sponsor not found.");
      }

      await db
        .insert(enrichmentQueue)
        .values([
          {
            fingerprint,
            jobType: "companies_house",
            priority: 10,
            status: "pending",
            nextAttemptAt: new Date(),
          },
          {
            fingerprint,
            jobType: "licence_history",
            priority: 10,
            status: "pending",
            nextAttemptAt: new Date(),
          },
        ])
        .onConflictDoUpdate({
          target: [enrichmentQueue.fingerprint, enrichmentQueue.jobType],
          set: {
            priority: 10,
            status: "pending",
            nextAttemptAt: new Date(),
            updatedAt: new Date(),
          },
        });

      success(res, {
        queued: true,
        estimatedWait: "Within the next hourly batch (at :15 past the hour)",
      });
    }),
  );
}
