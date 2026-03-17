import cron from "node-cron";
import stringSimilarity from "string-similarity";
import { db } from "../db";
import { sponsorCanonical, sponsorChanges, dailyDigest, monitorJobRuns } from "@shared/schema";
import { eq, and, ne, inArray, sql } from "drizzle-orm";
import {
  downloadAndStreamToArray,
  generateFingerprint,
  type SponsorRecord,
  type SponsorChange,
} from "./sponsorListFetcher";
import { rebuildSponsorIndex } from "./sponsorSearch";
import { notifyAffectedUsers, processDelayedNotifications } from "./notificationDispatcher";
import { generateHeadline, type RawDigestData } from "../services/aiDigest";
import { withRetry } from "./dbRetry";

// Distributed advisory lock key — must be a unique integer per job.
// Prevents duplicate execution across multiple server instances (horizontal scaling).
// REPLACES: module-level `isRunning = false` which only prevented single-instance
// races and made horizontal deployment impossible (2 pods = 2 jobs = duplicate data).
const SPONSOR_MONITOR_LOCK_KEY = 7483920; // Unique magic int for this job

let lastRequestCheckTime = 0;
const REQUEST_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Attempts to acquire a PostgreSQL session-level advisory lock.
 * Returns true if the lock was acquired, false if another instance holds it.
 * The lock is automatically released if the DB connection drops (crash-safe).
 */
async function tryAcquireJobLock(): Promise<boolean> {
  const result = await db.execute(sql`SELECT pg_try_advisory_lock(${SPONSOR_MONITOR_LOCK_KEY}) AS acquired`);
  return (result.rows[0] as any)?.acquired === true;
}

async function releaseJobLock(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(${SPONSOR_MONITOR_LOCK_KEY})`).catch(err => {
    console.error('[SponsorMonitorJob] Failed to release advisory lock:', err);
  });
}


interface CanonicalRecord {
  id: number;
  fingerprint: string;
  currentName: string;
  townCity: string | null;
  typeRating: string | null;
  route: string | null;
  status: string; // ACTIVE | NEWLY_GRANTED | GRACE_PERIOD | REMOVED_REVOKED
  firstSeen: string;
  lastSeen: string;
  grantedAt: string;
  removedAt: Date | null;
  consecutiveMisses: number;
  historicalNames: string[] | null;
}

interface TodayRecord {
  fingerprint: string;
  organisationName: string;
  townCity: string;
  typeRating: string;
  route: string;
}

interface LastRunInfo {
  date: string;
  success: boolean;
  recordsProcessed: number;
  changesDetected: number;
  changes: Record<string, number>;
  notificationsSent: number;
  error?: string;
}

let lastRunInfo: LastRunInfo | null = null;

// Staged retry delays: 5 min then 15 min (total worst-case wait: 20 min vs old 60 min)
// gov.uk transient errors (DNS, 503) recover in minutes, not half-hours.
const RETRY_DELAYS_MS = [5 * 60 * 1000, 15 * 60 * 1000];
const DOWNLOAD_MAX_RETRIES = 3;
const RENAME_SIMILARITY_THRESHOLD = 0.85;

function classifyRatingChange(
  prevRating: string,
  newRating: string,
): "DOWNGRADED" | "UPGRADED" | null {
  const prevLower = prevRating.toLowerCase();
  const newLower = newRating.toLowerCase();
  if (prevLower === newLower) return null;

  const prevIsA = prevLower.includes("a-rating") || prevLower.includes("a rating");
  const prevIsB = prevLower.includes("b-rating") || prevLower.includes("b rating");
  const newIsA = newLower.includes("a-rating") || newLower.includes("a rating");
  const newIsB = newLower.includes("b-rating") || newLower.includes("b rating");

  if (prevIsA && newIsB) return "DOWNGRADED";
  if (prevIsB && newIsA) return "UPGRADED";
  return null;
}

async function sendAdminFailureAlert(errorMessage: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!apiKey || !adminEmail) {
    console.error("[SponsorMonitorJob] Cannot send admin alert: RESEND_API_KEY or ADMIN_EMAIL not configured");
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Sponsor Monitor <alerts@checkbyai.net>",
        to: [adminEmail],
        subject: "ALERT: Daily sponsor monitor job failed",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #8B0000 0%, #CC0000 100%); padding: 30px; border-radius: 10px 10px 0 0;">
              <h1 style="color: #ffffff; margin: 0; text-align: center; font-size: 22px;">Sponsor Monitor Job Failed</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <p style="color: #333; font-size: 15px; line-height: 1.6;">The daily sponsor licence register check failed after ${DOWNLOAD_MAX_RETRIES} attempts.</p>
              <div style="background: #fff3f3; padding: 15px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #CC0000;">
                <p style="color: #333; font-size: 14px; margin: 0; font-family: monospace; white-space: pre-wrap;">${errorMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
              </div>
              <p style="color: #666; font-size: 14px;">You can manually trigger a rerun from the admin portal or via POST /api/admin/sponsor-monitor/run.</p>
              <p style="color: #999; font-size: 12px;">Timestamp: ${new Date().toISOString()}</p>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      console.error("[SponsorMonitorJob] Failed to send admin alert email:", await response.text());
    } else {
      console.log("[SponsorMonitorJob] Admin failure alert sent to", adminEmail);
    }
  } catch (err) {
    console.error("[SponsorMonitorJob] Error sending admin alert:", err);
  }
}

async function sendAdminJobCompleteEmail(result: {
  success: boolean;
  recordsProcessed: number;
  changesDetected?: number;
  changeSummary?: Record<string, number>;
  notificationsSent: number;
  notificationsSkipped: number;
  notificationsFailed: number;
  error?: string;
}, durationMs: number, source: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!apiKey || !adminEmail) return;

  const isSuccess = result.success;
  const durationSec = (durationMs / 1000).toFixed(1);
  const changeCount = result.changesDetected ?? 0;
  const changeSummaryText = result.changeSummary && Object.keys(result.changeSummary).length > 0
    ? Object.entries(result.changeSummary).map(([k, v]) => `${k}: ${v}`).join(", ")
    : "None";

  const statusColor = isSuccess ? "#16a34a" : "#dc2626";
  const statusGradient = isSuccess
    ? "linear-gradient(135deg, #059669 0%, #16a34a 100%)"
    : "linear-gradient(135deg, #8B0000 0%, #CC0000 100%)";
  const statusLabel = isSuccess ? "Completed Successfully" : "Failed";
  const statusIcon = isSuccess ? "&#10004;" : "&#10008;";

  const subject = isSuccess
    ? `Sponsor Monitor: ${changeCount} change${changeCount !== 1 ? "s" : ""} detected (${durationSec}s)`
    : `ALERT: Sponsor monitor job failed`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${statusGradient}; padding: 30px; border-radius: 10px 10px 0 0;">
        <h1 style="color: #ffffff; margin: 0; text-align: center; font-size: 22px;">
          ${statusIcon} Sponsor Monitor Job ${statusLabel}
        </h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Status</td>
            <td style="padding: 8px 12px; color: ${statusColor}; font-weight: bold; border-bottom: 1px solid #f0f0f0;">${statusLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Trigger</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${source}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Duration</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${durationSec}s</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Records Processed</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${result.recordsProcessed.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Changes Detected</td>
            <td style="padding: 8px 12px; color: ${changeCount > 0 ? "#2563eb" : "#333"}; font-weight: ${changeCount > 0 ? "bold" : "normal"}; border-bottom: 1px solid #f0f0f0;">${changeCount}</td>
          </tr>
          ${changeCount > 0 ? `<tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Breakdown</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${changeSummaryText}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #f0f0f0;">Notifications</td>
            <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #f0f0f0;">${result.notificationsSent} sent, ${result.notificationsSkipped} skipped, ${result.notificationsFailed} failed</td>
          </tr>
        </table>
        ${result.error ? `<div style="background: #fff3f3; padding: 15px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #CC0000;">
          <p style="color: #333; font-size: 13px; margin: 0; font-family: monospace; white-space: pre-wrap;">${result.error.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        </div>` : ""}
        <p style="color: #999; font-size: 12px; margin-top: 16px; text-align: center;">
          ${new Date().toISOString()} &middot; checkbyai.net
        </p>
      </div>
    </div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: "Sponsor Monitor <alerts@checkbyai.net>",
        to: [adminEmail],
        subject,
        html,
      }),
    });
    if (!response.ok) {
      console.error("[SponsorMonitorJob] Failed to send job completion email:", await response.text());
    } else {
      console.log(`[SponsorMonitorJob] Job ${isSuccess ? "success" : "failure"} email sent to ${adminEmail}`);
    }
  } catch (err) {
    console.error("[SponsorMonitorJob] Error sending job completion email:", err);
  }
}

async function downloadWithRetry(): Promise<SponsorRecord[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= DOWNLOAD_MAX_RETRIES; attempt++) {
    try {
      console.log(`[SponsorMonitorJob] CSV download attempt ${attempt}/${DOWNLOAD_MAX_RETRIES}...`);
      const records = await downloadAndStreamToArray();
      console.log(`[SponsorMonitorJob] CSV download succeeded on attempt ${attempt}: ${records.length} records parsed`);
      return records;
    } catch (err: any) {
      lastError = err;
      console.error(`[SponsorMonitorJob] CSV download attempt ${attempt} failed: ${err.message}`);

      if (attempt < DOWNLOAD_MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        const delayMin = Math.round(delay / 60000);
        console.log(`[SponsorMonitorJob] Waiting ${delayMin} minute(s) before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("CSV download failed after all retries");
}

// ── Canonical data loaders ────────────────────────────────────────────────────

/**
 * Loads all LIVE canonical records (ACTIVE + NEWLY_GRANTED + GRACE_PERIOD) in batches
 * to prevent high-heap memory pressure during the reconciliation classify phase.
 * Excludes REMOVED_REVOKED — those are handled by loadRevokedFingerprints().
 */
async function loadLiveCanonical(): Promise<Map<string, CanonicalRecord>> {
  const map = new Map<string, CanonicalRecord>();
  let lastId = 0;
  const BATCH_SIZE = 5000;

  console.log("[SponsorMonitorJob] Loading live canonical records in batches...");

  while (true) {
    const batch = await db
      .select()
      .from(sponsorCanonical)
      .where(
        and(
          inArray(sponsorCanonical.status, ["ACTIVE", "NEWLY_GRANTED", "GRACE_PERIOD"]),
          gt(sponsorCanonical.id, lastId)
        )
      )
      .orderBy(asc(sponsorCanonical.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    for (const r of batch) {
      map.set(r.fingerprint, r as CanonicalRecord);
      lastId = r.id;
    }
    console.log(`[SponsorMonitorJob]   ...loaded ${map.size} live records`);
  }

  return map;
}

/**
 * Loads only the fingerprints of REMOVED_REVOKED records.
 * Lightweight (SELECT fingerprint only) — used to detect re-activations
 * when a previously revoked company reappears in today's CSV.
 */
async function loadRevokedFingerprints(): Promise<Set<string>> {
  const set = new Set<string>();
  let lastId = 0;
  const BATCH_SIZE = 5000;

  console.log("[SponsorMonitorJob] Loading revoked fingerprints in batches...");

  while (true) {
    const batch = await db
      .select({ id: sponsorCanonical.id, fingerprint: sponsorCanonical.fingerprint })
      .from(sponsorCanonical)
      .where(
        and(
          eq(sponsorCanonical.status, "REMOVED_REVOKED"),
          gt(sponsorCanonical.id, lastId)
        )
      )
      .orderBy(asc(sponsorCanonical.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    for (const r of batch) {
      set.add(r.fingerprint);
      lastId = r.id;
    }
  }

  console.log(`[SponsorMonitorJob]   ...loaded ${set.size} revoked fingerprints`);
  return set;
}

function buildTodayRecords(csvRecords: SponsorRecord[]): Map<string, TodayRecord> {
  const map = new Map<string, TodayRecord>();
  for (const r of csvRecords) {
    const fp = generateFingerprint(r.organisationName, r.townCity, r.route);
    if (!map.has(fp)) {
      map.set(fp, {
        fingerprint: fp,
        organisationName: r.organisationName,
        townCity: r.townCity || "",
        typeRating: r.typeRating || "",
        route: r.route || "",
      });
    }
  }
  return map;
}

/**
 * 4-Phase bulk SQL reconciliation engine.
 *
 * Replaces the old row-by-row approach with bulk set-operations:
 *
 *  Phase 1  — Classify all today's CSV records against the live canonical map.
 *             Emit attribute-change events (UPGRADED/DOWNGRADED/NAME_CHANGE).
 *             Bulk-UPDATE matched records (lastSeen, reset consecutiveMisses,
 *             promote NEWLY_GRANTED → ACTIVE where grantedAt < today).
 *
 *  Phase 2a — Re-activations: fingerprints in today's CSV that are in
 *             REMOVED_REVOKED state → bulk-UPDATE to NEWLY_GRANTED.
 *
 *  Phase 2b — Genuinely new companies: bulk-INSERT as NEWLY_GRANTED with
 *             grantedAt = today.
 *
 *  Phase 3a — First-absence: ACTIVE/NEWLY_GRANTED records NOT in today's CSV
 *             → bulk-UPDATE consecutiveMisses=1, status=GRACE_PERIOD.
 *             Rename detection runs here first (city+route locality index).
 *
 *  Phase 3b — Confirmed removal: GRACE_PERIOD records NOT in today's CSV
 *             → bulk-UPDATE to REMOVED_REVOKED with removedAt timestamp.
 */
async function reconcile(
  liveMap: Map<string, CanonicalRecord>,
  revokedSet: Set<string>,
  todayMap: Map<string, TodayRecord>,
  today: string,
): Promise<SponsorChange[]> {
  const changes: SponsorChange[] = [];
  const matchedIds: number[] = [];
  const individualUpdates: { id: number; todayRec: TodayRecord; canonical: CanonicalRecord }[] = [];
  const reactivationFps: string[] = [];
  const reactivationRecords: TodayRecord[] = [];
  const newRecords: TodayRecord[] = [];

  // ── Phase 1: Classify today's CSV records ────────────────────────────────
  console.log(
    `[Reconciliation] Phase 1: Classifying ${todayMap.size} CSV records ` +
    `against ${liveMap.size} live + ${revokedSet.size} revoked canonical entries...`
  );
  for (const [fp, todayRec] of Array.from(todayMap.entries())) {
    const canonical = liveMap.get(fp);

    if (canonical) {
      matchedIds.push(canonical.id);

      const prevRating = (canonical.typeRating ?? "").trim();
      const currRating = (todayRec.typeRating ?? "").trim();
      const nameChanged = canonical.currentName !== todayRec.organisationName;
      const ratingChanged = prevRating && currRating && prevRating !== currRating;
      const routeChanged = (canonical.route ?? "").trim() !== (todayRec.route ?? "").trim();

      if (nameChanged || ratingChanged || routeChanged) {
        individualUpdates.push({ id: canonical.id, todayRec, canonical });

        if (ratingChanged) {
          const ratingChange = classifyRatingChange(prevRating, currRating);
          if (ratingChange) {
            changes.push({
              organisationName: todayRec.organisationName,
              changeType: ratingChange,
              previousValue: prevRating,
              newValue: currRating,
              fingerprint: todayRec.fingerprint,
            });
          }
        }

        if (nameChanged) {
          changes.push({
            organisationName: todayRec.organisationName,
            changeType: "NAME_CHANGE",
            previousValue: canonical.currentName,
            newValue: todayRec.organisationName,
            fingerprint: todayRec.fingerprint,
          });
        }
      }
    } else if (revokedSet.has(fp)) {
      reactivationFps.push(fp);
      reactivationRecords.push(todayRec);
    } else {
      newRecords.push(todayRec);
    }
  }

  // ── Phase 1a: Bulk UPDATE matched records ────────────────────────────────
  // Reset consecutiveMisses, update lastSeen.
  // Also promotes NEWLY_GRANTED → ACTIVE when grantedAt < today
  // (company was "new" yesterday, now established).
  console.log(`[Reconciliation] Phase 1a: Bulk-updating ${matchedIds.length} matched records...`);
  const BULK_BATCH = 500;
  for (let i = 0; i < matchedIds.length; i += BULK_BATCH) {
    const batch = matchedIds.slice(i, i + BULK_BATCH);
    await withRetry(async () => {
      const placeholders = batch.map((id) => sql`${id}`);
      const arrayExpr = sql`ARRAY[${sql.join(placeholders, sql`, `)}]::int[]`;
      await db.execute(sql`
        UPDATE sponsor_canonical
        SET
          last_seen          = ${today},
          consecutive_misses = 0,
          status             = CASE
            WHEN status = 'NEWLY_GRANTED' AND granted_at < ${today}::date THEN 'ACTIVE'
            ELSE status
          END
        WHERE id = ANY(${arrayExpr})
      `);
    }, `Phase1a bulk update batch at ${i}`);
    if ((i + BULK_BATCH) % 5000 === 0 || i + BULK_BATCH >= matchedIds.length) {
      console.log(`[Reconciliation]   ...updated ${Math.min(i + BULK_BATCH, matchedIds.length)}/${matchedIds.length}`);
    }
  }

  // ── Phase 1b: Individual updates for attribute changes (name/rating/route) ─
  console.log(`[Reconciliation] Phase 1b: ${individualUpdates.length} records with attribute changes...`);
  for (const { id, todayRec, canonical } of individualUpdates) {
    await withRetry(async () => {
      await db
        .update(sponsorCanonical)
        .set({
          currentName: todayRec.organisationName,
          typeRating:  todayRec.typeRating || null,
          route:       todayRec.route || null,
        })
        .where(eq(sponsorCanonical.id, id));

      if (canonical.currentName !== todayRec.organisationName) {
        const existingHistorical = canonical.historicalNames || [];
        if (!existingHistorical.includes(canonical.currentName)) {
          await db
            .update(sponsorCanonical)
            .set({
              historicalNames: sql`array_append(${sponsorCanonical.historicalNames}, ${canonical.currentName})`,
            })
            .where(eq(sponsorCanonical.id, id));
        }
      }
    }, `Phase1b update ${todayRec.organisationName}`);
  }

  // ── Phase 2a: Re-activations (REMOVED_REVOKED → NEWLY_GRANTED) ───────────
  if (reactivationFps.length > 0) {
    console.log(`[Reconciliation] Phase 2a: Re-activating ${reactivationFps.length} previously revoked companies...`);
    for (let i = 0; i < reactivationFps.length; i += BULK_BATCH) {
      const batch = reactivationFps.slice(i, i + BULK_BATCH);
      await withRetry(async () => {
        await db
          .update(sponsorCanonical)
          .set({
            status:            "NEWLY_GRANTED",
            lastSeen:          today,
            grantedAt:         today,
            consecutiveMisses: 0,
            removedAt:         null,
          })
          .where(inArray(sponsorCanonical.fingerprint, batch));
      }, `Phase2a re-activation batch ${i}`);
    }
    for (const r of reactivationRecords) {
      changes.push({
        organisationName: r.organisationName,
        changeType:       "RE_ACTIVATED",
        previousValue:    null,
        newValue:         r.typeRating || null,
        fingerprint:      r.fingerprint,
      });
    }
  }

  // ── Phase 2b: Insert genuinely new companies (NEWLY_GRANTED) ─────────────
  console.log(`[Reconciliation] Phase 2b: Inserting ${newRecords.length} new companies as NEWLY_GRANTED...`);
  const INSERT_BATCH = 250;
  let insertedCount = 0;
  for (let i = 0; i < newRecords.length; i += INSERT_BATCH) {
    const batch = newRecords.slice(i, i + INSERT_BATCH);
    try {
      const result = await withRetry(async () => {
        return await db.insert(sponsorCanonical).values(
          batch.map((r) => ({
            fingerprint:       r.fingerprint,
            currentName:       r.organisationName,
            townCity:          r.townCity || null,
            typeRating:        r.typeRating || null,
            route:             r.route || null,
            status:            "NEWLY_GRANTED",
            firstSeen:         today,
            lastSeen:          today,
            grantedAt:         today,
            consecutiveMisses: 0,
            historicalNames:   [] as string[],
          }))
        ).onConflictDoNothing().returning({ id: sponsorCanonical.id });
      }, `Phase2b insert batch at ${i}`);

      for (const r of batch.slice(0, result.length)) {
        changes.push({
          organisationName: r.organisationName,
          changeType:       "NEW_LICENCE",
          previousValue:    null,
          newValue:         r.typeRating || null,
          fingerprint:      r.fingerprint,
        });
      }
      insertedCount += result.length;
    } catch (err: any) {
      console.error(`[Reconciliation] Phase 2b error inserting batch at ${i}:`, err.message);
    }
  }
  console.log(`[Reconciliation] Phase 2b: ${insertedCount}/${newRecords.length} new records inserted.`);

  // ── Phase 3: Missing records (live but absent from today's CSV) ──────────
  const missingFps: string[] = [];
  for (const fp of Array.from(liveMap.keys())) {
    if (!todayMap.has(fp)) missingFps.push(fp);
  }

  if (missingFps.length > 0) {
    const missingRatio = liveMap.size > 0 ? missingFps.length / liveMap.size : 0;
    if (missingRatio > 0.1 && missingFps.length > 100) {
      console.warn(
        `[Reconciliation] WARNING: ${missingFps.length}/${liveMap.size} ` +
        `(${(missingRatio * 100).toFixed(1)}%) live records absent from today's CSV. ` +
        `Possible CSV format change — processing normally but flagging for review.`
      );
    }

    // Separate first-absence (ACTIVE/NEWLY_GRANTED) from confirmed (GRACE_PERIOD)
    const firstAbsenceFps = missingFps.filter((fp) => {
      const r = liveMap.get(fp)!;
      return r.status === "ACTIVE" || r.status === "NEWLY_GRANTED";
    });
    const confirmedRemovalFps = missingFps.filter((fp) => liveMap.get(fp)!.status === "GRACE_PERIOD");

    // ── Rename detection (runs before Phase 3a, on first-absence only) ──────
    // Groups new records by city+route to avoid O(M×N) similarity calls.
    const newRecsByCityRoute = new Map<string, TodayRecord[]>();
    for (const r of newRecords) {
      const key = `${(r.townCity || "").toLowerCase().trim()}|${(r.route || "").toLowerCase().trim()}`;
      if (!newRecsByCityRoute.has(key)) newRecsByCityRoute.set(key, []);
      newRecsByCityRoute.get(key)!.push(r);
    }

    const renameHandled = new Set<string>(); // fps handled by rename detection

    for (const fp of firstAbsenceFps) {
      const missing = liveMap.get(fp)!;
      const key = `${(missing.townCity || "").toLowerCase().trim()}|${(missing.route || "").toLowerCase().trim()}`;
      const candidates = newRecsByCityRoute.get(key) || [];

      for (const candidate of candidates) {
        const similarity = stringSimilarity.compareTwoStrings(
          missing.currentName.toLowerCase(),
          candidate.organisationName.toLowerCase(),
        );

        if (similarity >= RENAME_SIMILARITY_THRESHOLD) {
          console.log(
            `[Reconciliation] Rename detected: "${missing.currentName}" → ` +
            `"${candidate.organisationName}" (${(similarity * 100).toFixed(1)}%)`
          );

          const existingHistorical = missing.historicalNames || [];
          const updatedHistorical = existingHistorical.includes(missing.currentName)
            ? existingHistorical
            : [...existingHistorical, missing.currentName];

          await withRetry(async () => {
            await db
              .update(sponsorCanonical)
              .set({
                fingerprint:       candidate.fingerprint,
                currentName:       candidate.organisationName,
                lastSeen:          today,
                consecutiveMisses: 0,
                historicalNames:   updatedHistorical,
                typeRating:        candidate.typeRating || missing.typeRating,
              })
              .where(eq(sponsorCanonical.id, missing.id));
          }, `Rename ${missing.currentName} → ${candidate.organisationName}`);

          // Remove any duplicate row that may exist for the new fingerprint
          try {
            await db
              .delete(sponsorCanonical)
              .where(
                and(
                  eq(sponsorCanonical.fingerprint, candidate.fingerprint),
                  ne(sponsorCanonical.id, missing.id),
                )
              );
          } catch (err) {
            console.error(`[Reconciliation] Could not remove duplicate for ${candidate.fingerprint}:`, err);
          }

          changes.push({
            organisationName: candidate.organisationName,
            changeType:       "NAME_CHANGE",
            previousValue:    missing.currentName,
            newValue:         candidate.organisationName,
            fingerprint:      candidate.fingerprint,
          });

          renameHandled.add(fp);
          break;
        }
      }
    }

    // ── Phase 3a: First-absence → GRACE_PERIOD (bulk) ───────────────────────
    const graceFps = firstAbsenceFps.filter((fp) => !renameHandled.has(fp));
    if (graceFps.length > 0) {
      console.log(`[Reconciliation] Phase 3a: ${graceFps.length} records → GRACE_PERIOD...`);
      for (let i = 0; i < graceFps.length; i += BULK_BATCH) {
        const batch = graceFps.slice(i, i + BULK_BATCH);
        await withRetry(async () => {
          await db
            .update(sponsorCanonical)
            .set({ consecutiveMisses: 1, status: "GRACE_PERIOD" })
            .where(inArray(sponsorCanonical.fingerprint, batch));
        }, `Phase3a grace period batch ${i}`);
      }
    }

    // ── Phase 3b: Confirmed removal → REMOVED_REVOKED (bulk) ────────────────
    if (confirmedRemovalFps.length > 0) {
      console.log(`[Reconciliation] Phase 3b: ${confirmedRemovalFps.length} confirmed removals → REMOVED_REVOKED...`);
      const removedAt = new Date();
      for (let i = 0; i < confirmedRemovalFps.length; i += BULK_BATCH) {
        const batch = confirmedRemovalFps.slice(i, i + BULK_BATCH);
        await withRetry(async () => {
          await db
            .update(sponsorCanonical)
            .set({
              consecutiveMisses: sql`${sponsorCanonical.consecutiveMisses} + 1`,
              status:            "REMOVED_REVOKED",
              removedAt,
            })
            .where(inArray(sponsorCanonical.fingerprint, batch));
        }, `Phase3b removal batch ${i}`);
      }
      for (const fp of confirmedRemovalFps) {
        const r = liveMap.get(fp)!;
        changes.push({
          organisationName: r.currentName,
          changeType:       "REMOVED_REVOKED",
          previousValue:    r.typeRating,
          newValue:         null,
          fingerprint:      fp,
        });
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const counts: Record<string, number> = {};
  for (const c of changes) counts[c.changeType] = (counts[c.changeType] || 0) + 1;

  console.log(
    `[Reconciliation] Complete. Live: ${liveMap.size}, Today: ${todayMap.size}, ` +
    `New: ${newRecords.length}, Reactivated: ${reactivationRecords.length}, ` +
    `Missing: ${missingFps.length}, Changes: ${changes.length}` +
    (Object.keys(counts).length > 0
      ? ` (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")})`
      : "")
  );

  return changes;
}

export async function runSponsorMonitorJob(source: string = "cron", notifyOnFailure = false): Promise<{
  success: boolean;
  recordsProcessed: number;
  changes: Record<string, number>;
  notificationsSent: number;
  notificationsSkipped: number;
  notificationsFailed: number;
  error?: string;
}> {
  const result = {
    success: false,
    recordsProcessed: 0,
    changes: {} as Record<string, number>,
    notificationsSent: 0,
    notificationsSkipped: 0,
    notificationsFailed: 0,
  };


  // ── Distributed lock acquisition (replaces in-process isRunning flag) ─────
  // pg_try_advisory_lock() is atomic: across any number of API server instances,
  // only ONE can acquire this lock at a time. If another pod is already running
  // the job, we get false immediately instead of running a duplicate pass.
  const lockAcquired = await tryAcquireJobLock();
  if (!lockAcquired) {
    const msg = "Another instance is already running the sponsor monitor job. Skipping.";
    console.warn(`[SponsorMonitorJob] ${msg}`);
    return { ...result, error: msg };
  }

  const startTime = Date.now();

  try {
    console.log(`[SponsorMonitorJob] === Daily sponsor monitor check starting (triggered by: ${source}) ===`);

    let currentRecords: SponsorRecord[];
    try {
      currentRecords = await downloadWithRetry();
    } catch (err: any) {
      const errorMsg = `CSV download failed after ${MAX_RETRIES} attempts: ${err.message}`;
      console.error(`[SponsorMonitorJob] ${errorMsg}`);
      if (notifyOnFailure) await sendAdminFailureAlert(errorMsg);
      return { ...result, error: errorMsg };
    }

    result.recordsProcessed = currentRecords.length;

    if (currentRecords.length === 0) {
      const errorMsg = "CSV download returned 0 records. Aborting to prevent false mass-removal detection.";
      console.error(`[SponsorMonitorJob] ${errorMsg}`);
      if (notifyOnFailure) await sendAdminFailureAlert(errorMsg);
      return { ...result, error: errorMsg };
    }

    const today = new Date().toISOString().split("T")[0];

    const existingRun = await db
      .select({ id: monitorJobRuns.id, status: monitorJobRuns.status })
      .from(monitorJobRuns)
      .where(eq(monitorJobRuns.runDate, today))
      .limit(1);

    if (existingRun.length > 0 && existingRun[0].status === "success" && source === "cron") {
      const msg = `Reconciliation already completed successfully for ${today}. Skipping duplicate cron run.`;
      console.log(`[SponsorMonitorJob] ${msg}`);
      result.success = true;
      return { ...result, error: msg };
    }

    // Load live canonical (ACTIVE + NEWLY_GRANTED + GRACE_PERIOD)
    // and revoked fingerprints for re-activation detection.
    const [liveMap, revokedSet] = await Promise.all([
      withRetry(() => loadLiveCanonical(),         "Load live canonical records"),
      withRetry(() => loadRevokedFingerprints(),   "Load revoked fingerprints"),
    ]);

    if (liveMap.size === 0) {
      console.log(
        `[SponsorMonitorJob] No live canonical records found — this is the first run. ` +
        `All ${currentRecords.length} CSV records will be inserted as NEWLY_GRANTED.`
      );
    }

    const todayMap = buildTodayRecords(currentRecords);

    const detectedChanges = await reconcile(liveMap, revokedSet, todayMap, today);

    await rebuildSponsorIndex();

    const changeCounts: Record<string, number> = {};
    for (const change of detectedChanges) {
      changeCounts[change.changeType] = (changeCounts[change.changeType] || 0) + 1;
    }
    result.changes = changeCounts;

    if (detectedChanges.length > 0) {
      console.log(`[SponsorMonitorJob] Saving ${detectedChanges.length} changes in batches...`);
      const CHANGE_BATCH = 500;
      const savedChanges: any[] = [];
      
      for (let i = 0; i < detectedChanges.length; i += CHANGE_BATCH) {
        const batch = detectedChanges.slice(i, i + CHANGE_BATCH);
        try {
          const inserted = await db.insert(sponsorChanges).values(
            batch.map(change => ({
              organisationName: change.organisationName,
              fingerprint:      change.fingerprint ?? null,
              changeType:       change.changeType,
              previousValue:    change.previousValue,
              newValue:         change.newValue,
              snapshotDate:     today,
            }))
          ).returning();
          savedChanges.push(...inserted);
        } catch (err: any) {
          console.error(`[SponsorMonitorJob] Error inserting change batch at ${i}:`, err.message);
        }
      }
      console.log(`[SponsorMonitorJob] ${savedChanges.length} changes saved.`);

      const alertableSaved = savedChanges.filter((c: any) => c.changeType !== "NAME_CHANGE");
      if (alertableSaved.length > 0) {
        console.log(`[SponsorMonitorJob] Dispatching notifications for ${alertableSaved.length} alertable changes...`);
        for (const savedChange of alertableSaved) {
          try {
            const notifResult = await notifyAffectedUsers(savedChange);
            result.notificationsSent += notifResult.sent;
            result.notificationsSkipped += notifResult.skipped;
            result.notificationsFailed += notifResult.failed;
          } catch (err: any) {
            console.error(`[SponsorMonitorJob] Notification error for "${savedChange.organisationName}":`, err.message);
            result.notificationsFailed += 1;
          }
        }
      }
    } else {
      console.log("[SponsorMonitorJob] No changes detected today.");
    }

    try {
      const addedCount   = (changeCounts["NEW_LICENCE"]    || 0) + (changeCounts["RE_ACTIVATED"] || 0);
      const updatedCount = (changeCounts["UPGRADED"]       || 0) + (changeCounts["DOWNGRADED"]   || 0)
                         + (changeCounts["ROUTE_CHANGE"]   || 0) + (changeCounts["NAME_CHANGE"]  || 0);
      const removedCount = changeCounts["REMOVED_REVOKED"] || 0;

      const removedCompanies = detectedChanges
        .filter((c) => c.changeType === "REMOVED_REVOKED")
        .slice(0, 10)
        .map((c) => c.organisationName);
      const addedCompanies = detectedChanges
        .filter((c) => c.changeType === "NEW_LICENCE" || c.changeType === "RE_ACTIVATED")
        .slice(0, 5)
        .map((c) => c.organisationName);

      const digestData: RawDigestData = {
        snapshotDate: today,
        addedCount,
        updatedCount,
        removedCount,
        removedCompanies,
        addedCompanies,
      };

      const headlineResult = await generateHeadline(digestData);
      const selectedVariantIndex = Math.floor(Math.random() * 3);

      await db.update(dailyDigest).set({ displayedOnLanding: false });
      await db.insert(dailyDigest).values({
        snapshotDate: today,
        addedCount,
        updatedCount,
        removedCount,
        headlineGenerated: headlineResult.headline,
        headlineVariants: headlineResult.variants,
        displayedOnLanding: true,
        selectedVariantIndex,
        aiModel: headlineResult.model,
      }).onConflictDoUpdate({
        target: dailyDigest.snapshotDate,
        set: {
          addedCount,
          updatedCount,
          removedCount,
          headlineGenerated: headlineResult.headline,
          headlineVariants: headlineResult.variants,
          displayedOnLanding: true,
          selectedVariantIndex,
          aiModel: headlineResult.model,
          generatedAt: new Date(),
        },
      });

      console.log(`[SponsorMonitorJob] Daily digest generated: "${headlineResult.headline}" (model: ${headlineResult.model})`);
    } catch (digestErr: any) {
      console.error("[SponsorMonitorJob] Failed to generate daily digest:", digestErr.message);
    }

    const finalDuration = Date.now() - startTime;
    const completionTime = new Date();
    await withRetry(async () => {
      await db.insert(monitorJobRuns).values({
        runDate: today,
        source,
        status: "success",
        recordsProcessed: result.recordsProcessed,
        changesDetected: detectedChanges.length,
        changeSummary: changeCounts,
        notificationsSent: result.notificationsSent,
        notificationsSkipped: result.notificationsSkipped,
        notificationsFailed: result.notificationsFailed,
        durationMs: finalDuration,
        completedAt: completionTime,
        // Added JSON context for easier debugging and auditing.
        // Provides a snapshot of the raw result object.
        jobOutput: result,
      }).onConflictDoUpdate({
        target: monitorJobRuns.runDate,
        set: {
          source,
          status: "success",
          recordsProcessed: result.recordsProcessed,
          changesDetected: detectedChanges.length,
          changeSummary: changeCounts,
          notificationsSent: result.notificationsSent,
          notificationsSkipped: result.notificationsSkipped,
          notificationsFailed: result.notificationsFailed,
          durationMs: finalDuration,
          completedAt: completionTime,
          jobOutput: result,
        },
      });
    }, "Log job success");

    result.success = true;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[SponsorMonitorJob] === Job complete (${elapsed}s) ===\n` +
      `  Records processed: ${result.recordsProcessed}\n` +
      `  Changes detected: ${detectedChanges.length} total` +
      (Object.keys(changeCounts).length > 0
        ? ` (${Object.entries(changeCounts).map(([k, v]) => `${k}: ${v}`).join(", ")})`
        : "") + "\n" +
      `  Notifications: ${result.notificationsSent} sent, ${result.notificationsSkipped} skipped, ${result.notificationsFailed} failed`
    );

    sendAdminJobCompleteEmail(
      { success: true, recordsProcessed: result.recordsProcessed, changesDetected: detectedChanges.length, changeSummary: changeCounts, notificationsSent: result.notificationsSent, notificationsSkipped: result.notificationsSkipped, notificationsFailed: result.notificationsFailed },
      Date.now() - startTime,
      source
    ).catch((err) => console.error('[SponsorMonitorJob] Failed to send admin job completion email:', err));

    return result;
  } catch (err: any) {
    const errorMsg = `Unexpected error: ${err.message}`;
    console.error(`[SponsorMonitorJob] ${errorMsg}`, err);
    if (notifyOnFailure) await sendAdminFailureAlert(errorMsg);
    const failDuration = Date.now() - startTime;
    const failTime = new Date();
    try {
      const today = new Date().toISOString().split("T")[0];
      await withRetry(async () => {
        await db.insert(monitorJobRuns).values({
          runDate: today,
          source,
          status: "failed",
          recordsProcessed: result.recordsProcessed,
          changesDetected: 0,
          durationMs: failDuration,
          errorMessage: err.message,
          completedAt: failTime,
        }).onConflictDoUpdate({
          target: monitorJobRuns.runDate,
          set: {
            status: "failed",
            errorMessage: err.message,
            durationMs: failDuration,
            completedAt: failTime,
          },
        });
      }, "Log job failure");
    } catch (logErr) {
      console.error("[SponsorMonitorJob] Failed to log job failure:", logErr);
    }
    if (notifyOnFailure) {
      sendAdminJobCompleteEmail(
        { success: false, recordsProcessed: result.recordsProcessed, notificationsSent: result.notificationsSent, notificationsSkipped: result.notificationsSkipped, notificationsFailed: result.notificationsFailed, error: errorMsg },
        failDuration,
        source
      ).catch((err) => console.error('[SponsorMonitorJob] Failed to send admin failure alert email:', err));
    }
    return { ...result, error: errorMsg };
  } finally {
    await releaseJobLock();
    lastRunInfo = {
      date: new Date().toISOString(),
      success: result.success,
      recordsProcessed: result.recordsProcessed,
      changesDetected: Object.values(result.changes).reduce((a, b) => a + b, 0),
      changes: result.changes,
      notificationsSent: result.notificationsSent,
      error: (result as any).error,
    };
  }
}

export function getLastRunInfo(): LastRunInfo | null {
  return lastRunInfo;
}

async function seedInitialDigest(): Promise<void> {
  try {
    const existing = await db.select({ id: dailyDigest.id }).from(dailyDigest).limit(1);
    if (existing.length > 0) {
      console.log("[SponsorMonitorJob] Daily digest already has data, skipping seed.");
      return;
    }

    const stats = await db
      .select({
        total:   sql<number>`count(*)::int`,
        active:  sql<number>`count(*) filter (where ${sponsorCanonical.status} in ('ACTIVE','NEWLY_GRANTED'))::int`,
        revoked: sql<number>`count(*) filter (where ${sponsorCanonical.status} = 'REMOVED_REVOKED')::int`,
      })
      .from(sponsorCanonical);

    const { total, active, revoked } = stats[0] || { total: 0, active: 0, revoked: 0 };
    if (total === 0) {
      console.log("[SponsorMonitorJob] No sponsor data found, cannot seed digest.");
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    const headline = `${active.toLocaleString()} UK Sponsors Under Watch`;
    const variants = [
      {
        headline: `${active.toLocaleString()} UK Sponsors Tracked`,
        subheadline: `Monitoring the full Home Office register`,
        emotion: "informative",
        focus: "overview",
      },
      {
        headline: `${active.toLocaleString()} Active Sponsor Licences`,
        subheadline: `Checked nightly for revocations and changes`,
        emotion: "neutral",
        focus: "overview",
      },
      {
        headline: `Tracking ${active.toLocaleString()} UK Sponsors`,
        subheadline: `Real-time monitoring of the official register`,
        emotion: "informative",
        focus: "overview",
      },
    ];

    await db.insert(dailyDigest).values({
      snapshotDate: today,
      addedCount: active,
      updatedCount: 0,
      removedCount: revoked,
      headlineGenerated: headline,
      headlineVariants: variants,
      displayedOnLanding: true,
      selectedVariantIndex: 0,
      aiModel: "deterministic-seed",
    }).onConflictDoUpdate({
      target: dailyDigest.snapshotDate,
      set: {
        headlineGenerated: headline,
        headlineVariants: variants,
        displayedOnLanding: true,
      },
    });

    console.log(`[SponsorMonitorJob] Initial digest seeded: "${headline}" (${active} active, ${revoked} revoked sponsors)`);
  } catch (err: any) {
    console.error("[SponsorMonitorJob] Failed to seed initial digest:", err.message);
  }
}

function isWeekday(): boolean {
  const day = new Date().getUTCDay();
  return day >= 1 && day <= 5;
}

async function hasTodayJobSucceeded(): Promise<boolean | null> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const existing = await db
      .select({ id: monitorJobRuns.id, status: monitorJobRuns.status })
      .from(monitorJobRuns)
      .where(and(eq(monitorJobRuns.runDate, today), eq(monitorJobRuns.status, "success")))
      .limit(1);
    return existing.length > 0;
  } catch (err) {
    console.error("[SponsorMonitorJob] Error checking today's job status:", err);
    return null;
  }
}

export function startSponsorMonitorCron(): void {
  seedInitialDigest().catch((err) => {
    console.error("[SponsorMonitorJob] Error in initial digest seed:", err);
  });

  cron.schedule("30 0 * * 1-5", () => {
    console.log("[SponsorMonitorJob] Cron trigger fired at", new Date().toISOString());
    runSponsorMonitorJob("cron").catch((err) => {
      console.error("[SponsorMonitorJob] Unhandled error in cron execution:", err);
    });
  }, {
    timezone: "UTC",
  });

  cron.schedule("0 */4 * * 1-5", async () => {
    try {
      // Advisory lock in runSponsorMonitorJob() prevents duplicate execution
      const alreadyRan = await hasTodayJobSucceeded();
      if (alreadyRan === null) {
        console.warn("[SponsorMonitorJob] Backup trigger: could not check job status (DB error), skipping.");
        return;
      }
      if (!alreadyRan) {
        console.log("[SponsorMonitorJob] Backup trigger: today's job has not completed successfully. Running now...");
        await runSponsorMonitorJob("backup-trigger", true);
      }
    } catch (err) {
      console.error("[SponsorMonitorJob] Backup trigger error:", err);
    }
  }, {
    timezone: "UTC",
  });

  cron.schedule("0 * * * *", () => {
    processDelayedNotifications().catch((err) => {
      console.error("[NotificationQueue] Error processing delayed notifications:", err);
    });
  }, {
    timezone: "UTC",
  });

  console.log("[SponsorMonitorJob] Cron jobs scheduled: daily monitor at 00:30 UTC Mon-Fri, backup every 4h Mon-Fri, delayed notifications hourly");

  setTimeout(async () => {
    try {
      if (!isWeekday()) {
        console.log("[SponsorMonitorJob] Startup catch-up: weekend detected, skipping (no register published on weekends).");
        return;
      }
      // Advisory lock in runSponsorMonitorJob() handles concurrency
      const alreadyRan = await hasTodayJobSucceeded();
      if (alreadyRan === null) {
        console.warn("[SponsorMonitorJob] Startup catch-up: could not check job status (DB error), skipping.");
        return;
      }
      if (!alreadyRan) {
        console.log("[SponsorMonitorJob] Startup catch-up: today's job has not run yet. Triggering now...");
        await runSponsorMonitorJob("startup-catchup");
      } else {
        console.log("[SponsorMonitorJob] Startup catch-up: today's job already completed. No action needed.");
      }
    } catch (err) {
      console.error("[SponsorMonitorJob] Startup catch-up error:", err);
    }
  }, 15000);
}

export async function isJobRunning(): Promise<boolean> {
  // Use DB-level advisory lock query to check if job is truly active across any node.
  // pg_locks table tracks all active locks by PID.
  try {
    const result = await db.execute(sql`
      SELECT count(*) > 0 AS locked 
      FROM pg_locks 
      WHERE locktype = 'advisory' 
        AND classid  = (${SPONSOR_MONITOR_LOCK_KEY}::bigint >> 32)::int
        AND objid    = (${SPONSOR_MONITOR_LOCK_KEY}::bigint & x'ffffffff'::bigint)::int
    `);
    return (result.rows[0] as any)?.locked === true;
  } catch (err) {
    console.error('[SponsorMonitorJob] Failed to check advisory lock:', err);
    return false;
  }
}

export async function checkAndTriggerIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastRequestCheckTime < REQUEST_CHECK_INTERVAL_MS) {
    return;
  }
  lastRequestCheckTime = now;

  try {
    if (!isWeekday()) return;
    const alreadyRan = await hasTodayJobSucceeded();
    if (alreadyRan === null || alreadyRan) return;

    const hour = new Date().getUTCHours();
    if (hour < 1) {
      return;
    }

    console.log("[SponsorMonitorJob] Request-triggered check: today's job has not run. Triggering now...");
    runSponsorMonitorJob("request-trigger").catch((err) => {
      console.error("[SponsorMonitorJob] Request-triggered job error:", err);
    });
  } catch (err) {
    console.error("[SponsorMonitorJob] Request-triggered check error:", err);
  }
}
