import type { Express } from "express";
import { db } from "../db";
import { sql, eq, inArray, desc } from "drizzle-orm";
import { sponsorCanonical, sponsorChanges, sponsorEnrichment } from "@shared/schema";
import { cacheGet, cacheSet } from "../utils/redisClient";
import { getAppUrl } from "../utils/appUrl";
import { ensureIndexReady, getIndexData, type SearchIndexEntry } from "../utils/sponsorSearch";
import rateLimit from "express-rate-limit";

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
  app.get("/api/sponsors/detail/:id", async (req: any, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid sponsor ID." });
    }

    const cacheKey = `sponsors:detail:${id}`;
    const cached = await cacheGet<object>(cacheKey);
    if (cached) return res.json(cached);

    try {
      const [sponsor] = await db
        .select()
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.id, id))
        .limit(1);

      if (!sponsor) return res.status(404).json({ message: "Sponsor not found." });

      const [recentChanges, countResult, enrichmentRows] = await Promise.all([
        // Free preview: 3 most recent changes
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
        // Total changes count — drives the "X more" lock indicator in the UI
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(sponsorChanges)
          .where(eq(sponsorChanges.fingerprint, sponsor.fingerprint)),
        // Companies House enrichment — included only when scrape completed
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
      res.json(payload);
    } catch (err) {
      console.error("Sponsor detail error:", err);
      res.status(500).json({ message: "Failed to load sponsor details." });
    }
  });

  // ── Sponsor sitemap index ─────────────────────────────────────────────────
  // Points to /sitemap-sponsors-0.xml, /sitemap-sponsors-1.xml, …
  app.get("/sitemap-sponsors.xml", async (_req: any, res) => {
    try {
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
      res.set("Cache-Control", "public, max-age=43200"); // 12 hr
      res.send(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `${entries}\n` +
        `</sitemapindex>`
      );
    } catch (err) {
      console.error("Sitemap sponsors index error:", err);
      res.status(500).send("Sitemap unavailable");
    }
  });

  // ── Per-page sponsor sitemap ──────────────────────────────────────────────
  // Each page covers 45k sponsors. Served with 12hr HTTP cache.
  app.get("/sitemap-sponsors-:page.xml", async (req: any, res) => {
    const page = parseInt(req.params.page, 10);
    if (isNaN(page) || page < 0 || page > 99) {
      return res.status(400).send("Invalid page");
    }

    const offset = page * SITEMAP_PAGE_SIZE;
    const today = new Date().toISOString().split("T")[0];
    const base = getAppUrl();

    try {
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

      if (sponsors.length === 0) return res.status(404).send("No sponsors for this page");

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
      res.set("Cache-Control", "public, max-age=43200"); // 12 hr
      res.send(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `${entries}\n` +
        `</urlset>`
      );
    } catch (err) {
      console.error(`Sitemap sponsors page ${page} error:`, err);
      res.status(500).send("Sitemap page unavailable");
    }
  });

  // ── Client-side instant search index ────────────────────────────────────
  // Returns a compact JSON array used by the browser for zero-latency search.
  // Backed by the same in-memory Fuse.js dataset — no extra DB query when warm.
  // The gzip compression middleware (level 6) reduces ~10MB → ~1.5MB in transit.
  // Cached 12hr in Redis + HTTP (CDN-friendly). Invalidated on nightly index rebuild.
  app.get("/api/sponsors/search-index.json", async (_req: any, res) => {
    const cacheKey = "sponsors:search-index-json";
    const cached = await cacheGet<SearchIndexEntry[]>(cacheKey);
    if (cached) {
      res.set("Content-Type", "application/json");
      res.set("Cache-Control", "public, max-age=43200, stale-while-revalidate=86400");
      return res.json(cached);
    }

    try {
      await ensureIndexReady();
      const data = getIndexData();
      await cacheSet(cacheKey, data, 43200);  // 12hr — matches nightly rebuild cadence
      res.set("Content-Type", "application/json");
      res.set("Cache-Control", "public, max-age=43200, stale-while-revalidate=86400");
      res.json(data);
    } catch (err) {
      console.error("Search index export error:", err);
      res.status(500).json({ message: "Search index unavailable." });
    }
  });

  // ── Recently revoked ─────────────────────────────────────────────────────
  // Public feed of the 7 most recently revoked sponsors. Used by the homepage
  // "Recently Revoked" widget. Cached 1 hr — flushed by nightly monitor job.
  app.get("/api/sponsors/recently-revoked", async (_req: any, res) => {
    const cacheKey = "sponsors:recently-revoked";
    const cached = await cacheGet<object[]>(cacheKey);
    if (cached) return res.json(cached);

    try {
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
      res.json(sponsors);
    } catch (err) {
      console.error("Recently revoked error:", err);
      res.status(500).json({ message: "Failed to load recently revoked sponsors." });
    }
  });

  // ── Public CSV export ─────────────────────────────────────────────────────
  // Full current register (ACTIVE + NEWLY_GRANTED) as a downloadable CSV.
  // UTF-8 BOM prepended so Excel opens it correctly without manual encoding steps.
  // 5 downloads/hour per IP; 12hr HTTP cache for CDN.
  app.get("/api/sponsors/export.csv", csvRateLimit, async (_req: any, res) => {
    try {
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
      res.set("Cache-Control", "public, max-age=43200");  // 12 hr
      res.send("\uFEFF" + header + body);  // BOM for Excel UTF-8 compat
    } catch (err) {
      console.error("CSV export error:", err);
      res.status(500).send("Export unavailable");
    }
  });
}
