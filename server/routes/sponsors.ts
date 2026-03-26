import type { Express } from "express";
import { db } from "../db";
import { sql, eq, and, desc, inArray, gte } from "drizzle-orm";
import { sponsorCanonical, sponsorChanges, companyWatches, dailyDigest } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { getWatchLimit as getWatchLimitFromTier, getTierConfig } from "../utils/tierConfig";
import { normalizeName, generateFingerprint } from "../utils/sponsorListFetcher";
import { ensureIndexReady, isIndexReady, searchSponsors, searchSponsorsFallback, type PagedSearchResult } from "../utils/sponsorSearch";
import { generateHeadline, signDigest } from "../services/aiDigest";
import { storage } from "../storage";
import { getRedis, cacheGet, cacheSet } from "../utils/redisClient";
import rateLimit from "express-rate-limit";

// ── Free-search rate limiter ─────────────────────────────────────────────────
// Redis primary (cross-instance, survives restarts) with in-process Map fallback.
const localFreeSearchTracker = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of Array.from(localFreeSearchTracker.entries())) {
    if (now - ts > 24 * 60 * 60 * 1000) localFreeSearchTracker.delete(ip);
  }
}, 60 * 60 * 1000);

async function hasFreeSearchUsed(ip: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try { return (await redis.exists(`sponsors:freesearch:${ip}`)) > 0; } catch { /* fall through */ }
  }
  const ts = localFreeSearchTracker.get(ip);
  return ts !== undefined && Date.now() - ts < 24 * 60 * 60 * 1000;
}

async function markFreeSearchUsed(ip: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try { await redis.set(`sponsors:freesearch:${ip}`, "1", "EX", 86400); return; } catch { /* fall through */ }
  }
  localFreeSearchTracker.set(ip, Date.now());
}

function getWatchLimit(subscriptionStatus: string | null): number {
  return getWatchLimitFromTier(subscriptionStatus);
}

// ── API Rate Limiters ─────────────────────────────────────────────────────────
// In-process store per instance. For multi-server deployments consider adding a
// Redis store (e.g. rate-limit-redis) so counters are shared across pods.
const directoryRateLimit = rateLimit({
  windowMs: 60 * 1_000,  // 1 minute
  max: 60,
  standardHeaders: true,  // RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown",
  message: { message: "Too many requests. Please wait before browsing the directory again." },
});

const changesRateLimit = rateLimit({
  windowMs: 60 * 1_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown",
  message: { message: "Too many requests. Please wait before fetching sponsor changes again." },
});

export function registerSponsorRoutes(app: Express): void {
  app.get('/api/sponsors/free-search', async (req: any, res) => {
    try {
      const q = (req.query.q as string || "").trim().slice(0, 200);
      if (q.length < 3) {
        return res.status(400).json({ message: "Search query must be at least 3 characters long." });
      }

      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'unknown';
      if (await hasFreeSearchUsed(ip)) {
        return res.status(429).json({
          message: "You've used your free search for today. Subscribe to the Notification Engine for unlimited searches and real-time alerts.",
          limitReached: true,
        });
      }

      await ensureIndexReady();
      const opts = { limit: 10 };
      const paged = isIndexReady()
        ? searchSponsors(q, opts)
        : await searchSponsorsFallback(q, opts);

      await markFreeSearchUsed(ip);
      res.json({ results: paged?.results ?? [], freeSearchUsed: true });
    } catch (error) {
      console.error("Error in free sponsor search:", error);
      res.status(500).json({ message: "Failed to search sponsors." });
    }
  });

  app.get('/api/daily-digest/current', async (_req: any, res) => {
    try {
      const result = await db
        .select()
        .from(dailyDigest)
        .where(eq(dailyDigest.displayedOnLanding, true))
        .orderBy(desc(dailyDigest.snapshotDate))
        .limit(1);

      if (result.length === 0) {
        return res.json({ available: false });
      }

      const digest = result[0];
      const variants = (digest.headlineVariants as any[]) || [];
      const idx = digest.selectedVariantIndex ?? 0;
      const selected = variants[idx] || variants[0] || { headline: digest.headlineGenerated, subheadline: "", emotion: "neutral", focus: "general" };

      const signature = signDigest({
        date: digest.snapshotDate,
        added: digest.addedCount,
        updated: digest.updatedCount,
        removed: digest.removedCount,
      });

      const isSeed = digest.aiModel === "deterministic-seed";

      const [activeResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.status, "ACTIVE"));
      const activeSponsors = activeResult?.count ?? 0;

      res.json({
        available: true,
        type: isSeed ? "overview" : "daily",
        date: digest.snapshotDate,
        headline: selected.headline || digest.headlineGenerated,
        emotion: selected.emotion || "neutral",
        focus: selected.focus || "general",
        counts: {
          added: digest.addedCount,
          updated: digest.updatedCount,
          removed: digest.removedCount,
        },
        activeSponsors,
        signature,
      });
    } catch (error) {
      console.error("Error fetching daily digest:", error);
      res.status(500).json({ message: "Failed to fetch daily digest." });
    }
  });

  app.post('/api/admin/daily-digest/refresh', isAdmin, async (req: any, res) => {
    try {
      const latestChanges = await db
        .select({
          changeType: sponsorChanges.changeType,
          organisationName: sponsorChanges.organisationName,
          count: sql<number>`count(*)::int`,
        })
        .from(sponsorChanges)
        .groupBy(sponsorChanges.changeType, sponsorChanges.organisationName)
        .orderBy(desc(sql`count(*)`))
        .limit(50);

      const today = new Date().toISOString().split("T")[0];
      let addedCount = 0, updatedCount = 0, removedCount = 0;
      const removedCompanies: string[] = [];
      const addedCompanies: string[] = [];

      if (latestChanges.length > 0) {
        for (const c of latestChanges) {
          if (c.changeType === "ADDED" || c.changeType === "NEW_LICENCE") {
            addedCount += c.count;
            if (addedCompanies.length < 5) addedCompanies.push(c.organisationName);
          } else if (c.changeType === "REMOVED_REVOKED") {
            removedCount += c.count;
            if (removedCompanies.length < 10) removedCompanies.push(c.organisationName);
          } else if (["UPGRADED", "DOWNGRADED", "ROUTE_CHANGE", "NAME_CHANGE"].includes(c.changeType)) {
            updatedCount += c.count;
          }
        }
      } else {
        const stats = await db
          .select({
            active: sql<number>`count(*) filter (where ${sponsorCanonical.status} = 'ACTIVE')::int`,
            revoked: sql<number>`count(*) filter (where ${sponsorCanonical.status} = 'REMOVED_REVOKED')::int`,
          })
          .from(sponsorCanonical);
        addedCount = stats[0]?.active || 0;
        removedCount = stats[0]?.revoked || 0;
      }

      const headlineResult = await generateHeadline({
        snapshotDate: today,
        addedCount,
        updatedCount,
        removedCount,
        removedCompanies,
        addedCompanies,
      });

      await db.update(dailyDigest).set({ displayedOnLanding: false });
      await db.insert(dailyDigest).values({
        snapshotDate: today,
        addedCount,
        updatedCount,
        removedCount,
        headlineGenerated: headlineResult.headline,
        headlineVariants: headlineResult.variants,
        displayedOnLanding: true,
        selectedVariantIndex: 0,
        aiModel: headlineResult.model,
      }).onConflictDoUpdate({
        target: dailyDigest.snapshotDate,
        set: {
          headlineGenerated: headlineResult.headline,
          headlineVariants: headlineResult.variants,
          displayedOnLanding: true,
          selectedVariantIndex: 0,
          aiModel: headlineResult.model,
          generatedAt: new Date(),
        },
      });

      res.json({ success: true, headline: headlineResult.headline, model: headlineResult.model });
    } catch (error: unknown) {
      console.error("Error refreshing daily digest:", error);
      res.status(500).json({ message: "Failed to refresh digest.", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/sponsors/search', isAuthenticated, async (req: any, res) => {
    try {
      const q = (req.query.q as string || "").trim().slice(0, 200);
      if (q.length < 3) {
        return res.status(400).json({ message: "Search query must be at least 3 characters long." });
      }

      const VALID_STATUSES = ["ACTIVE", "NEWLY_GRANTED", "REMOVED_REVOKED", "GRACE_PERIOD"];
      const statusParam = (req.query.status as string || "").toUpperCase();
      const status = VALID_STATUSES.includes(statusParam) ? statusParam : undefined;
      const town = (req.query.town as string || "").trim() || undefined;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

      const opts = { status, town, page, limit };

      // L1 Redis cache: TTL 5 min — avoids redundant Fuse/pg_trgm work for repeated queries.
      const cacheKey = `sponsors:search:${Buffer.from(JSON.stringify({ q, status, town, page, limit })).toString("base64")}`;
      const cached = await cacheGet<PagedSearchResult>(cacheKey);
      if (cached) return res.json(cached);

      await ensureIndexReady();
      const paged = isIndexReady()
        ? searchSponsors(q, opts)
        : await searchSponsorsFallback(q, opts);

      const searchResult = paged ?? { results: [], total: 0, page: 1, totalPages: 1 };
      await cacheSet(cacheKey, searchResult, 300);
      res.json(searchResult);
    } catch (error) {
      console.error("Error searching sponsors:", error);
      res.status(500).json({ message: "Failed to search sponsors." });
    }
  });

  app.get('/api/sponsors/directory', directoryRateLimit, async (req: any, res) => {
    try {
      // Validate and sanitize all query params at the boundary.
      // Returns 400 on invalid input (e.g. unknown status, non-integer page).
      const dirParsed = z.object({
        name:   z.string().trim().max(200).optional().default(""),
        status: z.preprocess(
          (v) => typeof v === "string" && v.trim() ? v.trim().toUpperCase() : undefined,
          z.enum(["ACTIVE", "NEWLY_GRANTED", "REMOVED_REVOKED", "GRACE_PERIOD"]).optional(),
        ),
        town:   z.string().trim().max(200).optional().default(""),
        route:  z.string().trim().max(200).optional().default(""),
        page:   z.coerce.number().int().min(1).max(10_000).default(1),
        limit:  z.coerce.number().int().min(1).max(100).default(50),
      }).safeParse(req.query);
      if (!dirParsed.success) {
        return res.status(400).json({ message: "Invalid query parameters.", errors: dirParsed.error.flatten().fieldErrors });
      }
      const name   = dirParsed.data.name   || null;
      const status = dirParsed.data.status ?? null;
      const town   = dirParsed.data.town   || null;
      const route  = dirParsed.data.route  || null;
      const page   = dirParsed.data.page;
      const limit  = dirParsed.data.limit;
      const offset = (page - 1) * limit;

      const nameFilter   = name   ? sql`AND current_name ILIKE ${"%" + name + "%"}`     : sql``;
      const statusFilter = status ? sql`AND status = ${status}`                          : sql``;
      const townFilter   = town   ? sql`AND town_city ILIKE ${"%" + town + "%"}`         : sql``;
      const routeFilter  = route  ? sql`AND route ILIKE ${"%" + route + "%"}`            : sql``;

      type DirectoryStats = { active: number; newlyGranted: number; removedThisWeek: number; gracePeriod: number };
      type DirectoryResponse = { results: unknown[]; total: number; page: number; totalPages: number; limit: number; stats: DirectoryStats };

      // Full response cache: rows + count + stats for this exact filter+page combo.
      // TTL 5 min — always flushed after each nightly rebuild via cacheFlushPattern("sponsors:*").
      const dirCacheKey = `sponsors:dir:${Buffer.from(JSON.stringify({ name, status, town, route, page, limit })).toString("base64")}`;
      const dirCached = await cacheGet<DirectoryResponse>(dirCacheKey);
      if (dirCached) {
        res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
        return res.json(dirCached);
      }

      // Stats are an expensive full-table aggregation that only change once per nightly run.
      // Cache them for 10 minutes; flushed by sponsorMonitorJob after each successful run.
      let stats = await cacheGet<DirectoryStats>("sponsors:stats");

      const [rows, countRows] = await Promise.all([
        db.execute(sql`
          SELECT
            fingerprint,
            current_name   AS "organisationName",
            town_city      AS "townCity",
            county,
            type_rating    AS "typeRating",
            route,
            status,
            granted_at     AS "grantedAt",
            removed_at     AS "removedAt",
            first_seen     AS "firstSeen"
          FROM sponsor_canonical
          WHERE 1=1
            ${nameFilter}
            ${statusFilter}
            ${townFilter}
            ${routeFilter}
          ORDER BY
            CASE status
              WHEN 'NEWLY_GRANTED'   THEN 0
              WHEN 'ACTIVE'          THEN 1
              WHEN 'GRACE_PERIOD'    THEN 2
              ELSE                        3
            END,
            current_name ASC
          LIMIT ${limit} OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM sponsor_canonical
          WHERE 1=1
            ${nameFilter}
            ${statusFilter}
            ${townFilter}
            ${routeFilter}
        `),
      ]);

      if (!stats) {
        const statsRows = await db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE status = 'ACTIVE')                                                        AS active,
            COUNT(*) FILTER (WHERE status = 'NEWLY_GRANTED')                                                 AS "newlyGranted",
            COUNT(*) FILTER (WHERE status = 'REMOVED_REVOKED' AND removed_at >= NOW() - INTERVAL '7 days')  AS "removedThisWeek",
            COUNT(*) FILTER (WHERE status = 'GRACE_PERIOD')                                                  AS "gracePeriod"
          FROM sponsor_canonical
        `);
        const raw = statsRows.rows[0] as any;
        stats = {
          active:          Number(raw?.active ?? 0),
          newlyGranted:    Number(raw?.newlyGranted ?? 0),
          removedThisWeek: Number(raw?.removedThisWeek ?? 0),
          gracePeriod:     Number(raw?.gracePeriod ?? 0),
        };
        await cacheSet("sponsors:stats", stats, 600);
      }

      const total      = (countRows.rows[0] as any)?.total ?? 0;
      const totalPages = Math.max(1, Math.ceil(total / limit));

      const dirResponse: DirectoryResponse = {
        results: rows.rows as unknown[],
        total,
        page,
        totalPages,
        limit,
        stats: stats ?? { active: 0, newlyGranted: 0, removedThisWeek: 0, gracePeriod: 0 },
      };
      await cacheSet(dirCacheKey, dirResponse, 300);
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json(dirResponse);
    } catch (error: unknown) {
      console.error("Error in sponsor directory:", error);
      res.status(500).json({ message: "Failed to load sponsor directory." });
    }
  });

  app.get('/api/sponsors/:fingerprint/history', isAuthenticated, async (req: any, res) => {
    try {
      const { fingerprint } = req.params;
      if (!fingerprint || typeof fingerprint !== 'string') {
        return res.status(400).json({ message: "Fingerprint is required." });
      }

      const canonical = await db
        .select()
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.fingerprint, fingerprint))
        .limit(1);

      if (canonical.length === 0) {
        return res.status(404).json({ message: "Company not found." });
      }

      const record = canonical[0];
      const allNames = [record.currentName, ...(record.historicalNames || [])];

      const changes = await db
        .select()
        .from(sponsorChanges)
        .where(inArray(sponsorChanges.organisationName, allNames))
        .orderBy(desc(sponsorChanges.detectedAt))
        .limit(100);

      const history = changes.map(c => ({
        id: c.id,
        date: c.detectedAt,
        event: c.changeType,
        organisationName: c.organisationName,
        previousValue: c.previousValue,
        newValue: c.newValue,
        snapshotDate: c.snapshotDate,
      }));

      res.json({
        fingerprint: record.fingerprint,
        currentName: record.currentName,
        townCity: record.townCity,
        typeRating: record.typeRating,
        route: record.route,
        status: record.status,
        firstSeen: record.firstSeen,
        lastSeen: record.lastSeen,
        historicalNames: record.historicalNames || [],
        history,
      });
    } catch (error) {
      console.error("Error fetching sponsor history:", error);
      res.status(500).json({ message: "Failed to fetch sponsor history." });
    }
  });

  app.post('/api/watches', isAuthenticated, async (req: any, res) => {
    try {
      const watchSchema = z.object({
        organisation_name: z.string().trim().min(1, "Organisation name is required").max(300),
        town_city: z.string().trim().max(200).optional(),
        fingerprint: z.string().max(500).optional(),
      });
      const parsed = watchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(', ') });
      }
      const { organisation_name, town_city, fingerprint: fpParam } = parsed.data;

      const userSub = req.user.subscriptionStatus || "free";
      if (userSub === "free" || !userSub) {
        return res.status(403).json({
          message: "Upgrade to Starter plan to add companies to your watchlist. Free users can view search results and history only.",
          requiresUpgrade: true,
        });
      }

      const userId = req.user.id;
      const normalized = normalizeName(organisation_name.trim());

      let canonicalMatch;
      if (fpParam) {
        const match = await db
          .select()
          .from(sponsorCanonical)
          .where(and(
            eq(sponsorCanonical.fingerprint, fpParam),
            eq(sponsorCanonical.status, "ACTIVE"),
          ))
          .limit(1);
        canonicalMatch = match[0] || null;
      }

      if (!canonicalMatch) {
        const fp = generateFingerprint(organisation_name.trim(), town_city || "", "");
        const fpMatch = await db
          .select()
          .from(sponsorCanonical)
          .where(and(
            eq(sponsorCanonical.fingerprint, fp),
            eq(sponsorCanonical.status, "ACTIVE"),
          ))
          .limit(1);
        canonicalMatch = fpMatch[0] || null;
      }

      if (!canonicalMatch) {
        const normalizedCity = town_city ? normalizeName(town_city.trim()) : null;
        const activeRecords = await db
          .select()
          .from(sponsorCanonical)
          .where(eq(sponsorCanonical.status, "ACTIVE"));

        canonicalMatch = activeRecords.find(m => {
          const mNorm = normalizeName(m.currentName);
          if (mNorm !== normalized) return false;
          if (normalizedCity && m.townCity) {
            return normalizeName(m.townCity) === normalizedCity;
          }
          return true;
        }) || null;
      }

      if (!canonicalMatch) {
        return res.status(404).json({ message: "Company not found in the current sponsor register. Please check the name and try again." });
      }

      const existingWatch = await db
        .select()
        .from(companyWatches)
        .where(and(
          eq(companyWatches.userId, userId),
          eq(companyWatches.organisationNameNormalized, normalized),
        ))
        .limit(1);

      if (existingWatch.length > 0 && existingWatch[0].isActive) {
        return res.status(409).json({ message: "You are already watching this company." });
      }

      const limit = getWatchLimit(req.user.subscriptionStatus);
      if (limit !== -1) {
        const activeWatches = await db
          .select({ id: companyWatches.id })
          .from(companyWatches)
          .where(and(
            eq(companyWatches.userId, userId),
            eq(companyWatches.isActive, true),
          ));

        if (activeWatches.length >= limit) {
          return res.status(403).json({
            message: `You have reached your watch limit of ${limit}. Upgrade your plan to watch more companies.`,
            currentCount: activeWatches.length,
            limit,
          });
        }
      }

      if (existingWatch.length > 0) {
        await db
          .update(companyWatches)
          .set({ isActive: true, fingerprint: canonicalMatch.fingerprint })
          .where(eq(companyWatches.id, existingWatch[0].id));
        return res.json({ message: "Watch reactivated.", watch: { ...existingWatch[0], isActive: true } });
      }

      const [newWatch] = await db
        .insert(companyWatches)
        .values({
          userId,
          organisationName: canonicalMatch.currentName,
          organisationNameNormalized: normalized,
          townCity: town_city?.trim() || canonicalMatch.townCity,
          fingerprint: canonicalMatch.fingerprint,
          isActive: true,
        })
        .returning();

      res.status(201).json({ message: "Watch created.", watch: newWatch });
    } catch (error) {
      console.error("Error creating watch:", error);
      res.status(500).json({ message: "Failed to create watch." });
    }
  });

  app.get('/api/watches', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const watches = await db
        .select()
        .from(companyWatches)
        .where(eq(companyWatches.userId, userId))
        .orderBy(desc(companyWatches.createdAt));

      // Batch all DB lookups to avoid N+1 queries.
      // 1. One inArray query for all fingerprinted watches.
      const fingerprintedWatches = watches.filter((w) => w.fingerprint);
      const unfingerprintedWatches = watches.filter((w) => !w.fingerprint);

      const canonicalByFingerprint = new Map<string, {
        typeRating: string | null; route: string | null; status: string; currentName: string; fingerprint: string;
      }>();
      if (fingerprintedWatches.length > 0) {
        const rows = await db
          .select({
            fingerprint: sponsorCanonical.fingerprint,
            typeRating: sponsorCanonical.typeRating,
            route: sponsorCanonical.route,
            status: sponsorCanonical.status,
            currentName: sponsorCanonical.currentName,
          })
          .from(sponsorCanonical)
          .where(inArray(sponsorCanonical.fingerprint, fingerprintedWatches.map((w) => w.fingerprint!)));
        rows.forEach((r) => canonicalByFingerprint.set(r.fingerprint, r));
      }

      // 2. One full-table scan (at most once) for all unfingerprinted watches.
      let allCanonicalRows: { fingerprint: string; currentName: string; townCity: string | null; typeRating: string | null; route: string | null; status: string }[] = [];
      if (unfingerprintedWatches.length > 0) {
        allCanonicalRows = await db
          .select({
            fingerprint: sponsorCanonical.fingerprint,
            currentName: sponsorCanonical.currentName,
            townCity: sponsorCanonical.townCity,
            typeRating: sponsorCanonical.typeRating,
            route: sponsorCanonical.route,
            status: sponsorCanonical.status,
          })
          .from(sponsorCanonical);
      }

      // 3. One inArray query for all recent changes across all watches.
      const orgNames = [...new Set(watches.map((w) => w.organisationName).filter(Boolean))];
      const allRecentChanges = orgNames.length > 0
        ? await db
            .select()
            .from(sponsorChanges)
            .where(inArray(sponsorChanges.organisationName, orgNames))
            .orderBy(desc(sponsorChanges.detectedAt))
        : [];
      const changesByOrg = new Map<string, typeof allRecentChanges>();
      for (const c of allRecentChanges) {
        const list = changesByOrg.get(c.organisationName) ?? [];
        list.push(c);
        changesByOrg.set(c.organisationName, list);
      }

      // Enrich in-memory — no further DB calls.
      const enriched = watches.map((watch) => {
        let currentStatus: { listed: boolean; typeRating: string | null; route: string | null; status: string } = {
          listed: false,
          typeRating: null,
          route: null,
          status: "UNKNOWN",
        };

        if (watch.fingerprint) {
          const c = canonicalByFingerprint.get(watch.fingerprint);
          if (c) {
            currentStatus = { listed: c.status === "ACTIVE", typeRating: c.typeRating, route: c.route, status: c.status };
          }
        } else {
          const normalized = watch.organisationNameNormalized;
          const normalizedCity = watch.townCity ? normalizeName(watch.townCity) : null;
          const match = allCanonicalRows.find((c) => {
            const cNorm = normalizeName(c.currentName);
            if (cNorm !== normalized) return false;
            if (normalizedCity && c.townCity) return normalizeName(c.townCity) === normalizedCity;
            return true;
          });
          if (match) {
            currentStatus = { listed: match.status === "ACTIVE", typeRating: match.typeRating, route: match.route, status: match.status };
            db.update(companyWatches)
              .set({ fingerprint: match.fingerprint })
              .where(eq(companyWatches.id, watch.id))
              .catch((err) => console.error("[CompanyWatch] Failed to update fingerprint for watch id", watch.id, err));
          }
        }

        const recentChanges = (changesByOrg.get(watch.organisationName) ?? []).slice(0, 5);

        return { ...watch, currentStatus, recentChanges };
      });

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching watches:", error);
      res.status(500).json({ message: "Failed to fetch watches." });
    }
  });

  app.delete('/api/watches/:id', isAuthenticated, async (req: any, res) => {
    try {
      const watchId = parseInt(req.params.id, 10);
      if (isNaN(watchId)) {
        return res.status(400).json({ message: "Invalid watch ID." });
      }

      const existing = await db
        .select()
        .from(companyWatches)
        .where(eq(companyWatches.id, watchId))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ message: "Watch not found." });
      }

      if (existing[0].userId !== req.user.id) {
        return res.status(403).json({ message: "You can only manage your own watches." });
      }

      await db
        .update(companyWatches)
        .set({ isActive: false })
        .where(eq(companyWatches.id, watchId));

      res.json({ message: "Watch deactivated." });
    } catch (error) {
      console.error("Error deactivating watch:", error);
      res.status(500).json({ message: "Failed to deactivate watch." });
    }
  });

  app.patch('/api/watches/:id/reactivate', isAuthenticated, async (req: any, res) => {
    try {
      const watchId = parseInt(req.params.id, 10);
      if (isNaN(watchId)) {
        return res.status(400).json({ message: "Invalid watch ID." });
      }

      const existing = await db
        .select()
        .from(companyWatches)
        .where(eq(companyWatches.id, watchId))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ message: "Watch not found." });
      }

      if (existing[0].userId !== req.user.id) {
        return res.status(403).json({ message: "You can only manage your own watches." });
      }

      if (existing[0].isActive) {
        return res.json({ message: "Watch is already active." });
      }

      await db
        .update(companyWatches)
        .set({ isActive: true })
        .where(eq(companyWatches.id, watchId));

      res.json({ message: "Watch reactivated." });
    } catch (error) {
      console.error("Error reactivating watch:", error);
      res.status(500).json({ message: "Failed to reactivate watch." });
    }
  });

  // Public sponsor changes endpoint (last 7 days, grouped by date)
  app.get('/api/sponsor-changes', changesRateLimit, async (req, res) => {
    try {
      // 7-day feed is static between nightly runs — cache for 10 min.
      // sponsors:changes is flushed by sponsorMonitorJob via cacheFlushPattern("sponsors:*").
      const changesCached = await cacheGet<{ changes: unknown[]; grouped: unknown; totalCount: number }>("sponsors:changes");
      if (changesCached) return res.json(changesCached);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const changes = await db
        .select({
          id: sponsorChanges.id,
          organisationName: sponsorChanges.organisationName,
          changeType: sponsorChanges.changeType,
          previousValue: sponsorChanges.previousValue,
          newValue: sponsorChanges.newValue,
          detectedAt: sponsorChanges.detectedAt,
          snapshotDate: sponsorChanges.snapshotDate,
        })
        .from(sponsorChanges)
        .where(gte(sponsorChanges.detectedAt, sevenDaysAgo))
        .orderBy(desc(sponsorChanges.detectedAt))
        .limit(500);

      const grouped: Record<string, typeof changes> = {};
      for (const change of changes) {
        const dateKey = change.snapshotDate || (change.detectedAt ? new Date(change.detectedAt).toISOString().split('T')[0] : 'unknown');
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(change);
      }

      const changesResponse = { changes, grouped, totalCount: changes.length };
      await cacheSet("sponsors:changes", changesResponse, 600);
      res.json(changesResponse);
    } catch (error) {
      console.error("Error fetching public sponsor changes:", error);
      res.status(500).json({ message: "Failed to fetch sponsor changes." });
    }
  });

  // Sponsor reactivation watches (user-facing)
  app.post('/api/sponsor-watch', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id as string;
      const parsed = z.object({
        companyName: z.string().trim().min(1),
        companyNumber: z.string().trim().optional(),
      }).safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: 'companyName is required' });
      }

      const { companyName, companyNumber } = parsed.data;

      const existing = await storage.getSponsorWatchesByUserId(userId, 'pending_activation');
      const duplicate = existing.find(
        (w) => w.companyName.toLowerCase() === companyName.toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({ message: 'You already have an active watch for this company' });
      }

      const watch = await storage.createSponsorWatch(userId, { userId, companyName, companyNumber });
      res.status(201).json(watch);
    } catch (error: unknown) {
      console.error('Error creating sponsor watch:', error);
      res.status(500).json({ message: 'Failed to create watch' });
    }
  });

  app.delete('/api/sponsor-watch/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id as string;
      const { id } = req.params;

      const watch = await storage.getSponsorWatchById(id);
      if (!watch) {
        return res.status(404).json({ message: 'Watch not found' });
      }
      if (watch.userId !== userId) {
        return res.status(403).json({ message: 'Not authorised to cancel this watch' });
      }

      await storage.cancelSponsorWatch(id);
      res.json({ message: 'Watch cancelled' });
    } catch (error: unknown) {
      console.error('Error cancelling sponsor watch:', error);
      res.status(500).json({ message: 'Failed to cancel watch' });
    }
  });

  app.get('/api/sponsor-watch', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id as string;
      const status = req.query.status as string | undefined;

      const data = await storage.getSponsorWatchesByUserId(userId, status);
      res.json({ data, total: data.length });
    } catch (error: unknown) {
      console.error('Error fetching sponsor watches:', error);
      res.status(500).json({ message: 'Failed to fetch watches' });
    }
  });
}
