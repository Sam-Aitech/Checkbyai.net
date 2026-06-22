/**
 * sponsorStateMachine.ts — Phase 2 diff-based reconciliation
 *
 * Replaces the 1,199-line sponsorMonitorJob reconcile() engine.
 *
 * Input:  CsvDiffResult from csvdiff (Additions, Deletions, Modifications)
 *         + today's fingerprinted CSV path (for GRACE_PERIOD second-miss check)
 * Output: SponsorChange[] (change events) + stats
 *
 * Phases:
 *   A  — Load only the affected canonical records from DB (not all 124k)
 *   B  — Modifications → UPGRADED / DOWNGRADED / ROUTE_CHANGE / NAME_CHANGE
 *   C  — Additions → NEW_LICENCE / RE_ACTIVATED / Flicker recovery
 *   D  — Deletions → GRACE_PERIOD (first miss) / REMOVED_REVOKED (second miss)
 *   D2 — GRACE_PERIOD companies still absent (not in today's CSV, missed by csvdiff)
 *   E  — Rename detection: fingerprint-changing renames (GRACE_PERIOD + NEW entry)
 *   F  — Promote NEWLY_GRANTED → ACTIVE (grantedAt < today)
 *   G  — Update lastSeen for all ACTIVE records (single bulk UPDATE)
 *
 * Why ts-pattern: sponsor status/rating branching must remain explicit and
 * compile-time-checked as enums evolve; exhaustive matches prevent silent drift.
 * Priority 5 enum source of truth: shared/schema.ts sponsor_licence_timeline.licenceStatus.
 */

import stringSimilarity from "string-similarity";
import { db } from "../db";
import { sponsorCanonical, sponsorChanges } from "@shared/schema";
import { eq, inArray, and, sql, ne } from "drizzle-orm";
import { normalizeName, generateFingerprint } from "./sponsorListFetcher";
import type { CsvDiffResult } from "./binaryRunner";
import type { SponsorChange } from "./sponsorListFetcher";
import { loadFingerprintSet } from "./csvFingerprintBuilder";
import { storage } from "../storage";
import { logger } from "./logger";
import { sendAdminAlert } from "./adminAlert";
import { buildEmail } from "./emailTemplates";
import { sendViaResend } from "./notificationDispatcher";
import {
  areCompaniesFuzzyMatch,
  reconcileAdditionsDeletions,
  DEFAULT_FUZZY_CONFIG,
  type CompanyRecord
} from "./fuzzyMatcher";
import { match } from "ts-pattern";

const log = logger.child({ module: "SponsorStateMachine" });

const RENAME_SIMILARITY_THRESHOLD = 0.85;
const BATCH_SIZE = 500; // for bulk DB operations

/**
 * Mass-removal circuit breaker. If a single run tries to push more than this
 * fraction of live records into GRACE_PERIOD/REMOVED_REVOKED, the run aborts.
 * The 2026-05-20 incident (all 143K sponsors marked REMOVED_REVOKED after a
 * GOV.UK CSV schema change emptied the fingerprinted file) is exactly the
 * failure mode this guards against. Override with SPONSOR_ALLOW_MASS_REMOVAL=1
 * for a deliberate, operator-approved mass operation.
 */
const MASS_REMOVAL_FRACTION = 0.2;
const MASS_REMOVAL_MIN_LIVE = 1_000;

/**
 * Self-heal sweep: change events are suppressed above this count to avoid
 * flooding sponsor_changes and notification queues during a bulk repair.
 */
const MASS_REPAIR_EVENT_THRESHOLD = 1_000;

/**
 * The register normally has ~140K rows. A fingerprint set smaller than this
 * means the fingerprinted CSV is truncated or empty — never trust it for
 * absence-based removals (Phase D2) or presence-based resurrection (Phase C2).
 */
const MIN_TRUSTWORTHY_FINGERPRINT_SET = 50_000;

/**
 * Length-adjusted similarity threshold for rename detection.
 * Short names (e.g. "ABC Ltd" vs "XYZ Ltd") match at high similarity by chance,
 * so we require a higher threshold for shorter names. Long names get the base
 * 0.85 threshold because small differences in word order are meaningful.
 *
 * Scale:
 *   length 5  → 0.95
 *   length 10 → 0.90
 *   length 20+ → 0.85 (base)
 */
function nameAdjustedThreshold(nameA: string, nameB: string): number {
  const minLen = Math.min(nameA.length, nameB.length);
  if (minLen >= 20) return RENAME_SIMILARITY_THRESHOLD;
  // Linear ramp: minLen=5 → +0.10, minLen=20 → 0.00
  const bonus = ((20 - minLen) / 15) * 0.10;
  return RENAME_SIMILARITY_THRESHOLD + bonus;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CanonicalRow {
  id: number;
  fingerprint: string;
  currentName: string;
  townCity: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
  grantedAt: string;
  consecutiveMisses: number;
  historicalNames: string[] | null;
}

type SponsorCanonicalStatus =
  | "ACTIVE"
  | "NEWLY_GRANTED"
  | "GRACE_PERIOD"
  | "REMOVED_REVOKED"
  | "UNKNOWN";

export interface StateMachineResult {
  changes: SponsorChange[];
  addedCount: number;
  removedCount: number;
  updatedCount: number;  // attribute changes (upgrade/downgrade/route/name)
  reactivatedCount: number;
  gracePeriodCount: number;
}

// ── Rating classification ─────────────────────────────────────────────────────

function classifyRatingChange(prev: string, curr: string): "UPGRADED" | "DOWNGRADED" | null {
  const normalizeRating = (value: string): "A-RATING" | "B-RATING" | "UNKNOWN" => {
    const normalized = value.toLowerCase();
    if (normalized.includes("a-rating") || normalized.includes("a rating")) return "A-RATING";
    if (normalized.includes("b-rating") || normalized.includes("b rating")) return "B-RATING";
    return "UNKNOWN";
  };

  const previous = normalizeRating(prev);
  const current = normalizeRating(curr);
  const warnUnknownRating = (message: string) => {
    log.warn({ prev, curr, previousRating: previous, currentRating: current }, message);
    return null;
  };

  return match<[typeof previous, typeof current]>([previous, current])
    .returnType<"UPGRADED" | "DOWNGRADED" | null>()
    .with(["A-RATING", "A-RATING"], () => null)
    .with(["A-RATING", "B-RATING"], () => "DOWNGRADED")
    .with(["A-RATING", "UNKNOWN"], () => {
      return warnUnknownRating("Unrecognized current rating while classifying change");
    })
    .with(["B-RATING", "A-RATING"], () => "UPGRADED")
    .with(["B-RATING", "B-RATING"], () => null)
    .with(["B-RATING", "UNKNOWN"], () => {
      return warnUnknownRating("Unrecognized current rating while classifying change");
    })
    .with(["UNKNOWN", "A-RATING"], () => {
      return warnUnknownRating("Unrecognized previous rating while classifying change");
    })
    .with(["UNKNOWN", "B-RATING"], () => {
      return warnUnknownRating("Unrecognized previous rating while classifying change");
    })
    .with(["UNKNOWN", "UNKNOWN"], () => {
      return warnUnknownRating("Unrecognized previous/current ratings while classifying change");
    })
    .exhaustive();
}

function normalizeCanonicalStatus(status: string | null | undefined): SponsorCanonicalStatus {
  return match((status ?? "").trim().toUpperCase())
    .with("ACTIVE", () => "ACTIVE" as const)
    .with("NEWLY_GRANTED", () => "NEWLY_GRANTED" as const)
    .with("GRACE_PERIOD", () => "GRACE_PERIOD" as const)
    .with("REMOVED_REVOKED", () => "REMOVED_REVOKED" as const)
    .otherwise((unknownStatus) => {
      log.warn({ unknownStatus }, "Unrecognized sponsor canonical status in state machine");
      return "UNKNOWN" as const;
    });
}

// ── Batch helper ──────────────────────────────────────────────────────────────

async function batchedInsertChanges(changes: SponsorChange[], today: string): Promise<void> {
  if (!changes || changes.length === 0) return;

  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);
    
    // Map for O(1) lookups instead of O(N^2) Array.find()
    const batchMap = new Map<string, SponsorChange>();
    const insertValues = batch.map((c) => {
      // Create a unique key for the batch map
      const key = `${c.fingerprint}_${c.changeType}`;
      batchMap.set(key, c);
      
      return {
        organisationName: c.organisationName,
        fingerprint:      c.fingerprint ?? null,
        changeType:       c.changeType,
        previousValue:    c.previousValue ?? null,
        newValue:         c.newValue ?? null,
        snapshotDate:     today,
      };
    });

    const inserted = await db.insert(sponsorChanges)
      .values(insertValues)
      .returning({ id: sponsorChanges.id, fingerprint: sponsorChanges.fingerprint, changeType: sponsorChanges.changeType });

    // Populate DB-assigned id back into the SponsorChange objects efficiently
    for (const row of inserted) {
      const key = `${row.fingerprint}_${row.changeType}`;
      const match = batchMap.get(key);
      if (match) match.id = row.id;
    }
  }
}

// ── Reactivation watch helpers ────────────────────────────────────────────────

async function sendReactivationEmail(toEmail: string, companyName: string): Promise<boolean> {
  try {
    const { subject, html } = buildEmail("RE_ACTIVATED", companyName, "REMOVED_REVOKED", "NEWLY_GRANTED");
    const result = await sendViaResend(toEmail, subject, html);
    if (!result.success) {
      log.error({ err: result.error }, "[ReactivationWatch] Resend error");
      return false;
    }
    return true;
  } catch (err) {
    log.error({ err }, "[ReactivationWatch] Email send failed");
    return false;
  }
}

async function notifyReactivationWatchers(companyNames: string[]): Promise<void> {
  if (companyNames.length === 0) return;
  try {
    // Optimization for first run / massive diffs: if we have more than 10,000 candidates,
    // this is likely the first ETL run (140k+ records). We can skip reactivation emails
    // since no user could possibly have pending watches for 140k newly imported companies.
    if (companyNames.length > 10000) {
      log.info(`[ReactivationWatch] Skipping individual checks for ${companyNames.length} candidates (likely first-run).`);
      return;
    }

    for (const name of companyNames) {
      const watches = await storage.getPendingWatchesByCompanyName(name);
      for (const watch of watches) {
        if (!watch.userEmail) continue;
        const sent = await sendReactivationEmail(watch.userEmail, watch.companyName);
        if (sent) {
          await storage.markSponsorWatchNotified(watch.id);
          log.info(`[ReactivationWatch] Notified ${watch.userEmail} → "${watch.companyName}"`);
        }
      }
    }
  } catch (err) {
    // Never let notification errors abort the pipeline
    log.error({ err }, "[ReactivationWatch] notifyReactivationWatchers failed (non-fatal)");
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function applyStateMachine(
  diff: CsvDiffResult,
  today: string,
  todayFingerprintedCsvPath: string,
): Promise<StateMachineResult> {
  const changes: SponsorChange[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let updatedCount = 0;
  let reactivatedCount = 0;
  let gracePeriodCount = 0;

  // ── Phase A: Load only affected records from DB ───────────────────────────
  // Collect all fingerprints that appear anywhere in the diff
  const allDiffFPs = new Set<string>([
    ...diff.Additions.map((r) => r["fingerprint"] ?? ""),
    ...diff.Deletions.map((r) => r["fingerprint"] ?? ""),
    ...diff.Modifications.map((m) => m.curr["fingerprint"] ?? ""),
  ].filter(Boolean));

  let canonicalMap = new Map<string, CanonicalRow>();

  if (allDiffFPs.size > 0) {
    const fpArray = Array.from(allDiffFPs);
    // Batch query to avoid huge IN clauses
    for (let i = 0; i < fpArray.length; i += 1000) {
      const chunk = fpArray.slice(i, i + 1000);
      const rows = await db
        .select({
          id:               sponsorCanonical.id,
          fingerprint:      sponsorCanonical.fingerprint,
          currentName:      sponsorCanonical.currentName,
          townCity:         sponsorCanonical.townCity,
          typeRating:       sponsorCanonical.typeRating,
          route:            sponsorCanonical.route,
          status:           sponsorCanonical.status,
          grantedAt:        sponsorCanonical.grantedAt,
          consecutiveMisses: sponsorCanonical.consecutiveMisses,
          historicalNames:  sponsorCanonical.historicalNames,
        })
        .from(sponsorCanonical)
        .where(inArray(sponsorCanonical.fingerprint, chunk));

      for (const r of rows) canonicalMap.set(r.fingerprint, r as CanonicalRow);
    }
  }

  log.info(`[StateMachine] Loaded ${canonicalMap.size} affected canonical records.`);

   // ── Phase A½: Fuzzy Reconciliation of Additions/Deletions ────────
   const modUpdates: Array<{
     fingerprint: string;
     currentName: string;
     typeRating: string | null;
     route: string | null;
     historicalNames?: string[];
   }> = [];

   // Convert raw CSV rows to company records for fuzzy matching
   const additionRecords: CompanyRecord[] = diff.Additions.map(row => ({
     organisationName: (row["Organisation Name"] ?? row["organisation name"] ?? "").trim(),
     townCity: (row["Town/City"] ?? row["town/city"] ?? "").trim() || null,
     county: (row["County"] ?? row["county"] ?? "").trim() || null,
     route: (row["Route"] ?? row["route"] ?? "").trim() || null,
     fingerprint: (row["fingerprint"] ?? "").trim(),
     typeRating: (row["Type & Rating"] ?? row["type & rating"] ?? "").trim() || null
   })).filter(r => r.organisationName && r.fingerprint);

   const deletionRecords: CompanyRecord[] = diff.Deletions.map(row => ({
     organisationName: (row["Organisation Name"] ?? row["organisation name"] ?? "").trim(),
     townCity: (row["Town/City"] ?? row["town/city"] ?? "").trim() || null,
     route: (row["Route"] ?? row["route"] ?? "").trim() || null,
     fingerprint: (row["fingerprint"] ?? "").trim(),
     typeRating: (row["Type & Rating"] ?? row["type & rating"] ?? "").trim() || null
   })).filter(r => r.organisationName && r.fingerprint);

   // Perform fuzzy reconciliation
   const reconciliation = reconcileAdditionsDeletions(additionRecords, deletionRecords, {
     ...DEFAULT_FUZZY_CONFIG,
     nameThreshold: 0.88 // Slightly more aggressive for catching renames
   });

   // Log reconciliation results
    if (reconciliation.matches.length > 0) {
      log.info(`[StateMachine] Fuzzy reconciliation: ${reconciliation.matches.length} likely renames/relocations detected`);
      for (const match of reconciliation.matches) {
        log.info(`[StateMachine]   "${match.previous.organisationName}" → "${match.current.organisationName}" (similarity: ${match.similarity.toFixed(3)})`);
      }
    }

   for (const match of reconciliation.matches) {
     const { previous, current } = match;
     const fp = current.fingerprint;
     
     // Use the 'current' (new) data as the canonical version
     const existing = canonicalMap.get(fp);
     if (!existing) {
       // Should not happen, but guard against it
       canonicalMap.set(fp, {
         id: 0, // placeholder, will be updated from DB if needed
         fingerprint: fp,
         currentName: current.organisationName,
         townCity: current.townCity ?? null,
         typeRating: current.typeRating ?? null,
         route: current.route ?? null,
         status: "ACTIVE", // assume active for new matches
         grantedAt: today,
         consecutiveMisses: 0,
         historicalNames: []
       });
     }

     // Determine if this is actually a name change or other modification
     const prevNameNormalized = normalizeName(previous.organisationName);
     const currNameNormalized = normalizeName(current.organisationName);
     
     if (prevNameNormalized !== currNameNormalized) {
       // Actual name change
       const newHistorical = [...(existing?.historicalNames ?? []), previous.organisationName];
       modUpdates.push({
         fingerprint: fp,
         currentName: current.organisationName,
         typeRating: current.typeRating ?? (existing?.typeRating ?? null),
         route: current.route ?? (existing?.route ?? null),
         historicalNames: newHistorical
       });
       
       changes.push({ 
         organisationName: current.organisationName, 
         changeType: "NAME_CHANGE", 
         previousValue: previous.organisationName, 
         newValue: current.organisationName, 
         fingerprint: fp 
       });
     } else {
       // Other changes (address, route, etc.) - treat as general modification
       modUpdates.push({
         fingerprint: fp,
         currentName: current.organisationName,
         typeRating: current.typeRating ?? (existing?.typeRating ?? null),
         route: current.route ?? (existing?.route ?? null),
         historicalNames: existing?.historicalNames ?? []
       });
     }
   }

  // ── Phase B: Modifications (attribute changes) ────────────────────────────

  for (const { prev, curr } of diff.Modifications) {
    const fp = curr["fingerprint"] ?? "";
    if (!fp) continue;

    const existing = canonicalMap.get(fp);
    const currName    = curr["Organisation Name"] ?? curr["organisation name"] ?? "";
    const currRating  = curr["Type & Rating"]     ?? curr["type & rating"]     ?? "";
    const currRoute   = curr["Route"]             ?? curr["route"]             ?? "";
    const prevRating  = prev["Type & Rating"]     ?? prev["type & rating"]     ?? "";
    const prevRoute   = prev["Route"]             ?? prev["route"]             ?? "";
    const prevName    = prev["Organisation Name"] ?? prev["organisation name"] ?? "";

    const ratingChange = classifyRatingChange(prevRating, currRating);
    if (ratingChange) {
      changes.push({ organisationName: currName, changeType: ratingChange, previousValue: prevRating, newValue: currRating, fingerprint: fp });
      updatedCount++;
    }

    if (prevRoute.toLowerCase() !== currRoute.toLowerCase()) {
      changes.push({ organisationName: currName, changeType: "ROUTE_CHANGE", previousValue: prevRoute, newValue: currRoute, fingerprint: fp });
      updatedCount++;
    }

    const prevNorm = normalizeName(prevName);
    const currNorm = normalizeName(currName);
    if (prevNorm !== currNorm) {
      const newHistorical = [...(existing?.historicalNames ?? [])];
      if (prevName && !newHistorical.includes(prevName)) newHistorical.push(prevName);
      changes.push({ organisationName: currName, changeType: "NAME_CHANGE", previousValue: prevName, newValue: currName, fingerprint: fp });
      updatedCount++;
      modUpdates.push({ fingerprint: fp, currentName: currName, typeRating: currRating, route: currRoute, historicalNames: newHistorical });
    } else {
      modUpdates.push({ fingerprint: fp, currentName: currName, typeRating: currRating, route: currRoute });
    }
  }

  // Bulk update modified records
  for (const upd of modUpdates) {
    await db
      .update(sponsorCanonical)
      .set({
        currentName:      upd.currentName,
        typeRating:       upd.typeRating,
        route:            upd.route,
        lastSeen:         today,
        consecutiveMisses: 0,
        ...(upd.historicalNames ? { historicalNames: upd.historicalNames } : {}),
      })
      .where(eq(sponsorCanonical.fingerprint, upd.fingerprint));
  }

  log.info(`[StateMachine] Phase B: ${modUpdates.length} modifications processed.`);

  // ── Phase C: Additions (new / re-activated / flicker) ────────────────────
  const toInsertNew: typeof sponsorCanonical.$inferInsert[] = [];
  const toReactivate: string[] = [];    // fingerprints: REMOVED_REVOKED → NEWLY_GRANTED
  const toRecoverFlicker: string[] = []; // fingerprints: GRACE_PERIOD → ACTIVE
  const reactivationCandidates: string[] = []; // company names to check for pending watches
  
  // Detect first-run/seed: suppress NEW_LICENCE events only when canonical
  // is truly empty (< 1 000 rows). This prevents gap-recovery runs (canonical
  // already populated) from silently dropping real changes at the 100K threshold.
  const canonicalCountResult = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM sponsor_canonical WHERE status != 'REMOVED_REVOKED'
  `);
  const activeCanonicalRows = (canonicalCountResult.rows[0] as { cnt: number } | undefined)?.cnt ?? 0;
  const isFirstRun = reconciliation.additions.length > 100000 && activeCanonicalRows < 1000;
  if (reconciliation.additions.length > 100000 && !isFirstRun) {
    log.warn(
      { additions: reconciliation.additions.length, activeCanonicalRows },
      "[StateMachine] Additions > 100K but canonical is already populated — NOT treating as first run. Real NEW_LICENCE events will be emitted.",
    );
  }

  for (const row of reconciliation.additions) {
    const fp      = row.fingerprint;
    const orgName = row.organisationName;
    if (!fp || !orgName) continue;

    const existing = canonicalMap.get(fp);

    if (!existing) {
      // Brand new company
      toInsertNew.push({
        fingerprint:      fp,
        currentName:      orgName,
        townCity:         row.townCity,
        county:           row.county ?? null,
        typeRating:       row.typeRating,
        route:            row.route,
        status:           "NEWLY_GRANTED",
        firstSeen:        today,
        lastSeen:         today,
        grantedAt:        today,
        consecutiveMisses: 0,
        historicalNames:  [],
      });
      
      // Only track NEW_LICENCE change events if this is NOT the initial 140k+ seed
      if (!isFirstRun) {
        changes.push({ organisationName: orgName, changeType: "NEW_LICENCE", previousValue: null, newValue: orgName, fingerprint: fp });
      }
      
      reactivationCandidates.push(orgName);
      addedCount++;
    } else {
      match(normalizeCanonicalStatus(existing.status))
        .with("REMOVED_REVOKED", () => {
          // Reactivation
          toReactivate.push(fp);
          changes.push({
            organisationName: orgName,
            changeType: "RE_ACTIVATED",
            previousValue: "REMOVED_REVOKED",
            newValue: "NEWLY_GRANTED",
            fingerprint: fp,
          });
          reactivationCandidates.push(orgName);
          reactivatedCount++;
        })
        .with("GRACE_PERIOD", () => {
          // Re-appearing after one-day miss = flicker recovery.
          toRecoverFlicker.push(fp);
        })
        // Existing listed/unknown records require no additional Phase C action.
        .with("ACTIVE", "NEWLY_GRANTED", "UNKNOWN", () => {})
        .exhaustive();
    }
    // ACTIVE / NEWLY_GRANTED already in today's CSV — handled by modification phase or unchanged
  }

  // Batch insert new companies
  for (let i = 0; i < toInsertNew.length; i += BATCH_SIZE) {
    await db.insert(sponsorCanonical).values(toInsertNew.slice(i, i + BATCH_SIZE)).onConflictDoNothing();
  }

  // Bulk reactivate
  if (toReactivate.length > 0) {
    for (let i = 0; i < toReactivate.length; i += BATCH_SIZE) {
      await db
        .update(sponsorCanonical)
        .set({ status: "NEWLY_GRANTED", grantedAt: today, consecutiveMisses: 0, removedAt: null, lastSeen: today })
        .where(inArray(sponsorCanonical.fingerprint, toReactivate.slice(i, i + BATCH_SIZE)));
    }
  }

  // Bulk recover flickers
  if (toRecoverFlicker.length > 0) {
    for (let i = 0; i < toRecoverFlicker.length; i += BATCH_SIZE) {
      await db
        .update(sponsorCanonical)
        .set({ status: "ACTIVE", consecutiveMisses: 0, lastSeen: today })
        .where(inArray(sponsorCanonical.fingerprint, toRecoverFlicker.slice(i, i + BATCH_SIZE)));
    }
  }

  log.info(
    `[StateMachine] Phase C: +${toInsertNew.length} new, ${toReactivate.length} reactivated, ${toRecoverFlicker.length} flicker recovered.`,
  );

  // Fire reactivation watch notifications (non-blocking — errors are caught internally).
  // CONTRACT: when a previously REMOVED_REVOKED sponsor reappears in today's CSV,
  // its canonical row transitions back to NEWLY_GRANTED (Phase C above) and a
  // RE_ACTIVATED change is logged. notifyReactivationWatchers() emails every user
  // who has this company on their watchlist — this is the "Licence is back" alert
  // surfaced on the Sponsor Monitor page. Do not remove without updating that flow.
  await notifyReactivationWatchers(reactivationCandidates);

  // ── Phase C2: Self-heal sweep (presence-based resurrection) ───────────────
  // csvdiff only reports day-over-day deltas, so a sponsor wrongly stuck in
  // REMOVED_REVOKED/GRACE_PERIOD while present in today's register is invisible
  // to Phases C and D forever (present yesterday AND today → no diff entry).
  // This sweep reconciles DB state against today's full fingerprint set so a
  // bad historical run (e.g. the 2026-05-20 mass removal) self-repairs on the
  // next healthy run instead of persisting indefinitely.
  const todayFingerprintSet = await loadFingerprintSet(todayFingerprintedCsvPath);

  if (todayFingerprintSet.size >= MIN_TRUSTWORTHY_FINGERPRINT_SET) {
    const handledThisRun = new Set([...toReactivate, ...toRecoverFlicker]);
    const staleRows = await db
      .select({
        fingerprint: sponsorCanonical.fingerprint,
        currentName: sponsorCanonical.currentName,
        status:      sponsorCanonical.status,
      })
      .from(sponsorCanonical)
      .where(inArray(sponsorCanonical.status, ["REMOVED_REVOKED", "GRACE_PERIOD"]));

    const toResurrect = staleRows.filter(
      (r) => todayFingerprintSet.has(r.fingerprint) && !handledThisRun.has(r.fingerprint),
    );

    if (toResurrect.length > 0) {
      const suppressEvents = toResurrect.length > MASS_REPAIR_EVENT_THRESHOLD;
      log.warn(
        { count: toResurrect.length, suppressEvents },
        "[StateMachine] Phase C2: resurrecting sponsors present in today's register but marked removed/grace in DB.",
      );

      const fps = toResurrect.map((r) => r.fingerprint);
      for (let i = 0; i < fps.length; i += BATCH_SIZE) {
        await db
          .update(sponsorCanonical)
          .set({ status: "ACTIVE", removedAt: null, consecutiveMisses: 0, lastSeen: today })
          .where(inArray(sponsorCanonical.fingerprint, fps.slice(i, i + BATCH_SIZE)));
      }

      if (!suppressEvents) {
        for (const r of toResurrect) {
          changes.push({
            organisationName: r.currentName,
            changeType:       "RE_ACTIVATED",
            previousValue:    r.status,
            newValue:         "ACTIVE",
            fingerprint:      r.fingerprint,
          });
        }
      } else {
        await sendAdminAlert(
          "CheckByAI: Mass self-heal repair executed",
          `<p>Phase C2 resurrected ${toResurrect.length.toLocaleString()} sponsors that were present ` +
          `in today's register but marked REMOVED_REVOKED/GRACE_PERIOD in the database. ` +
          `Per-company change events were suppressed to avoid flooding sponsor_changes.</p>`,
        ).catch((err: unknown) => log.warn({ err }, "[StateMachine] Failed to send mass-repair alert"));
      }
      reactivatedCount += toResurrect.length;
    }
  } else {
    log.warn(
      { size: todayFingerprintSet.size },
      "[StateMachine] Today's fingerprint set is suspiciously small — skipping Phase C2 sweep (and Phase D2 will be skipped too).",
    );
    // Operators must hear about this, not just the logs: while skipped, sponsors
    // already in GRACE_PERIOD are neither promoted to REMOVED_REVOKED nor
    // resurrected, so they strand there until a trustworthy register arrives.
    await sendAdminAlert(
      "ALERT: Sponsor sync degraded — fingerprint set too small, Phase C2/D2 skipped",
      `<p>Today's fingerprint set has ${todayFingerprintSet.size.toLocaleString()} entries, below the ` +
      `${MIN_TRUSTWORTHY_FINGERPRINT_SET.toLocaleString()} trust threshold (register is normally ~140K rows). ` +
      `Phase C2 (self-heal resurrection) and Phase D2 (second-miss removal) were both skipped. ` +
      `Sponsors currently in GRACE_PERIOD will not change state until a full register is processed.</p>` +
      `<p>Likely cause: truncated download or GOV.UK CSV schema change. ` +
      `File: ${todayFingerprintedCsvPath}</p>`,
    ).catch((err: unknown) => log.warn({ err }, "[StateMachine] Failed to send small-fingerprint-set alert"));
  }

  // ── Phase D: Deletions (first and second misses) ──────────────────────────
  const toGracePeriod: string[] = [];
  const toRemove: string[] = [];
  const removedNames = new Map<string, string>(); // fp → orgName (for rename detection)

  for (const row of reconciliation.deletions) {
    const fp      = row.fingerprint;
    const orgName = row.organisationName;
    if (!fp) continue;

    const existing = canonicalMap.get(fp);
    if (!existing) continue; // not in DB (already removed before)

    match(normalizeCanonicalStatus(existing.status))
      .with("ACTIVE", "NEWLY_GRANTED", () => {
        toGracePeriod.push(fp);
        removedNames.set(fp, orgName || existing.currentName);
        gracePeriodCount++;
        // No change event yet — wait for second miss
      })
      .with("GRACE_PERIOD", () => {
        toRemove.push(fp);
        changes.push({
          organisationName: orgName || existing.currentName,
          changeType:       "REMOVED_REVOKED",
          previousValue:    "GRACE_PERIOD",
          newValue:         "REMOVED_REVOKED",
          fingerprint:      fp,
        });
        removedCount++;
      })
      .with("REMOVED_REVOKED", () => {})
      .with("UNKNOWN", () => {})
      .exhaustive();
    // REMOVED_REVOKED: already removed, increment misses only
  }

  // ── Mass-removal circuit breaker ──────────────────────────────────────────
  // A healthy day removes dozens of sponsors, not a meaningful fraction of the
  // register. If this run wants to push more than MASS_REMOVAL_FRACTION of
  // live records out of circulation, the input data is almost certainly bad
  // (schema change, truncated CSV, empty fingerprint file) — abort loudly.
  const deletionImpact = toGracePeriod.length + toRemove.length;
  if (deletionImpact > 0 && process.env.SPONSOR_ALLOW_MASS_REMOVAL !== "1") {
    const liveCountResult = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM sponsor_canonical
      WHERE status IN ('ACTIVE', 'NEWLY_GRANTED', 'GRACE_PERIOD')
    `);
    const liveCount = (liveCountResult.rows[0] as { cnt: number } | undefined)?.cnt ?? 0;
    if (liveCount >= MASS_REMOVAL_MIN_LIVE && deletionImpact > liveCount * MASS_REMOVAL_FRACTION) {
      const msg =
        `Mass-removal circuit breaker tripped: run wants to remove/grace ${deletionImpact.toLocaleString()} ` +
        `of ${liveCount.toLocaleString()} live sponsors (> ${MASS_REMOVAL_FRACTION * 100}%). ` +
        `Aborting before any removals are applied (Phase C2 resurrections from earlier in this run, ` +
        `if any, remain committed — they only ever set sponsors back to ACTIVE). ` +
        `Set SPONSOR_ALLOW_MASS_REMOVAL=1 to override deliberately.`;
      log.error({ deletionImpact, liveCount }, `[StateMachine] ${msg}`);
      await sendAdminAlert(
        "ALERT: Sponsor sync aborted — mass-removal circuit breaker",
        `<p>${msg}</p><p>Likely cause: GOV.UK CSV schema change or truncated/empty fingerprinted CSV.</p>`,
      ).catch((err: unknown) => log.warn({ err }, "[StateMachine] Failed to send circuit-breaker alert"));
      throw new Error(msg);
    }
  }

  // Bulk move to GRACE_PERIOD
  if (toGracePeriod.length > 0) {
    for (let i = 0; i < toGracePeriod.length; i += BATCH_SIZE) {
      await db
        .update(sponsorCanonical)
        .set({ status: "GRACE_PERIOD", consecutiveMisses: 1 })
        .where(inArray(sponsorCanonical.fingerprint, toGracePeriod.slice(i, i + BATCH_SIZE)));
    }
  }

  // Bulk confirm removals
  if (toRemove.length > 0) {
    for (let i = 0; i < toRemove.length; i += BATCH_SIZE) {
      await db
        .update(sponsorCanonical)
        .set({
          status:            "REMOVED_REVOKED",
          removedAt:         new Date(),
          consecutiveMisses: sql`${sponsorCanonical.consecutiveMisses} + 1`,
        })
        .where(inArray(sponsorCanonical.fingerprint, toRemove.slice(i, i + BATCH_SIZE)));
    }
  }

  log.info(
    `[StateMachine] Phase D: ${toGracePeriod.length} → GRACE_PERIOD, ${toRemove.length} → REMOVED_REVOKED.`,
  );

  // ── Phase D2: GRACE_PERIOD companies still absent (second miss via DB) ────
  // These are companies that were absent in D-1 AND D. csvdiff won't show them
  // because they're absent in both files. We detect them by comparing all
  // GRACE_PERIOD records against today's fingerprint set.
  // Reuses todayFingerprintSet loaded in Phase C2. Absence-based removal is
  // only safe when the fingerprint set is plausibly the full register: an
  // empty/truncated set would mark every GRACE_PERIOD sponsor as removed.
  const processedInPhaseD = new Set([...toGracePeriod, ...toRemove]);

  const allGracePeriod = todayFingerprintSet.size >= MIN_TRUSTWORTHY_FINGERPRINT_SET
    ? await db
        .select({
          fingerprint:  sponsorCanonical.fingerprint,
          currentName:  sponsorCanonical.currentName,
          consecutiveMisses: sponsorCanonical.consecutiveMisses,
        })
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.status, "GRACE_PERIOD"))
    : [];

  const toRemoveD2 = allGracePeriod.filter(
    (r) => !processedInPhaseD.has(r.fingerprint) && !todayFingerprintSet.has(r.fingerprint),
  );

  if (toRemoveD2.length > 0) {
    for (let i = 0; i < toRemoveD2.length; i += BATCH_SIZE) {
      const chunk = toRemoveD2.slice(i, i + BATCH_SIZE);
      await db
        .update(sponsorCanonical)
        .set({
          status:            "REMOVED_REVOKED",
          removedAt:         new Date(),
          consecutiveMisses: sql`${sponsorCanonical.consecutiveMisses} + 1`,
        })
        .where(inArray(sponsorCanonical.fingerprint, chunk.map((r) => r.fingerprint)));

      for (const r of chunk) {
        changes.push({
          organisationName: r.currentName,
          changeType:       "REMOVED_REVOKED",
          previousValue:    "GRACE_PERIOD",
          newValue:         "REMOVED_REVOKED",
          fingerprint:      r.fingerprint,
        });
        removedCount++;
      }
    }
    log.info(`[StateMachine] Phase D2: ${toRemoveD2.length} second-miss removals confirmed.`);
  }

  // ── Phase E: Rename detection ─────────────────────────────────────────────
  // A rename creates a new fingerprint (normalizeName changes). csvdiff sees:
  //   - Deletion of old fingerprint (now in GRACE_PERIOD from Phase D)
  //   - Addition of new fingerprint (now NEWLY_GRANTED from Phase C)
  // Group candidates by city+route, fuzzy-match names.
  if (toGracePeriod.length > 0 && toInsertNew.length > 0) {
    await detectRenames(toGracePeriod, toInsertNew, canonicalMap, changes, today);
  }

  // ── Phase F: Promote NEWLY_GRANTED → ACTIVE ───────────────────────────────
  const promoted = await db
    .update(sponsorCanonical)
    .set({ status: "ACTIVE" })
    .where(
      and(
        eq(sponsorCanonical.status, "NEWLY_GRANTED"),
        sql`${sponsorCanonical.grantedAt} < ${today}::date`,
      ),
    )
    .returning({ fingerprint: sponsorCanonical.fingerprint });

  log.info(`[StateMachine] Phase F: ${promoted.length} NEWLY_GRANTED → ACTIVE promoted.`);

  // ── Phase G: Update lastSeen for all ACTIVE records ───────────────────────
  // By now, GRACE_PERIOD and REMOVED_REVOKED records have been moved.
  // All remaining ACTIVE records are present in today's CSV.
  const updated = await db
    .update(sponsorCanonical)
    .set({ lastSeen: today, consecutiveMisses: 0 })
    .where(eq(sponsorCanonical.status, "ACTIVE"))
    .returning({ fingerprint: sponsorCanonical.fingerprint });

  log.info(`[StateMachine] Phase G: ${updated.length} ACTIVE records updated lastSeen.`);

  // ── Persist change events ─────────────────────────────────────────────────
  if (changes.length > 0) {
    await batchedInsertChanges(changes, today);
  }

  log.info(
    `[StateMachine] Complete: +${addedCount} new, -${removedCount} removed, ` +
    `~${updatedCount} updated, ${reactivatedCount} reactivated, ${gracePeriodCount} pending.`,
  );

  return { changes, addedCount, removedCount, updatedCount, reactivatedCount, gracePeriodCount };
}

// ── Rename detection ──────────────────────────────────────────────────────────

async function detectRenames(
  gracePeriodFPs: string[],
  newInserts: typeof sponsorCanonical.$inferInsert[],
  canonicalMap: Map<string, CanonicalRow>,
  changes: SponsorChange[],
  today: string,
): Promise<void> {
  // Build lookup of new inserts grouped by city+route
  type NewEntry = { fp: string; name: string; city: string; route: string };
  const newByGroup = new Map<string, NewEntry[]>();

  for (const ins of newInserts) {
    const city  = (ins.townCity  ?? "").toLowerCase().trim();
    const route = (ins.route     ?? "").toLowerCase().trim();
    const key   = `${city}||${route}`;
    const arr   = newByGroup.get(key) ?? [];
    arr.push({ fp: ins.fingerprint as string, name: ins.currentName as string, city, route });
    newByGroup.set(key, arr);
  }

  const renamedNewFPs    = new Set<string>(); // new entries that are actually renames
  const cancelGracePeriod = new Set<string>(); // old FPs to restore to ACTIVE

  for (const oldFP of gracePeriodFPs) {
    const existing = canonicalMap.get(oldFP);
    if (!existing) continue;

    const city  = (existing.townCity ?? "").toLowerCase().trim();
    const route = (existing.route    ?? "").toLowerCase().trim();
    const key   = `${city}||${route}`;
    const candidates = newByGroup.get(key) ?? [];

    for (const candidate of candidates) {
      if (renamedNewFPs.has(candidate.fp)) continue; // already claimed by another rename

      const normalizedExisting = normalizeName(existing.currentName);
      const normalizedCandidate = normalizeName(candidate.name);
      const sim = stringSimilarity.compareTwoStrings(normalizedExisting, normalizedCandidate);
      const threshold = nameAdjustedThreshold(normalizedExisting, normalizedCandidate);

      if (sim >= threshold) {
        // This is a rename — update canonical record with new fingerprint + name
        const newHistorical = [...(existing.historicalNames ?? [])];
        if (existing.currentName && !newHistorical.includes(existing.currentName)) {
          newHistorical.push(existing.currentName);
        }

        // Fix: avoid PK mutation (updating fingerprint to candidate.fp would conflict with the
        // NEWLY_GRANTED record for candidate.fp that was already inserted in Phase C).
        // Instead: update the NEWLY_GRANTED record (candidate.fp) with merged data,
        // then delete the old GRACE_PERIOD record (oldFP).
        await db
          .update(sponsorCanonical)
          .set({
            currentName:     candidate.name,
            status:          "ACTIVE",
            lastSeen:        today,
            consecutiveMisses: 0,
            historicalNames: newHistorical,
            // Preserve the original grant date so history is correct
            ...(existing.grantedAt ? { grantedAt: existing.grantedAt } : {}),
          })
          .where(eq(sponsorCanonical.fingerprint, candidate.fp));

        // Delete the old GRACE_PERIOD record (superseded by the rename above)
        await db
          .delete(sponsorCanonical)
          .where(eq(sponsorCanonical.fingerprint, oldFP));

        changes.push({
          organisationName: candidate.name,
          changeType:       "NAME_CHANGE",
          previousValue:    existing.currentName,
          newValue:         candidate.name,
          fingerprint:      candidate.fp,
        });

        // Remove the "new licence" change event that was already added for this FP
        const newLicenceIdx = changes.findIndex(
          (c) => c.fingerprint === candidate.fp && c.changeType === "NEW_LICENCE",
        );
        if (newLicenceIdx >= 0) changes.splice(newLicenceIdx, 1);

        renamedNewFPs.add(candidate.fp);
        cancelGracePeriod.add(oldFP);
        log.info(`[StateMachine] Rename detected: "${existing.currentName}" → "${candidate.name}" (sim=${sim.toFixed(2)})`);
        break;
      }
    }
  }

  if (cancelGracePeriod.size > 0) {
    log.info(`[StateMachine] Phase E: ${cancelGracePeriod.size} renames resolved.`);
  }
}
