import type { Express } from "express";
import { db } from "../db";
import { sql, eq, and, or, desc, inArray, gte } from "drizzle-orm";
import { sponsorCanonical, sponsorChanges, companyWatches, sponsorWatches, dailyDigest } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { requireRole } from "../middleware/roleGuard";
import { getWatchLimit as getWatchLimitFromTier, getTierConfig } from "../utils/tierConfig";
import { normalizeName, generateFingerprint, namePrefilterToken } from "../utils/sponsorListFetcher";
import { ensureIndexReady, isIndexReady, searchSponsors, searchSponsorsFallback, searchRevokedSponsors, getIndexHealth, type PagedSearchResult } from "../utils/sponsorSearch";
import { recordSearchRequest } from "../services/monitoringService";
import { generateHeadline, signDigest } from "../services/aiDigest";
import { storage } from "../storage";
import { cacheGet, cacheSet, cacheFlushPattern, flushSponsorCaches } from "../utils/redisClient";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { makeRateLimitStore } from "../utils/redisRateLimitStore";
import { success } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";
import { logger } from "../utils/logger";

// ── Tiered Rate Limiters for Search ──────────────────────────────────────────
// Authenticated users get higher limits, anonymous get reasonable limits.
// Stores are Redis-backed when Redis is available (shared across pods);
// express-rate-limit falls back to in-process MemoryStore automatically.
const rateLimiterFactory = (maxPerMinute: number, prefix: string) => rateLimit({
  windowMs: 60 * 1_000,
  max: maxPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore(prefix),
  // req.ip is correctly resolved after app.set('trust proxy', 1) in server/index.ts.
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return (req as any).user?.id || ipKeyGenerator(req.ip ?? "127.0.0.1");
  },
});

// Anonymous search - 30 requests/minute (prevents abuse)
const freeSearchRateLimit = rateLimiterFactory(30, "rl:search:free:");

// Authenticated search - 120 requests/minute (for power users)
const authenticatedSearchRateLimit = rateLimiterFactory(120, "rl:search:auth:");

// Custom key generator for personalized limits
const personalizedRateLimiter = (baseLimit: number) => rateLimit({
  windowMs: 60 * 1_000,
  max: (req: any) => {
    // Null-safe: subscriptionStatus may be null for free users.
    const sub: string = req.user?.subscriptionStatus ?? "";
    if (sub.includes('pro') || sub.includes('unlimited') || sub.includes('enterprise')) {
      return baseLimit * 3; // 3x for premium users
    }
    if (sub.includes('starter') || sub.includes('notification')) {
      return baseLimit * 2; // 2x for starter users
    }
    return baseLimit; // Default for free/trial users
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore("rl:search:personalized:"),
  // req.ip is correctly resolved after app.set('trust proxy', 1) in server/index.ts.
  keyGenerator: (req) => ((req as any).user?.id || ipKeyGenerator(req.ip ?? "127.0.0.1")),
});

function getWatchLimit(subscriptionStatus: string | null): number {
  return getWatchLimitFromTier(subscriptionStatus);
}

// ── API Rate Limiters ─────────────────────────────────────────────────────────
// Counters are stored in Redis when available (shared across pods).
// Falls back to in-process MemoryStore automatically when Redis is offline.
const directoryRateLimit = rateLimit({
  windowMs: 60 * 1_000,  // 1 minute
  max: 60,
  standardHeaders: true,  // RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  store: makeRateLimitStore("rl:directory:"),
  // No custom keyGenerator — express-rate-limit v8's built-in ipKeyGenerator handles IPv6
  message: { message: "Too many requests. Please wait before browsing the directory again." },
});

const changesRateLimit = rateLimit({
  windowMs: 60 * 1_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore("rl:changes:"),
  // No custom keyGenerator — express-rate-limit v8's built-in ipKeyGenerator handles IPv6
  message: { message: "Too many requests. Please wait before fetching sponsor changes again." },
});

/**
 * Ensures a sponsor_watches row (pending_activation) exists for this user/company.
 * Called when a paid user watches a REMOVED_REVOKED company so the nightly
 * state-machine fires a RE_ACTIVATED email when the licence is restored.
 * Safe to call multiple times — silently skips if a row already exists.
 */
async function ensureReactivationWatch(userId: string, companyName: string): Promise<void> {
  try {
    const existing = await db
      .select({ id: sponsorWatches.id })
      .from(sponsorWatches)
      .where(and(
        eq(sponsorWatches.userId, userId),
        sql`LOWER(${sponsorWatches.companyName}) = LOWER(${companyName})`,
        eq(sponsorWatches.status, "pending_activation"),
      ))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(sponsorWatches).values({ userId, companyName });
    }
  } catch (err) {
    // Non-fatal — log and continue
    logger.error({ err: err instanceof Error ? err.message : err }, "[ReactivationWatch] ensureReactivationWatch failed:");
  }
}

export function registerSponsorRoutes(app: Express): void {
  app.get('/api/sponsors/health', asyncHandler(async (req: any, res) => {
    const health = getIndexHealth();
    success(res, {
      status: 'ok',
      search: health,
      timestamp: new Date().toISOString(),
    });
  }));

  app.get('/api/sponsors/free-search', freeSearchRateLimit, asyncHandler(async (req: any, res) => {
    const startTime = Date.now();
    const q = (req.query.q as string || "").trim().slice(0, 200);
    if (q.length < 3) {
      throw new ApiError(400, "Search query must be at least 3 characters long.");
    }

    const health = getIndexHealth();
    const opts = { limit: 50 };
    let paged;

    if (isIndexReady()) {
      paged = searchSponsors(q, opts);
    } else {
      logger.info("[Search] Index not ready, using database fallback");
      paged = await searchSponsorsFallback(q, opts);
    }

    const searchSuccess = !(paged === null || (paged?.results ?? []).length === 0 && health.ready);
    recordSearchRequest(searchSuccess, Date.now() - startTime);

    success(res, {
      results: paged?.results ?? [],
      health,
      searchType: isIndexReady() ? 'index' : 'database'
    });
  }));

  app.get('/api/sponsors/search', isAuthenticated, personalizedRateLimiter(60), asyncHandler(async (req: any, res) => {
    const startTime = Date.now();
    const q = (req.query.q as string || "").trim().slice(0, 200);
    if (q.length < 3) {
      success(res, { results: [], total: 0, page: 1, totalPages: 0 });
      return;
    }

    const VALID_STATUSES = ["ACTIVE", "NEWLY_GRANTED", "REMOVED_REVOKED", "GRACE_PERIOD"];
    const statusParam = (req.query.status as string || "").toUpperCase();
    const status = VALID_STATUSES.includes(statusParam) ? statusParam : undefined;
    const town = (req.query.town as string || "").trim() || undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

    const opts = { status, town, page, limit };

    const cacheKey = `sponsors:search:${Buffer.from(JSON.stringify({ q, status, town, page, limit })).toString("base64")}`;
    const cached = await cacheGet<PagedSearchResult>(cacheKey);
    if (cached) {
      success(res, cached);
      return;
    }

    await ensureIndexReady();
    const paged = isIndexReady()
      ? searchSponsors(q, opts)
      : await searchSponsorsFallback(q, opts);

    const searchResult = paged ?? { results: [], total: 0, page: 1, totalPages: 1 };
    await cacheSet(cacheKey, searchResult, 300);
    const searchSuccess = !(searchResult.results.length === 0 && isIndexReady());
    recordSearchRequest(searchSuccess, Date.now() - startTime);

    success(res, {
      ...searchResult,
      searchType: isIndexReady() ? 'index' : 'database'
    });
  }));

  app.get('/api/sponsors/historical-search', freeSearchRateLimit, asyncHandler(async (req: any, res) => {
    const q = (req.query.q as string || "").trim().slice(0, 200);
    if (q.length < 3) {
      throw new ApiError(400, "Search query must be at least 3 characters long.");
    }

    const results = await searchRevokedSponsors(q, 10);
    success(res, { results });
  }));

  app.get('/api/daily-digest/current', asyncHandler(async (_req: any, res) => {
    const cacheKey = 'sponsors:daily-digest:current';
    const cached = await cacheGet(cacheKey);
    if (cached) {
      success(res, cached);
      return;
    }

    const result = await db
      .select()
      .from(dailyDigest)
      .where(eq(dailyDigest.displayedOnLanding, true))
      .orderBy(desc(dailyDigest.snapshotDate))
      .limit(1);

    if (result.length === 0) {
      success(res, { available: false });
      return;
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

    const response = {
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
    };

    await cacheSet(cacheKey, response, 300);
    success(res, response);
  }));

  app.post('/api/admin/daily-digest/refresh', requireRole("admin"), asyncHandler(async (req: any, res) => {
    const latestChanges = await db
      .select({
        changeType: sponsorChanges.changeType,
        organisationName: sponsorChanges.organisationName,
        count: sql<number>`count(*)::int`,
      })
      .from(sponsorChanges)
      .where(eq(sponsorChanges.isTest, false))
      .groupBy(sponsorChanges.changeType, sponsorChanges.organisationName)
      .orderBy(desc(sql`count(*)`))
      .limit(50);

    const today = new Date().toISOString().split("T")[0];
    let addedCount = 0, updatedCount = 0, removedCount = 0;
    const removedCompanies: string[] = [];
    const addedCompanies: string[] = [];

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

    const headlineResult = await generateHeadline({
      snapshotDate: today,
      addedCount,
      updatedCount,
      removedCount,
      removedCompanies,
      addedCompanies,
    });

    const hasChanges = addedCount > 0 || removedCount > 0 || updatedCount > 0;

    // Atomically swap displayedOnLanding — wrap the bulk-flip and insert
    // in a single transaction so the frontend never sees available:false
    // between the two operations.
    if (hasChanges) {
      await db.transaction(async (tx) => {
        await tx.update(dailyDigest).set({ displayedOnLanding: false });
        await tx.insert(dailyDigest).values({
          snapshotDate: today,
          addedCount,
          updatedCount,
          removedCount,
          headlineGenerated: headlineResult.headline,
          headlineVariants: headlineResult.variants,
          displayedOnLanding: true,
          selectedVariantIndex: 0,
          aiModel: headlineResult.model,
          generatedAt: new Date(),
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
      });
    } else {
      await db.insert(dailyDigest).values({
        snapshotDate: today,
        addedCount,
        updatedCount,
        removedCount,
        headlineGenerated: headlineResult.headline,
        headlineVariants: headlineResult.variants,
        displayedOnLanding: false,
        selectedVariantIndex: 0,
        aiModel: headlineResult.model,
        generatedAt: new Date(),
      }).onConflictDoUpdate({
        target: dailyDigest.snapshotDate,
        set: {
          headlineGenerated: headlineResult.headline,
          headlineVariants: headlineResult.variants,
          displayedOnLanding: false,
          selectedVariantIndex: 0,
          aiModel: headlineResult.model,
          generatedAt: new Date(),
        },
      });
    }

    // Flush Redis so the frontend gets fresh data immediately after admin refresh.
    await flushSponsorCaches();

    success(res, { headline: headlineResult.headline, model: headlineResult.model, hasChanges });
  }));

  app.get('/api/sponsors/directory', directoryRateLimit, asyncHandler(async (req: any, res) => {
    const dirParsed = z.object({
      name:   z.string().trim().max(200).optional().default(""),
      status: z.preprocess(
        (v) => typeof v === "string" && v.trim() ? v.trim().toUpperCase() : undefined,
        z.enum(["ACTIVE", "NEWLY_GRANTED", "REMOVED_REVOKED", "GRACE_PERIOD"]).optional(),
      ),
      town:   z.string().trim().max(200).optional().default(""),
      route:  z.string().trim().max(200).optional().default(""),
      letter: z.string().trim().max(1).regex(/^[A-Za-z]$/).optional(),
      page:   z.coerce.number().int().min(1).max(10_000).default(1),
      limit:  z.coerce.number().int().min(1).max(100).default(50),
    }).safeParse(req.query);
    if (!dirParsed.success) {
      throw new ApiError(400, "Invalid query parameters.");
    }
    const name   = dirParsed.data.name   || null;
    const status = dirParsed.data.status ?? null;
    const town   = dirParsed.data.town   || null;
    const route  = dirParsed.data.route  || null;
    const letter = dirParsed.data.letter ?? null;
    const page   = dirParsed.data.page;
    const limit  = dirParsed.data.limit;
    const offset = (page - 1) * limit;

    const nameFilter   = name   ? sql`AND current_name ILIKE ${"%" + name + "%"}`     : sql``;
    const statusFilter = status ? sql`AND status = ${status}`                          : sql``;
    const townFilter   = town   ? sql`AND town_city ILIKE ${"%" + town + "%"}`         : sql``;
    const routeFilter  = route  ? sql`AND route ILIKE ${"%" + route + "%"}`            : sql``;
    const letterFilter = letter ? sql`AND current_name ILIKE ${letter.toUpperCase() + "%"}` : sql``;

    type DirectoryStats = { active: number; newlyGranted: number; removedThisWeek: number; gracePeriod: number };
    type DirectoryResponse = { results: unknown[]; total: number; page: number; totalPages: number; limit: number; stats: DirectoryStats };

    const dirCacheKey = `sponsors:dir:${Buffer.from(JSON.stringify({ name, status, town, route, letter, page, limit })).toString("base64")}`;
    const dirCached = await cacheGet<DirectoryResponse>(dirCacheKey);
    if (dirCached) {
      res.set("Cache-Control", "public, max-age=60");
      success(res, dirCached);
      return;
    }

    let stats = await cacheGet<DirectoryStats>("sponsors:stats");

    const [rows, countRows] = await Promise.all([
      db.execute(sql`
        SELECT
          id,
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
          ${letterFilter}
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
          ${letterFilter}
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
      stats: stats!,
    };
    await cacheSet(dirCacheKey, dirResponse, 300);
    res.set("Cache-Control", "public, max-age=60");
    success(res, dirResponse);
  }));

  app.get('/api/sponsors/:fingerprint/history', isAuthenticated, asyncHandler(async (req: any, res) => {
    const { fingerprint } = req.params;
    if (!fingerprint || typeof fingerprint !== 'string') {
      throw new ApiError(400, "Fingerprint is required.");
    }

    const canonical = await db
      .select({
        currentName: sponsorCanonical.currentName,
        historicalNames: sponsorCanonical.historicalNames,
        fingerprint: sponsorCanonical.fingerprint,
        townCity: sponsorCanonical.townCity,
        typeRating: sponsorCanonical.typeRating,
        route: sponsorCanonical.route,
        status: sponsorCanonical.status,
        firstSeen: sponsorCanonical.firstSeen,
        lastSeen: sponsorCanonical.lastSeen,
      })
      .from(sponsorCanonical)
      .where(eq(sponsorCanonical.fingerprint, fingerprint))
      .limit(1);

    if (canonical.length === 0) {
      throw new ApiError(404, "Company not found.");
    }

    const record = canonical[0];
    const allNames = [record.currentName, ...(record.historicalNames || [])];

    const changes = await db
      .select({
        id: sponsorChanges.id,
        detectedAt: sponsorChanges.detectedAt,
        changeType: sponsorChanges.changeType,
        organisationName: sponsorChanges.organisationName,
        previousValue: sponsorChanges.previousValue,
        newValue: sponsorChanges.newValue,
        snapshotDate: sponsorChanges.snapshotDate,
      })
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

    success(res, {
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
  }));

  app.post('/api/watches', isAuthenticated, asyncHandler(async (req: any, res) => {
    const watchSchema = z.object({
      organisation_name: z.string().trim().min(1, "Organisation name is required").max(300),
      town_city: z.string().trim().max(200).optional(),
      fingerprint: z.string().max(500).optional(),
    });
    const parsed = watchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.errors.map(e => e.message).join(', '));
    }
    const { organisation_name, town_city, fingerprint: fpParam } = parsed.data;

    const userSub = req.user.subscriptionStatus || "free";
    if (userSub === "free" || !userSub) {
      throw new ApiError(403, "Upgrade to Starter plan to add companies to your watchlist. Free users can view search results and history only.");
    }

    const userId = req.user.id;
    const normalized = normalizeName(organisation_name.trim());

    let canonicalMatch;
    if (fpParam) {
      const match = await db
        .select({
          fingerprint: sponsorCanonical.fingerprint,
          currentName: sponsorCanonical.currentName,
          townCity: sponsorCanonical.townCity,
          status: sponsorCanonical.status,
        })
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.fingerprint, fpParam))
        .limit(1);
      canonicalMatch = match[0] || null;
    }

    if (!canonicalMatch) {
      const fp = generateFingerprint(organisation_name.trim(), town_city || "", "");
      const fpMatch = await db
        .select({
          fingerprint: sponsorCanonical.fingerprint,
          currentName: sponsorCanonical.currentName,
          townCity: sponsorCanonical.townCity,
          status: sponsorCanonical.status,
        })
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.fingerprint, fp))
        .limit(1);
      canonicalMatch = fpMatch[0] || null;
    }

    if (!canonicalMatch) {
      const normalizedCity = town_city ? normalizeName(town_city.trim()) : null;
      const candidateRecords = await db
        .select({
          fingerprint: sponsorCanonical.fingerprint,
          currentName: sponsorCanonical.currentName,
          townCity: sponsorCanonical.townCity,
          status: sponsorCanonical.status,
        })
        .from(sponsorCanonical)
        .where(
          inArray(sponsorCanonical.status, ['ACTIVE', 'GRACE_PERIOD', 'NEWLY_GRANTED'])
        );

      canonicalMatch = candidateRecords.find(m => {
        const mNorm = normalizeName(m.currentName);
        if (mNorm !== normalized) return false;
        if (normalizedCity && m.townCity) {
          return normalizeName(m.townCity) === normalizedCity;
        }
        return true;
      }) || null;
    }

    if (!canonicalMatch) {
      throw new ApiError(404, "Company not found in the sponsor register. Please check the name and try again.");
    }

    const existingWatch = await db
      .select({
        id: companyWatches.id,
        isActive: companyWatches.isActive,
      })
      .from(companyWatches)
      .where(and(
        eq(companyWatches.userId, userId),
        eq(companyWatches.organisationNameNormalized, normalized),
      ))
      .limit(1);

    if (existingWatch.length > 0 && existingWatch[0].isActive) {
      throw new ApiError(409, "You are already watching this company.");
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
        throw new ApiError(403, `You have reached your watch limit of ${limit}. Upgrade your plan to watch more companies.`);
      }
    }

    if (existingWatch.length > 0) {
      await db
        .update(companyWatches)
        .set({ isActive: true, fingerprint: canonicalMatch.fingerprint })
        .where(eq(companyWatches.id, existingWatch[0].id));
      if (canonicalMatch.status === "REMOVED_REVOKED") {
        await ensureReactivationWatch(userId, canonicalMatch.currentName);
      }
      success(res, { message: "Watch reactivated.", watch: { ...existingWatch[0], isActive: true } });
      return;
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

    if (canonicalMatch.status === "REMOVED_REVOKED") {
      await ensureReactivationWatch(userId, canonicalMatch.currentName);
    }

    await cacheFlushPattern('watches:*');
    res.status(201);
    success(res, { message: "Watch created.", watch: newWatch });
  }));

  app.get('/api/watches', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id;
    const cacheKey = `watches:${userId}`;

    const cached = await cacheGet(cacheKey);
    if (cached) {
      success(res, cached);
      return;
    }

    const watches = await db
      .select({
        id: companyWatches.id,
        userId: companyWatches.userId,
        organisationName: companyWatches.organisationName,
        organisationNameNormalized: companyWatches.organisationNameNormalized,
        townCity: companyWatches.townCity,
        fingerprint: companyWatches.fingerprint,
        isActive: companyWatches.isActive,
        createdAt: companyWatches.createdAt,
      })
      .from(companyWatches)
      .where(eq(companyWatches.userId, userId))
      .orderBy(desc(companyWatches.createdAt));

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

    let allCanonicalRows: { fingerprint: string; currentName: string; townCity: string | null; typeRating: string | null; route: string | null; status: string }[] = [];
    if (unfingerprintedWatches.length > 0) {
      // Pre-filter in SQL instead of loading the entire ~140k-row table into
      // memory. The exact normalizeName() comparison below still decides the
      // match; this only has to avoid discarding a true candidate.
      //
      // Matching on the whole normalized name would be WRONG: normalizeName()
      // deletes characters (`&`, apostrophes), so "Smith & Jones Ltd"
      // normalizes to "smith jones" which is not a substring of the raw
      // "smith & jones ltd". Instead match a single normalized *token*
      // against the raw name with the same characters stripped. A token is a
      // maximal run of [a-z0-9_]; both sides delete exactly the same
      // characters, and suffix removal only ever drops whole tokens, so a
      // token is guaranteed to survive contiguously on the SQL side.
      // Named "fragment" rather than "token": this is a piece of a company
      // name, and calling it a token trips security/detect-possible-timing-attacks.
      const tokenPatterns = unfingerprintedWatches.map((w) => {
        const fragment = namePrefilterToken(w.organisationName);
        if (fragment === null) return null;
        // Escape LIKE wildcards so a name containing % or _ matches literally.
        const escaped = fragment.replace(/[%_\\]/g, (c) => "\\" + c);
        return `%${escaped}%`;
      });

      // A watch whose name normalizes to nothing has no safe pattern — fall
      // back to an unfiltered read rather than silently dropping it.
      const canPrefilter = tokenPatterns.every((p) => p !== null);
      const uniquePatterns = [...new Set(tokenPatterns.filter((p): p is string => p !== null))];

      const strippedName = sql`regexp_replace(lower(${sponsorCanonical.currentName}), '[^a-z0-9_ ]', '', 'g')`;

      const baseQuery = db
        .select({
          fingerprint: sponsorCanonical.fingerprint,
          currentName: sponsorCanonical.currentName,
          townCity: sponsorCanonical.townCity,
          typeRating: sponsorCanonical.typeRating,
          route: sponsorCanonical.route,
          status: sponsorCanonical.status,
        })
        .from(sponsorCanonical);

      allCanonicalRows = canPrefilter
        ? await baseQuery.where(or(...uniquePatterns.map((p) => sql`${strippedName} LIKE ${p}`)))
        : await baseQuery;
    }

    const orgNames = [...new Set(watches.map((w) => w.organisationName).filter(Boolean))];
    const allRecentChanges = orgNames.length > 0
      ? await db
        .select({
          id: sponsorChanges.id,
          detectedAt: sponsorChanges.detectedAt,
          changeType: sponsorChanges.changeType,
          organisationName: sponsorChanges.organisationName,
          previousValue: sponsorChanges.previousValue,
          newValue: sponsorChanges.newValue,
          snapshotDate: sponsorChanges.snapshotDate,
        })
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

    const enriched = watches.map((watch) => {
      let currentStatus: { listed: boolean; typeRating: string | null; route: string | null; status: string } = {
        listed: false,
        typeRating: null,
        route: null,
        status: "UNKNOWN",
      };

      const isListed = (s: string) => s === "ACTIVE" || s === "NEWLY_GRANTED";

      if (watch.fingerprint) {
        const c = canonicalByFingerprint.get(watch.fingerprint);
        if (c) {
          currentStatus = { listed: isListed(c.status), typeRating: c.typeRating, route: c.route, status: c.status };
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
          currentStatus = { listed: isListed(match.status), typeRating: match.typeRating, route: match.route, status: match.status };
          db.update(companyWatches)
            .set({ fingerprint: match.fingerprint })
            .where(eq(companyWatches.id, watch.id))
            .catch((err) => logger.error({ err, watchId: watch.id }, "[CompanyWatch] Failed to update fingerprint for watch id"));
        }
      }

      const recentChanges = (changesByOrg.get(watch.organisationName) ?? []).slice(0, 5);

      return { ...watch, currentStatus, recentChanges };
    });

    await cacheSet(cacheKey, enriched, 60);
    success(res, enriched);
  }));

  app.delete('/api/watches/:id', isAuthenticated, asyncHandler(async (req: any, res) => {
    const watchId = parseInt(req.params.id, 10);
    if (isNaN(watchId)) {
      throw new ApiError(400, "Invalid watch ID.");
    }

    const existing = await db
      .select({
        id: companyWatches.id,
        userId: companyWatches.userId,
      })
      .from(companyWatches)
      .where(eq(companyWatches.id, watchId))
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Watch not found.");
    }

    if (existing[0].userId !== req.user.id) {
      throw new ApiError(403, "You can only manage your own watches.");
    }

    await db
      .update(companyWatches)
      .set({ isActive: false })
      .where(eq(companyWatches.id, watchId));

    await cacheFlushPattern('watches:*');
    success(res, { message: "Watch deactivated." });
  }));

  app.patch('/api/watches/:id/reactivate', isAuthenticated, asyncHandler(async (req: any, res) => {
    const watchId = parseInt(req.params.id, 10);
    if (isNaN(watchId)) {
      throw new ApiError(400, "Invalid watch ID.");
    }

    const existing = await db
      .select({
        id: companyWatches.id,
        userId: companyWatches.userId,
        isActive: companyWatches.isActive,
      })
      .from(companyWatches)
      .where(eq(companyWatches.id, watchId))
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Watch not found.");
    }

    if (existing[0].userId !== req.user.id) {
      throw new ApiError(403, "You can only manage your own watches.");
    }

    if (existing[0].isActive) {
      success(res, { message: "Watch is already active." });
      return;
    }

    await db
      .update(companyWatches)
      .set({ isActive: true })
      .where(eq(companyWatches.id, watchId));

    await cacheFlushPattern('watches:*');
    success(res, { message: "Watch reactivated." });
  }));

  app.get('/api/sponsor-changes', changesRateLimit, asyncHandler(async (req, res) => {
    const changesCached = await cacheGet<{ changes: unknown[]; grouped: unknown; totalCount: number }>("sponsors:changes");
    if (changesCached) {
      res.set("Cache-Control", "public, max-age=60");
      success(res, changesCached);
      return;
    }

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
      .where(and(gte(sponsorChanges.detectedAt, sevenDaysAgo), eq(sponsorChanges.isTest, false)))
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
    res.set("Cache-Control", "public, max-age=60");
    success(res, changesResponse);
  }));

  app.post('/api/sponsor-watch', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id as string;

    const userSub = req.user.subscriptionStatus || "free";
    if (userSub === "free" || !userSub) {
      throw new ApiError(403, "Upgrade to Starter plan to set reactivation alerts.");
    }

    const parsed = z.object({
      companyName: z.string().trim().min(1),
      companyNumber: z.string().trim().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      throw new ApiError(400, 'companyName is required');
    }

    const { companyName, companyNumber } = parsed.data;

    const existing = await storage.getSponsorWatchesByUserId(userId, 'pending_activation');
    const duplicate = existing.some(
      (w) => w.companyName.toLowerCase() === companyName.toLowerCase()
    );
    if (duplicate) {
      throw new ApiError(409, 'You already have an active watch for this company');
    }

    const watch = await storage.createSponsorWatch(userId, { userId, companyName, companyNumber });
    res.status(201);
    success(res, watch);
  }));

  app.delete('/api/sponsor-watch/:id', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id as string;
    const { id } = req.params;

    const watch = await storage.getSponsorWatchById(id);
    if (!watch) {
      throw new ApiError(404, 'Watch not found');
    }
    if (watch.userId !== userId) {
      throw new ApiError(403, 'Not authorised to cancel this watch');
    }

    await storage.cancelSponsorWatch(id);
    success(res, { message: 'Watch cancelled' });
  }));

  app.get('/api/sponsor-watch', isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.id as string;
    const status = req.query.status as string | undefined;

    const data = await storage.getSponsorWatchesByUserId(userId, status);
    success(res, { data, total: data.length });
  }));
}
