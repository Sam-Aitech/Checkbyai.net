/**
 * Enrichment Worker — Pro Intelligence Pipeline
 * ===============================================
 * Manages the async enrichment of ~124k sponsor records with:
 *   - Companies House financial/incorporation data (via official CH REST API directly)
 *   - Historical licence timeline (scraped from licensed-sponsors-uk.com via Crawl4AI)
 *
 * Architecture:
 *   - PostgreSQL `enrichment_queue` table is the durable state ledger (survives Redis restarts).
 *   - `FOR UPDATE SKIP LOCKED` subquery ensures safe concurrent batch claiming with no races.
 *   - Table-backed lock "enrichmentSeed" guards the nightly seeder (not the batch runner — batch is race-safe).
 *   - Exponential backoff + jitter on transient failures; 5-minute queue pause on CF blocks.
 *
 * Cron schedule:
 *   - 02:00 UTC daily  -> seedEnrichmentQueue (inserts missing rows, respects priorities)
 *   - :15 every hour   -> runEnrichmentBatch (processes up to 50 items per run)
 */

import cron from "node-cron";
import { db } from "../db";
import {
  enrichmentQueue,
  sponsorEnrichment,
  sponsorLicenceTimeline,
  sponsorCanonical,
  companyWatches,
} from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { startJobRun, finishJobRun } from "./jobTelemetry";
import crypto from "crypto";
import { tryAcquireLock, releaseLock } from "./lockManager";

const log = logger.child({ module: "EnrichmentWorker" });

// ── Constants ─────────────────────────────────────────────────────────────────

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const CH_API_KEY = process.env.COMPANIES_HOUSE_API_KEY ?? "";
const CH_BASE = "https://api.company-information.service.gov.uk";
const FUZZY_ACCEPT_SCORE = 72; // minimum token-overlap % to accept a CH name match
const BATCH_SIZE = 50;
const QUEUE_PAUSE_MS = 5 * 60 * 1000;
const SIDECAR_OFFLINE_CACHE_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

let queuePausedUntil = 0;
let sidecarOfflineUntil = 0;

async function isSidecarAvailable(): Promise<boolean> {
  if (Date.now() < sidecarOfflineUntil) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(`${PYTHON_BACKEND_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) return true;
    log.warn({ status: res.status }, "[EnrichmentWorker] Sidecar health check returned non-OK status.");
    sidecarOfflineUntil = Date.now() + SIDECAR_OFFLINE_CACHE_MS;
    return false;
  } catch {
    log.warn({ url: PYTHON_BACKEND_URL }, "[EnrichmentWorker] Sidecar unreachable — will use direct CH API for companies_house jobs.");
    sidecarOfflineUntil = Date.now() + SIDECAR_OFFLINE_CACHE_MS;
    return false;
  }
}

// ── Table-backed lock ─────────────────────────────────────────────────────────

let lockHolderId: string | null = null;
const LOCK_LEASE_MS = 30 * 60 * 1000; // 30 minutes lease duration

async function tryAcquireEnrichmentLock(): Promise<boolean> {
  try {
    if (!lockHolderId) {
      lockHolderId = crypto.randomUUID();
    }
    return await tryAcquireLock("enrichmentSeed", LOCK_LEASE_MS, lockHolderId);
  } catch {
    return false;
  }
}

async function releaseEnrichmentLock(): Promise<void> {
  if (lockHolderId) {
    await releaseLock("enrichmentSeed", lockHolderId);
    lockHolderId = null;
  }
}

// ── Direct Companies House REST API client ────────────────────────────────────

/**
 * Token-ratio fuzzy scorer — case-insensitive word overlap, strips common legal suffixes.
 * Returns 0-100. No external deps.
 */
function fuzzyScore(a: string, b: string): number {
  const normalise = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\b(ltd|limited|plc|llp|llc|inc|co|the|and)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 100;
  const setA = new Set(na.split(" ").filter(Boolean));
  const setB = new Set(nb.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return Math.round((2 * intersection / (setA.size + setB.size)) * 100);
}

interface ChProfile {
  company_number: string | null;
  company_status: string | null;
  company_type: string | null;
  incorporation_date: string | null;
  sic_codes: string[];
  registered_address: string | null;
  last_filed_accounts_date: string | null;
  next_conf_stmt_due_date: string | null;
  dissolved_at: string | null;
  historical_names: string[];
  companies_house_source: boolean;
  fuzzy_match_score: number;
  nature_of_business: null;
  website_url: null;
}

async function fetchChDirect(companyName: string): Promise<ChProfile> {
  if (!CH_API_KEY) {
    const err: any = new Error("COMPANIES_HOUSE_API_KEY not set");
    err.httpStatus = 503;
    throw err;
  }

  const authHeader = "Basic " + Buffer.from(`${CH_API_KEY}:`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const searchRes = await fetch(
      `${CH_BASE}/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=5`,
      { headers: { Authorization: authHeader }, signal: controller.signal },
    );

    if (searchRes.status === 429) {
      clearTimeout(timer);
      const err: any = new Error("Companies House rate limit hit");
      err.httpStatus = 429;
      throw err;
    }
    if (!searchRes.ok) {
      clearTimeout(timer);
      const err: any = new Error(`CH search HTTP ${searchRes.status}`);
      err.httpStatus = searchRes.status;
      throw err;
    }

    const searchJson = await searchRes.json();
    const items: any[] = searchJson.items ?? [];

    if (items.length === 0) {
      clearTimeout(timer);
      const err: any = new Error(`No CH results for "${companyName}"`);
      err.httpStatus = 404;
      throw err;
    }

    const scored = items.map((item: any) => ({
      item,
      score: fuzzyScore(companyName, item.title ?? ""),
    }));
    scored.sort((a, b) => b.score - a.score);
    const { item: best, score: bestScore } = scored[0];

    if (bestScore < FUZZY_ACCEPT_SCORE) {
      clearTimeout(timer);
      log.info(
        { companyName, bestCandidate: best.title, score: bestScore },
        "[CH Direct] No confident match — skipping.",
      );
      const err: any = new Error(`No confident CH match for "${companyName}" (score=${bestScore})`);
      err.httpStatus = 404;
      throw err;
    }

    const companyNumber: string = best.company_number ?? "";

    const [profileRes, filingRes] = await Promise.all([
      fetch(`${CH_BASE}/company/${companyNumber}`, {
        headers: { Authorization: authHeader },
        signal: controller.signal,
      }),
      fetch(
        `${CH_BASE}/company/${companyNumber}/filing-history?category=accounts&items_per_page=1`,
        { headers: { Authorization: authHeader }, signal: controller.signal },
      ),
    ]);

    clearTimeout(timer);

    const profile: any = profileRes.ok ? await profileRes.json() : {};
    const filing: any = filingRes.ok ? await filingRes.json() : {};

    const addr = profile.registered_office_address ?? {};
    const addrParts = [
      addr.address_line_1,
      addr.address_line_2,
      addr.locality,
      addr.postal_code,
      addr.country,
    ].filter(Boolean);

    const lastFiled: string | null = (filing.items ?? [])[0]?.date ?? null;

    const sicCodes: string[] = (profile.sic_codes ?? []).map((s: any) =>
      typeof s === "object" ? (s.sic_code ?? String(s)) : String(s),
    );

    const historicalNames: string[] = (profile.previous_company_names ?? []).map(
      (n: any) => n.name ?? "",
    );

    return {
      company_number: profile.company_number ?? companyNumber,
      company_status: profile.company_status ?? null,
      company_type: profile.type ?? null,
      incorporation_date: profile.date_of_creation ?? null,
      sic_codes: sicCodes,
      registered_address: addrParts.join(", ") || null,
      last_filed_accounts_date: lastFiled,
      next_conf_stmt_due_date: profile.confirmation_statement?.next_due ?? null,
      dissolved_at: profile.date_of_cessation ?? null,
      historical_names: historicalNames,
      companies_house_source: true,
      fuzzy_match_score: Math.round(bestScore) / 100,
      nature_of_business: null,
      website_url: null,
    };
  } catch (err: any) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Sidecar HTTP client (licence history only) ───────────────────────────────

interface SidecarCall {
  fingerprint: string;
  company_name: string;
  town?: string | null;
}

async function callSidecar<T>(
  endpoint: string,
  body: SidecarCall,
  timeoutMs = 45_000,
): Promise<{ status: number; data: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { status: res.status, data: null };
    const json = await res.json();
    return { status: 200, data: json.data as T };
  } catch {
    clearTimeout(timer);
    return { status: 0, data: null };
  }
}

function backoffDelayMs(attemptCount: number): number {
  const base = Math.pow(2, attemptCount) * 30_000;
  const jitter = Math.floor(Math.random() * 15_000);
  return base + jitter;
}

// ── Nightly queue seeder ──────────────────────────────────────────────────────

export async function seedEnrichmentQueue(): Promise<{ inserted: number }> {
  const lockAcquired = await tryAcquireEnrichmentLock();
  if (!lockAcquired) {
    log.info("seedEnrichmentQueue: table-backed lock held by another instance — skipping.");
    return { inserted: 0 };
  }

  try {
    const [watched, newlyGranted, active] = await Promise.all([
      db
        .selectDistinct({ fingerprint: companyWatches.fingerprint })
        .from(companyWatches)
        .where(eq(companyWatches.isActive, true)),
      db
        .select({ fingerprint: sponsorCanonical.fingerprint })
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.status, "NEWLY_GRANTED")),
      db
        .select({ fingerprint: sponsorCanonical.fingerprint })
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.status, "ACTIVE")),
    ]);

    const watchedSet = new Set(
      watched.map((r) => r.fingerprint).filter((f): f is string => f !== null),
    );
    const newlyGrantedSet = new Set(
      newlyGranted.map((r) => r.fingerprint).filter((f): f is string => f !== null),
    );
    const jobTypes = ["companies_house", "licence_history"] as const;
    type Row = typeof enrichmentQueue.$inferInsert;
    const rows: Row[] = [];

    for (const fp of watchedSet) {
      for (const jt of jobTypes)
        rows.push({ fingerprint: fp, jobType: jt, priority: 10, status: "pending", nextAttemptAt: new Date() });
    }
    for (const { fingerprint: fp } of newlyGranted) {
      if (watchedSet.has(fp)) continue;
      for (const jt of jobTypes)
        rows.push({ fingerprint: fp, jobType: jt, priority: 5, status: "pending", nextAttemptAt: new Date() });
    }
    for (const { fingerprint: fp } of active) {
      if (watchedSet.has(fp) || newlyGrantedSet.has(fp)) continue;
      for (const jt of jobTypes)
        rows.push({ fingerprint: fp, jobType: jt, priority: 0, status: "pending", nextAttemptAt: new Date() });
    }

    if (rows.length === 0) {
      log.info("seedEnrichmentQueue: no rows to insert.");
      return { inserted: 0 };
    }

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const result = await db
        .insert(enrichmentQueue)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoNothing()
        .returning({ id: enrichmentQueue.id });
      inserted += result.length;
    }

    log.info({ attempted: rows.length, inserted }, "seedEnrichmentQueue: complete.");
    return { inserted };
  } finally {
    await releaseEnrichmentLock();
  }
}

// ── Batch processor ───────────────────────────────────────────────────────────

export async function runEnrichmentBatch(): Promise<{ processed: number; errors: number }> {
  if (Date.now() < queuePausedUntil) {
    const resumesIn = Math.ceil((queuePausedUntil - Date.now()) / 1000);
    log.info({ resumesIn }, "Enrichment queue paused — skipping batch.");
    return { processed: 0, errors: 0 };
  }

  const chApiAvailable = CH_API_KEY.length > 0;
  const sidecarUp = await isSidecarAvailable();

  if (!chApiAvailable && !sidecarUp) {
    log.info(
      { sidecarUrl: PYTHON_BACKEND_URL },
      "runEnrichmentBatch: no CH API key and sidecar offline — skipping batch.",
    );
    return { processed: 0, errors: 0 };
  }

  if (chApiAvailable) {
    log.info("[EnrichmentWorker] Using direct Companies House API for companies_house jobs.");
  }

  const workerId = `node-${process.pid}-${Date.now()}`;

  const claimResult = await db.execute<typeof enrichmentQueue.$inferSelect>(sql`
    UPDATE enrichment_queue
    SET    status     = 'in_progress',
           locked_at  = NOW(),
           locked_by  = ${workerId},
           updated_at = NOW()
    WHERE id IN (
      SELECT id
      FROM   enrichment_queue
      WHERE  status        IN ('pending', 'rate_limited')
        AND  next_attempt_at <= NOW()
      ORDER  BY priority DESC, next_attempt_at ASC
      LIMIT  ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  const batch = claimResult.rows;
  if (batch.length === 0) {
    log.debug("runEnrichmentBatch: no items ready.");
    return { processed: 0, errors: 0 };
  }

  log.info({ count: batch.length }, "runEnrichmentBatch: batch claimed.");

  const fingerprints = [...new Set(batch.map((r) => r.fingerprint))];
  const sponsorRows = await db
    .select({
      fingerprint: sponsorCanonical.fingerprint,
      currentName: sponsorCanonical.currentName,
      townCity: sponsorCanonical.townCity,
    })
    .from(sponsorCanonical)
    .where(inArray(sponsorCanonical.fingerprint, fingerprints));
  const sponsorMap = new Map(sponsorRows.map((s) => [s.fingerprint, s]));

  let processed = 0;
  let errors = 0;
  let rateLimitedCount = 0;
  let captchaBlockedCount = 0;

  for (const item of batch) {
    const sponsor = sponsorMap.get(item.fingerprint);
    const companyName = sponsor?.currentName ?? item.fingerprint;
    const town = sponsor?.townCity ?? null;

    try {
      if (item.jobType === "companies_house") {
        await processCompaniesHouseItem(item, companyName, town, chApiAvailable, sidecarUp);
      } else {
        if (!sidecarUp) {
          await db
            .update(enrichmentQueue)
            .set({ status: "pending", lockedAt: null, lockedBy: null, updatedAt: new Date() })
            .where(eq(enrichmentQueue.id, item.id));
          continue;
        }
        await processLicenceHistoryItem(item, companyName, town);
      }
      processed++;
    } catch (err: any) {
      errors++;
      const httpStatus: number = err?.httpStatus ?? 0;

      if (httpStatus === 429) {
        rateLimitedCount++;
        await setItemBackoff(item, "rate_limited", err.message);
      } else if (httpStatus === 503) {
        captchaBlockedCount++;
        await setItemStatus(item, "captcha_blocked", err.message);
      } else if (httpStatus === 404) {
        await setItemStatus(item, "no_match", err.message);
      } else {
        const nextAttempt = (item.attemptCount ?? 0) + 1;
        if (nextAttempt >= MAX_ATTEMPTS) {
          await setItemStatus(item, "failed", err.message);
        } else {
          const delay = backoffDelayMs(nextAttempt);
          await db
            .update(enrichmentQueue)
            .set({
              status: "pending",
              attemptCount: nextAttempt,
              lastAttemptedAt: new Date(),
              nextAttemptAt: new Date(Date.now() + delay),
              lockedAt: null,
              lockedBy: null,
              errorMessage: String(err?.message ?? err),
              updatedAt: new Date(),
            })
            .where(eq(enrichmentQueue.id, item.id));
        }
      }
    }
  }

  if (captchaBlockedCount > 0 || rateLimitedCount >= batch.length) {
    queuePausedUntil = Date.now() + QUEUE_PAUSE_MS;
    log.warn(
      { rateLimitedCount, captchaBlockedCount },
      "Enrichment queue paused 5 min — rate limit / Cloudflare block detected.",
    );
  }

  log.info({ processed, errors, rateLimitedCount, captchaBlockedCount }, "runEnrichmentBatch: done.");
  return { processed, errors };
}

// ── Item processors ───────────────────────────────────────────────────────────

async function processCompaniesHouseItem(
  item: typeof enrichmentQueue.$inferSelect,
  companyName: string,
  town: string | null,
  chApiAvailable: boolean,
  sidecarUp: boolean,
): Promise<void> {
  let data: Record<string, any> | null = null;

  if (chApiAvailable) {
    data = (await fetchChDirect(companyName)) as Record<string, any>;
  } else if (sidecarUp) {
    const result = await callSidecar<Record<string, any>>(
      "/api/v1/enrich/companies-house",
      { fingerprint: item.fingerprint, company_name: companyName, town },
    );
    if (result.status !== 200 || !result.data) {
      const err: any = new Error(`CH sidecar HTTP ${result.status} for "${companyName}"`);
      err.httpStatus = result.status;
      throw err;
    }
    data = result.data;
  } else {
    await db
      .update(enrichmentQueue)
      .set({ status: "pending", lockedAt: null, lockedBy: null, updatedAt: new Date() })
      .where(eq(enrichmentQueue.id, item.id));
    return;
  }

  const enrichmentValues = {
    fingerprint: item.fingerprint,
    companyNumber: data.company_number ?? null,
    natureOfBusiness: data.nature_of_business ?? null,
    registeredAddress: data.registered_address ?? null,
    websiteUrl: data.website_url ?? null,
    scrapeStatus: "success" as const,
    scrapedAt: new Date(),
    lastAttempted: new Date(),
    companyStatus: data.company_status ?? null,
    companyType: data.company_type ?? null,
    incorporationDate: data.incorporation_date ?? null,
    sicCodes: data.sic_codes ?? [],
    lastFiledAccountsDate: data.last_filed_accounts_date ?? null,
    nextConfStmtDueDate: data.next_conf_stmt_due_date ?? null,
    dissolvedAt: data.dissolved_at ?? null,
    companiesHouseSource: data.companies_house_source ?? false,
    fuzzyMatchScore: data.fuzzy_match_score != null ? String(data.fuzzy_match_score) : null,
    historicalNamesRaw: data.historical_names ?? [],
  };

  await db
    .insert(sponsorEnrichment)
    .values(enrichmentValues)
    .onConflictDoUpdate({
      target: sponsorEnrichment.fingerprint,
      set: enrichmentValues,
    });

  await setItemStatus(item, "completed", null);
}

async function processLicenceHistoryItem(
  item: typeof enrichmentQueue.$inferSelect,
  companyName: string,
  town: string | null,
): Promise<void> {
  const { status, data } = await callSidecar<Array<Record<string, any>>>(
    "/api/v1/enrich/licence-history",
    { fingerprint: item.fingerprint, company_name: companyName, town },
  );

  if (status !== 200 || data === null) {
    const err: any = new Error(`LSUK sidecar HTTP ${status} for "${companyName}"`);
    err.httpStatus = status;
    throw err;
  }

  if (data.length === 0) {
    await setItemStatus(item, "completed", "no_history_rows");
    return;
  }

  const rows = data.map((r) => ({
    fingerprint: item.fingerprint,
    recordedDate: r.recorded_date,
    licenceStatus: r.licence_status,
    route: r.route ?? null,
    typeRating: r.type_rating ?? null,
    organisationName: r.organisation_name ?? null,
    source: "lsuk-scrape",
    scrapedAt: r.scraped_at ? new Date(r.scraped_at) : new Date(),
    createdAt: new Date(),
  }));

  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(sponsorLicenceTimeline)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }

  await setItemStatus(item, "completed", null);
}

// ── Queue item state helpers ──────────────────────────────────────────────────

async function setItemStatus(
  item: typeof enrichmentQueue.$inferSelect,
  status: string,
  errorMessage: string | null,
): Promise<void> {
  await db
    .update(enrichmentQueue)
    .set({
      status,
      attemptCount: (item.attemptCount ?? 0) + 1,
      lastAttemptedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(enrichmentQueue.id, item.id));
}

async function setItemBackoff(
  item: typeof enrichmentQueue.$inferSelect,
  status: string,
  errorMessage: string | null,
): Promise<void> {
  const nextAttempt = (item.attemptCount ?? 0) + 1;
  const delay = backoffDelayMs(nextAttempt);
  await db
    .update(enrichmentQueue)
    .set({
      status,
      attemptCount: nextAttempt,
      lastAttemptedAt: new Date(),
      nextAttemptAt: new Date(Date.now() + delay),
      lockedAt: null,
      lockedBy: null,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(enrichmentQueue.id, item.id));
}

// ── Cron scheduler ────────────────────────────────────────────────────────────

export function startEnrichmentCron(): void {
  const seedCutover = (process.env.CUTOVER_ENRICHMENT_SEED ?? "false").trim().toLowerCase();
  const batchCutover = (process.env.CUTOVER_ENRICHMENT_BATCH ?? "false").trim().toLowerCase();

  if (seedCutover !== "true" && seedCutover !== "1") {
    cron.schedule("0 2 * * *", async () => {
      try {
        log.info("Nightly enrichment queue seed starting...");
        const telemetry = startJobRun("enrichmentSeed", "cron", "inline");
        let outcome: "success" | "failed" = "success";
        let failureReason: string | null = null;
        try {
          const { inserted } = await seedEnrichmentQueue();
          log.info({ inserted }, "Nightly enrichment queue seed complete.");
        } catch (err) {
          outcome = "failed";
          failureReason = err instanceof Error ? err.message : String(err);
          log.error({ err }, "Enrichment queue seed failed.");
        } finally {
          finishJobRun({ ...telemetry, jobName: "enrichmentSeed", triggerSource: "cron", runMode: "inline", result: outcome, failureReason });
        }
      } catch (err) {
        log.error({ err }, "Enrichment cron outer error.");
      }
    });
    log.info("Enrichment seed inline cron registered (CUTOVER_ENRICHMENT_SEED not set).");
  } else {
    log.info("Enrichment seed inline cron suppressed — owned by central scheduler.");
  }

  if (batchCutover !== "true" && batchCutover !== "1") {
    cron.schedule("15 * * * *", async () => {
      try {
        const telemetry = startJobRun("enrichmentBatch", "cron", "inline");
        let outcome: "success" | "failed" = "success";
        let failureReason: string | null = null;
        try {
          await runEnrichmentBatch();
        } catch (err) {
          outcome = "failed";
          failureReason = err instanceof Error ? err.message : String(err);
          log.error({ err }, "Enrichment batch run failed.");
        } finally {
          finishJobRun({ ...telemetry, jobName: "enrichmentBatch", triggerSource: "cron", runMode: "inline", result: outcome, failureReason });
        }
      } catch (err) {
        log.error({ err }, "Enrichment cron outer error.");
      }
    });
    log.info("Enrichment batch inline cron registered (CUTOVER_ENRICHMENT_BATCH not set).");
  } else {
    log.info("Enrichment batch inline cron suppressed — owned by central scheduler.");
  }
}
