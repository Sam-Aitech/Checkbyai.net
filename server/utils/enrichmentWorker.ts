/**
 * Enrichment Worker — Pro Intelligence Pipeline
 * ===============================================
 * Manages the async enrichment of ~124k sponsor records with:
 *   - Companies House financial/incorporation data (via official API or stealth fallback)
 *   - Historical licence timeline (scraped from licensed-sponsors-uk.com via Crawl4AI)
 *
 * Architecture:
 *   - PostgreSQL `enrichment_queue` table is the durable state ledger (survives Redis restarts).
 *   - `FOR UPDATE SKIP LOCKED` subquery ensures safe concurrent batch claiming with no races.
 *   - Advisory lock 7483922 guards the nightly seeder (not the batch runner — batch is race-safe).
 *   - Exponential backoff + jitter on transient failures; 5-minute queue pause on CF blocks.
 *
 * Cron schedule:
 *   - 02:00 UTC daily  → seedEnrichmentQueue (inserts missing rows, respects priorities)
 *   - :15 every hour   → runEnrichmentBatch (processes up to 50 items per run)
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
import { eq, sql, and, inArray, lte } from "drizzle-orm";
import { logger } from "./logger";

const log = logger.child({ module: "EnrichmentWorker" });

// ── Constants ─────────────────────────────────────────────────────────────────

const ADVISORY_LOCK_KEY = 7483922; // Distinct from 7483920 (monitor) and 7483921 (job alerts)
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const BATCH_SIZE = 50;
const QUEUE_PAUSE_MS = 5 * 60 * 1000; // 5 min on CF block or mass rate limit
const MAX_ATTEMPTS = 5;

/** In-memory pause timestamp. Survives within a single process. */
let queuePausedUntil = 0;

// ── Advisory lock ─────────────────────────────────────────────────────────────

async function tryAcquireEnrichmentLock(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS acquired`
    );
    return (result.rows[0] as any)?.acquired === true;
  } catch {
    return false;
  }
}

async function releaseEnrichmentLock(): Promise<void> {
  await db
    .execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`)
    .catch(() => {});
}

// ── Sidecar HTTP client ───────────────────────────────────────────────────────

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

// ── Exponential backoff with jitter ──────────────────────────────────────────

function backoffDelayMs(attemptCount: number): number {
  const base = Math.pow(2, attemptCount) * 30_000; // 30s → 60s → 120s → 240s → 480s
  const jitter = Math.floor(Math.random() * 15_000);
  return base + jitter;
}

// ── Nightly queue seeder ──────────────────────────────────────────────────────

/**
 * Inserts enrichment_queue rows for all sponsors that don't already have one.
 * Uses INSERT … ON CONFLICT DO NOTHING — fully idempotent.
 * Priority:
 *   10 — sponsors on any user's active watchlist
 *    5 — NEWLY_GRANTED sponsors (high user interest, appeared today)
 *    0 — all remaining ACTIVE sponsors
 */
export async function seedEnrichmentQueue(): Promise<{ inserted: number }> {
  const lockAcquired = await tryAcquireEnrichmentLock();
  if (!lockAcquired) {
    log.info("seedEnrichmentQueue: advisory lock held by another instance — skipping.");
    return { inserted: 0 };
  }

  try {
    // Collect fingerprints by priority bucket
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

    const watchedSet = new Set(watched.map((r) => r.fingerprint));
    const newlyGrantedSet = new Set(newlyGranted.map((r) => r.fingerprint));
    const jobTypes = ["companies_house", "licence_history"] as const;
    type Row = typeof enrichmentQueue.$inferInsert;
    const rows: Row[] = [];

    for (const fp of watchedSet) {
      for (const jt of jobTypes) {
        rows.push({ fingerprint: fp, jobType: jt, priority: 10, status: "pending", nextAttemptAt: new Date() });
      }
    }
    for (const { fingerprint: fp } of newlyGranted) {
      if (watchedSet.has(fp)) continue;
      for (const jt of jobTypes) {
        rows.push({ fingerprint: fp, jobType: jt, priority: 5, status: "pending", nextAttemptAt: new Date() });
      }
    }
    for (const { fingerprint: fp } of active) {
      if (watchedSet.has(fp) || newlyGrantedSet.has(fp)) continue;
      for (const jt of jobTypes) {
        rows.push({ fingerprint: fp, jobType: jt, priority: 0, status: "pending", nextAttemptAt: new Date() });
      }
    }

    if (rows.length === 0) {
      log.info("seedEnrichmentQueue: no rows to insert.");
      return { inserted: 0 };
    }

    // Insert in chunks of 500 to stay within Neon's parameter limit per query
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(enrichmentQueue)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoNothing();
      // onConflictDoNothing on (fingerprint, jobType) unique index — idempotent
      inserted += Math.min(CHUNK, rows.length - i); // approximation; exact count not needed
    }

    log.info({ total: rows.length }, "seedEnrichmentQueue: complete.");
    return { inserted: rows.length };
  } finally {
    await releaseEnrichmentLock();
  }
}

// ── Batch processor ───────────────────────────────────────────────────────────

/**
 * Claims up to BATCH_SIZE ready items from the queue using FOR UPDATE SKIP LOCKED
 * (PostgreSQL-native advisory row-locking — race-safe for horizontal scaling).
 * Dispatches each item to the Python sidecar and writes results back to DB.
 */
export async function runEnrichmentBatch(): Promise<{ processed: number; errors: number }> {
  if (Date.now() < queuePausedUntil) {
    const resumesIn = Math.ceil((queuePausedUntil - Date.now()) / 1000);
    log.info({ resumesIn }, "Enrichment queue paused — skipping batch.");
    return { processed: 0, errors: 0 };
  }

  const workerId = `node-${process.pid}-${Date.now()}`;

  // Claim batch atomically: FOR UPDATE SKIP LOCKED prevents duplicate claims
  // across concurrent workers or horizontal instances.
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

  // Prefetch sponsor names for all fingerprints in the batch
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
        await processCompaniesHouseItem(item, companyName, town);
      } else {
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
        // Transient error — exponential backoff
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

  // Pause the in-process queue if the entire batch hit rate limits or any CF block
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
): Promise<void> {
  const { status, data } = await callSidecar<Record<string, any>>(
    "/api/v1/enrich/companies-house",
    { fingerprint: item.fingerprint, company_name: companyName, town },
  );

  if (status !== 200 || !data) {
    const err: any = new Error(`CH sidecar HTTP ${status} for "${companyName}"`);
    err.httpStatus = status;
    throw err;
  }

  await db
    .insert(sponsorEnrichment)
    .values({
      fingerprint: item.fingerprint,
      companyNumber: data.company_number ?? null,
      natureOfBusiness: data.nature_of_business ?? null,
      registeredAddress: data.registered_address ?? null,
      websiteUrl: data.website_url ?? null,
      scrapeStatus: "success",
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
    })
    .onConflictDoUpdate({
      target: sponsorEnrichment.fingerprint,
      set: {
        companyNumber: data.company_number ?? null,
        natureOfBusiness: data.nature_of_business ?? null,
        registeredAddress: data.registered_address ?? null,
        websiteUrl: data.website_url ?? null,
        scrapeStatus: "success",
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
      },
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
    // No history rows is acceptable — mark completed, not failed
    await setItemStatus(item, "completed", "no_history_rows");
    return;
  }

  // Insert timeline rows in chunks — UNIQUE constraint deduplicates on replay
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
  // Nightly queue seed — 02:00 UTC (after midnight DB maintenance, before 00:30 sponsor monitor)
  cron.schedule("0 2 * * *", async () => {
    try {
      log.info("Nightly enrichment queue seed starting...");
      const { inserted } = await seedEnrichmentQueue();
      log.info({ inserted }, "Nightly enrichment queue seed complete.");
    } catch (err) {
      log.error({ err }, "Enrichment queue seed failed.");
    }
  });

  // Hourly batch processor — runs at :15 past each hour to spread load
  cron.schedule("15 * * * *", async () => {
    try {
      await runEnrichmentBatch();
    } catch (err) {
      log.error({ err }, "Enrichment batch run failed.");
    }
  });

  log.info("Enrichment cron scheduled (seed: 02:00 UTC daily, batch: :15 every hour).");
}
