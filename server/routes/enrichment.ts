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
import { isAuthenticated, isAdmin } from "../auth";
import { resolveTier } from "../utils/tierConfig";
import { enrichLimiter } from "../middleware/rateLimiter";

function requiresPro(req: any, res: any): boolean {
  const tier = resolveTier(req.user?.subscriptionStatus);
  if (!["pro", "unlimited", "enterprise"].includes(tier) && req.user?.role !== "admin") {
    res.status(403).json({ message: "Pro plan required to access company intelligence data." });
    return false;
  }
  return true;
}

export function registerEnrichmentRoutes(app: Express): void {
  // ── GET /api/sponsors/:fingerprint/licence-timeline ──────────────────────────
  // Returns up to 200 historical licence snapshots ordered newest-first.
  // Empty array is a valid response (enrichment pending or no LSUK history found).
  app.get(
    "/api/sponsors/:fingerprint/licence-timeline",
    isAuthenticated,
    async (req: any, res) => {
      if (!requiresPro(req, res)) return;

      const { fingerprint } = req.params;
      try {
        const timeline = await db
          .select()
          .from(sponsorLicenceTimeline)
          .where(eq(sponsorLicenceTimeline.fingerprint, fingerprint))
          .orderBy(desc(sponsorLicenceTimeline.recordedDate))
          .limit(200);

        res.json({ timeline });
      } catch (err) {
        console.error("[EnrichmentRoutes] licence-timeline error:", err);
        res.status(500).json({ message: "Failed to fetch licence timeline." });
      }
    },
  );

  // ── GET /api/sponsors/:fingerprint/company-health ────────────────────────────
  // Returns the enriched Companies House record.
  // Includes a `stale` flag when data is older than 7 days (matches existing TTL logic).
  // Returns { enrichment: null, status: "not_enriched" } when no record exists yet.
  app.get(
    "/api/sponsors/:fingerprint/company-health",
    isAuthenticated,
    async (req: any, res) => {
      if (!requiresPro(req, res)) return;

      const { fingerprint } = req.params;
      try {
        const [enrichment] = await db
          .select()
          .from(sponsorEnrichment)
          .where(eq(sponsorEnrichment.fingerprint, fingerprint))
          .limit(1);

        if (!enrichment) {
          return res.json({ enrichment: null, status: "not_enriched" });
        }

        const ageDays = enrichment.scrapedAt
          ? (Date.now() - new Date(enrichment.scrapedAt).getTime()) / 86_400_000
          : Infinity;

        res.json({
          enrichment,
          status: enrichment.scrapeStatus,
          stale: ageDays > 7,
        });
      } catch (err) {
        console.error("[EnrichmentRoutes] company-health error:", err);
        res.status(500).json({ message: "Failed to fetch company health data." });
      }
    },
  );

  // ── POST /api/sponsors/:fingerprint/enrich ───────────────────────────────────
  // Upserts both job types at priority 10 so this sponsor is processed in the next
  // hourly enrichment batch ahead of the background backfill queue.
  app.post(
    "/api/sponsors/:fingerprint/enrich",
    isAuthenticated,
    enrichLimiter,
    async (req: any, res) => {
      if (!requiresPro(req, res)) return;

      const { fingerprint } = req.params;
      try {
        const [sponsor] = await db
          .select({ fingerprint: sponsorCanonical.fingerprint })
          .from(sponsorCanonical)
          .where(eq(sponsorCanonical.fingerprint, fingerprint))
          .limit(1);

        if (!sponsor) {
          return res.status(404).json({ message: "Sponsor not found." });
        }

        // Upsert both enrichment job types at high priority.
        // ON CONFLICT updates priority and resets status so a stale/failed item
        // gets re-queued immediately rather than waiting for the nightly seed.
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

        res.json({
          queued: true,
          estimatedWait: "Within the next hourly batch (at :15 past the hour)",
        });
      } catch (err) {
        console.error("[EnrichmentRoutes] enrich POST error:", err);
        res.status(500).json({ message: "Failed to queue enrichment." });
      }
    },
  );
}
