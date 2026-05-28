import type { Express } from "express";
import { db } from "../db";
import { sql, eq, inArray, desc, and } from "drizzle-orm";
import { sponsorCanonical, sponsorChanges, sponsorEnrichment, dailyDigest, monitorJobRuns } from "@shared/schema";
import { cacheGet, cacheSet } from "../utils/redisClient";
import { getAppUrl } from "../utils/appUrl";
import { ensureIndexReady, getIndexData, type SearchIndexEntry } from "../utils/sponsorSearch";
import rateLimit from "express-rate-limit";
import { success } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";

/** Wrap a CSV field value in quotes if it contains commas, quotes, or newlines. */
function csvEscape(val: string): string {
  if (!val) return "";
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// 5 CSV downloads per hour per IP — it's a heavy full-table scan.
const csvRateLimit = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many CSV downloads. Please wait before downloading again.",
});

/** URL-safe slug from a display string — used to build readable /sponsor/{id}/{slug} URLs. */
export function toSlug(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip diacritics
    .replace(/[^a-z0-9\s]/g, "")      // keep only alphanumeric + spaces
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-+$/, "")
    .slice(0, 80);
}

const SITEMAP_PAGE_SIZE = 45_000;

export function registerSponsorPageRoutes(app: Express): void {

  // ── Sponsor detail JSON API ───────────────────────────────────────────────
  // Public — no auth required. Cached 1 hr in Redis.
  app.get("/api/sponsors/detail/:id", asyncHandler(async (req: any, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      throw new ApiError(400, "Invalid sponsor ID.");
    }

    const cacheKey = `sponsors:detail:${id}`;
    const cached = await cacheGet<object>(cacheKey);
    if (cached) {
      success(res, cached);
      return;
    }

    const [sponsor] = await db
      .select()
      .from(sponsorCanonical)
      .where(eq(sponsorCanonical.id, id))
      .limit(1);

    if (!sponsor) throw new ApiError(404, "Sponsor not found.");

    const [recentChanges, countResult, enrichmentRows] = await Promise.all([
      db
        .select({
          changeType:    sponsorChanges.changeType,
          snapshotDate:  sponsorChanges.snapshotDate,
          previousValue: sponsorChanges.previousValue,
          newValue:      sponsorChanges.newValue,
          detectedAt:    sponsorChanges.detectedAt,
        })
        .from(sponsorChanges)
        .where(eq(sponsorChanges.fingerprint, sponsor.fingerprint))
        .orderBy(desc(sponsorChanges.detectedAt))
        .limit(3),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(sponsorChanges)
        .where(eq(sponsorChanges.fingerprint, sponsor.fingerprint)),
      db
        .select()
        .from(sponsorEnrichment)
        .where(eq(sponsorEnrichment.fingerprint, sponsor.fingerprint))
        .limit(1),
    ]);

    const totalChanges = countResult[0]?.total ?? 0;
    const rawEnrichment = enrichmentRows[0];
    const enrichment = (rawEnrichment?.scrapeStatus === "done") ? rawEnrichment : null;

    const payload = { ...sponsor, recentChanges, totalChanges, enrichment };
    await cacheSet(cacheKey, payload, 3600);
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=7200");
    success(res, payload);
  }));

  // ── Sponsor sitemap index ─────────────────────────────────────────────────
  // Points to /sitemap-sponsors-0.xml, /sitemap-sponsors-1.xml, …
  app.get("/sitemap-sponsors.xml", asyncHandler(async (_req: any, res) => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sponsorCanonical)
      .where(inArray(sponsorCanonical.status, ["ACTIVE", "NEWLY_GRANTED"]));

    const pages = Math.max(1, Math.ceil(count / SITEMAP_PAGE_SIZE));
    const today = new Date().toISOString().split("T")[0];
    const base = getAppUrl();

    const entries = Array.from({ length: pages }, (_, i) =>
      `  <sitemap>\n    <loc>${base}/sitemap-sponsors-${i}.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`
    ).join("\n");

    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=43200");
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${entries}\n` +
      `</sitemapindex>`
    );
  }));

  // ── Per-page sponsor sitemap ──────────────────────────────────────────────
  // Each page covers 45k sponsors. Served with 12hr HTTP cache.
  app.get("/sitemap-sponsors-:page.xml", asyncHandler(async (req: any, res) => {
    const page = parseInt(req.params.page, 10);
    if (isNaN(page) || page < 0 || page > 99) {
      res.status(400).send("Invalid page");
      return;
    }

    const offset = page * SITEMAP_PAGE_SIZE;
    const today = new Date().toISOString().split("T")[0];
    const base = getAppUrl();

    const sponsors = await db
      .select({
        id:          sponsorCanonical.id,
        currentName: sponsorCanonical.currentName,
        lastSeen:    sponsorCanonical.lastSeen,
      })
      .from(sponsorCanonical)
      .where(inArray(sponsorCanonical.status, ["ACTIVE", "NEWLY_GRANTED"]))
      .orderBy(sponsorCanonical.id)
      .limit(SITEMAP_PAGE_SIZE)
      .offset(offset);

    if (sponsors.length === 0) {
      res.status(404).send("No sponsors for this page");
      return;
    }

    const entries = sponsors
      .map((s) => {
        const slug = toSlug(s.currentName);
        return (
          `  <url>\n` +
          `    <loc>${base}/sponsor/${s.id}/${slug}</loc>\n` +
          `    <lastmod>${s.lastSeen || today}</lastmod>\n` +
          `    <changefreq>weekly</changefreq>\n` +
          `    <priority>0.6</priority>\n` +
          `  </url>`
        );
      })
      .join("\n");

    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=43200");
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${entries}\n` +
      `</urlset>`
    );
  }));

  // ── Client-side instant search index ────────────────────────────────────
  // Returns a compact JSON array used by the browser for zero-latency search.
  // Backed by the same in-memory Fuse.js dataset — no extra DB query when warm.
  // The gzip compression middleware (level 6) reduces ~10MB → ~1.5MB in transit.
  // Cached 12hr in Redis + HTTP (CDN-friendly). Invalidated on nightly index rebuild.
  app.get("/api/sponsors/search-index.json", asyncHandler(async (_req: any, res) => {
    const cacheKey = "sponsors:search-index-json";
    const cached = await cacheGet<SearchIndexEntry[]>(cacheKey);
    if (cached) {
      res.set("Content-Type", "application/json");
      res.set("Cache-Control", "public, max-age=43200, stale-while-revalidate=86400");
      success(res, cached);
      return;
    }

    await ensureIndexReady();
    const data = getIndexData();
    await cacheSet(cacheKey, data, 43200);
    res.set("Content-Type", "application/json");
    res.set("Cache-Control", "public, max-age=43200, stale-while-revalidate=86400");
    success(res, data);
  }));

  // ── Recently revoked ─────────────────────────────────────────────────────
  // Public feed of the 7 most recently revoked sponsors. Used by the homepage
  // "Recently Revoked" widget. Cached 1 hr — flushed by nightly monitor job.
  app.get("/api/sponsors/recently-revoked", asyncHandler(async (_req: any, res) => {
    const cacheKey = "sponsors:recently-revoked";
    const cached = await cacheGet<object[]>(cacheKey);
    if (cached) {
      success(res, cached);
      return;
    }

    const sponsors = await db
      .select({
        id:          sponsorCanonical.id,
        currentName: sponsorCanonical.currentName,
        townCity:    sponsorCanonical.townCity,
        route:       sponsorCanonical.route,
        removedAt:   sponsorCanonical.removedAt,
      })
      .from(sponsorCanonical)
      .where(eq(sponsorCanonical.status, "REMOVED_REVOKED"))
      .orderBy(desc(sponsorCanonical.removedAt))
      .limit(7);

    await cacheSet(cacheKey, sponsors, 3600);
    res.set("Cache-Control", "public, max-age=3600");
    success(res, sponsors);
  }));

  // ── Nightly run stats ─────────────────────────────────────────────────────
  // Powers the live stats bar on the homepage. Returns total active sponsors,
  // last run date, and change counts from the most recent daily_digest row.
  // Falls back gracefully when no digest row exists yet.
  // Cached 1hr — same cadence as the nightly job.
  app.get("/api/sponsors/nightly-stats", asyncHandler(async (_req: any, res) => {
    const cacheKey = "sponsors:nightly-stats";
    const cached = await cacheGet<object>(cacheKey);
    if (cached) {
      res.set("Cache-Control", "public, max-age=3600");
      success(res, cached);
      return;
    }

    const [countResult, digestRows, revokedResult, lastRunRows] = await Promise.all([
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(sponsorCanonical)
        .where(inArray(sponsorCanonical.status, ["ACTIVE", "NEWLY_GRANTED"])),
      // Only fetch the digest that is actively displayed on the landing page —
      // this ensures zero-change days don't overwrite a meaningful digest.
      db
        .select({
          snapshotDate:  dailyDigest.snapshotDate,
          addedCount:    dailyDigest.addedCount,
          removedCount:  dailyDigest.removedCount,
          updatedCount:  dailyDigest.updatedCount,
        })
        .from(dailyDigest)
        .where(eq(dailyDigest.displayedOnLanding, true))
        .orderBy(desc(dailyDigest.snapshotDate))
        .limit(1),
      // Count revocations in the last 12 months — trust signal for the homepage.
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(sponsorCanonical)
        .where(
          sql`status = 'REMOVED_REVOKED'
              AND removed_at >= (CURRENT_DATE - INTERVAL '12 months')`
        ),
      // Query the actual last successful cron/manual run date from monitor_job_runs.
      // This powers the "Register last checked" stat — shows when the job actually ran,
      // independent of which digest is displayed.
      db
        .select({ runDate: monitorJobRuns.runDate })
        .from(monitorJobRuns)
        .where(eq(monitorJobRuns.status, "success"))
        .orderBy(desc(monitorJobRuns.runDate))
        .limit(1),
    ]);

    const totalActive          = countResult[0]?.total ?? 0;
    const revokedLast12Months  = revokedResult[0]?.total ?? 0;
    const latest               = digestRows[0] ?? null;
    // Use the last successful job run date as "Register last checked".
    // Fall back to the active digest's snapshot date if no run recorded yet.
    const lastRunDate = lastRunRows[0]?.runDate ?? latest?.snapshotDate ?? null;

    const today = new Date().toISOString().split("T")[0];
    const staleDays = lastRunDate
      ? Math.round((Date.parse(today) - Date.parse(lastRunDate)) / 86400000)
      : 0;

    const payload = {
      totalActive,
      lastRunDate,
      addedCount:           latest?.addedCount    ?? 0,
      removedCount:         latest?.removedCount  ?? 0,
      changesCount:         latest?.updatedCount  ?? 0,
      revokedLast12Months,
      staleDays,
    };

    // Cache for 5 minutes — balances freshness with DB load.
    // Flushed immediately by sponsorMonitorJob after each nightly run.
    await cacheSet(cacheKey, payload, 300);
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    success(res, payload);
  }));

  // ── Latest notable change ─────────────────────────────────────────────────
  // Powers the "recent alert" activity toast on the homepage.
  // Returns the single most recent high-signal change (revocation, downgrade,
  // or upgrade) with the sponsor's display name. Cached 1hr.
  app.get("/api/sponsors/latest-change", asyncHandler(async (_req: any, res) => {
    const cacheKey = "sponsors:latest-change";
    const cached = await cacheGet<object>(cacheKey);
    if (cached) {
      res.set("Cache-Control", "public, max-age=3600");
      success(res, cached);
      return;
    }

    const rows = await db
      .select({
        changeType:    sponsorChanges.changeType,
        previousValue: sponsorChanges.previousValue,
        newValue:      sponsorChanges.newValue,
        detectedAt:    sponsorChanges.detectedAt,
        companyName:   sponsorCanonical.currentName,
        companyId:     sponsorCanonical.id,
      })
      .from(sponsorChanges)
      .innerJoin(sponsorCanonical, eq(sponsorCanonical.fingerprint, sponsorChanges.fingerprint))
      .where(inArray(sponsorChanges.changeType, ["REMOVED_REVOKED", "DOWNGRADED", "UPGRADED"]))
      .orderBy(desc(sponsorChanges.detectedAt))
      .limit(1);

    const payload = rows[0] ?? null;
    await cacheSet(cacheKey, payload, 3600);
    res.set("Cache-Control", "public, max-age=3600");
    success(res, payload);
  }));

  // ── Public CSV export ─────────────────────────────────────────────────────
  // Full current register (ACTIVE + NEWLY_GRANTED) as a downloadable CSV.
  // UTF-8 BOM prepended so Excel opens it correctly without manual encoding steps.
  // 5 downloads/hour per IP; 12hr HTTP cache for CDN.
  app.get("/api/sponsors/export.csv", csvRateLimit, asyncHandler(async (_req: any, res) => {
    const today = new Date().toISOString().split("T")[0];
    const rows = await db.execute(sql`
      SELECT
        current_name   AS name,
        town_city      AS town,
        type_rating    AS type_rating,
        route,
        status,
        granted_at
      FROM sponsor_canonical
      WHERE status IN ('ACTIVE', 'NEWLY_GRANTED')
      ORDER BY current_name ASC
    `);

    const header = "Organisation Name,Town/City,Type & Rating,Route,Status,Licence Granted\r\n";
    const body = (rows.rows as any[]).map((r) => [
      csvEscape(r.name      || ""),
      csvEscape(r.town      || ""),
      csvEscape(r.type_rating || ""),
      csvEscape(r.route     || ""),
      csvEscape(r.status    || ""),
      r.granted_at ? String(r.granted_at).slice(0, 10) : "",
    ].join(",")).join("\r\n");

    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="uk-licensed-sponsors-${today}.csv"`);
    res.set("Cache-Control", "public, max-age=43200");
    res.send("\uFEFF" + header + body);
  }));
}
