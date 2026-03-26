import type { Express } from "express";
import { db } from "../db";
import { sql, eq, inArray, desc } from "drizzle-orm";
import { sponsorCanonical, sponsorChanges } from "@shared/schema";
import { cacheGet, cacheSet } from "../utils/redisClient";
import { getAppUrl } from "../utils/appUrl";

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

      const recentChanges = await db
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
        .limit(5);

      const payload = { ...sponsor, recentChanges };
      await cacheSet(cacheKey, payload, 3600);
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
}
