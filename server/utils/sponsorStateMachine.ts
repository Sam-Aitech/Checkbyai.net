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
import { buildEmail, sendViaResend } from "../services/notificationEngine";

const RENAME_SIMILARITY_THRESHOLD = 0.85;
const BATCH_SIZE = 500; // for bulk DB operations

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
  const p = prev.toLowerCase();
  const c = curr.toLowerCase();
  if (p === c) return null;
  const prevIsA = p.includes("a-rating") || p.includes("a rating");
  const prevIsB = p.includes("b-rating") || p.includes("b rating");
  const currIsA = c.includes("a-rating") || c.includes("a rating");
  const currIsB = c.includes("b-rating") || c.includes("b rating");
  if (prevIsA && currIsB) return "DOWNGRADED";
  if (prevIsB && currIsA) return "UPGRADED";
  return null;
}

// ── Batch helper ──────────────────────────────────────────────────────────────

async function batchedInsertChanges(changes: SponsorChange[], today: string): Promise<void> {
  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);
    const inserted = await db.insert(sponsorChanges).values(
      batch.map((c) => ({
        organisationName: c.organisationName,
        fingerprint:      c.fingerprint ?? null,
        changeType:       c.changeType,
        previousValue:    c.previousValue ?? null,
        newValue:         c.newValue ?? null,
        snapshotDate:     today,
      })),
    ).returning({ id: sponsorChanges.id, fingerprint: sponsorChanges.fingerprint, changeType: sponsorChanges.changeType });

    // Populate DB-assigned id back into the SponsorChange objects so
    // notifyAffectedUsers() can use it as the notificationLog.changeId FK.
    for (const row of inserted) {
      const match = batch.find(
        (c) => c.fingerprint === row.fingerprint && c.changeType === row.changeType,
      );
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
      console.error("[ReactivationWatch] Resend error:", result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ReactivationWatch] Email send failed:", err);
    return false;
  }
}

async function notifyReactivationWatchers(companyNames: string[]): Promise<void> {
  if (companyNames.length === 0) return;
  try {
    for (const name of companyNames) {
      const watches = await storage.getPendingWatchesByCompanyName(name);
      for (const watch of watches) {
        if (!watch.userEmail) continue;
        const sent = await sendReactivationEmail(watch.userEmail, watch.companyName);
        if (sent) {
          await storage.markSponsorWatchNotified(watch.id);
          console.log(`[ReactivationWatch] Notified ${watch.userEmail} → "${watch.companyName}"`);
        }
      }
    }
  } catch (err) {
    // Never let notification errors abort the pipeline
    console.error("[ReactivationWatch] notifyReactivationWatchers failed (non-fatal):", err);
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

  console.log(`[StateMachine] Loaded ${canonicalMap.size} affected canonical records.`);

  // ── Phase B: Modifications (attribute changes) ────────────────────────────
  const modUpdates: Array<{
    fingerprint: string;
    currentName: string;
    typeRating: string;
    route: string;
    historicalNames?: string[];
  }> = [];

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

  console.log(`[StateMachine] Phase B: ${modUpdates.length} modifications processed.`);

  // ── Phase C: Additions (new / re-activated / flicker) ────────────────────
  const toInsertNew: typeof sponsorCanonical.$inferInsert[] = [];
  const toReactivate: string[] = [];    // fingerprints: REMOVED_REVOKED → NEWLY_GRANTED
  const toRecoverFlicker: string[] = []; // fingerprints: GRACE_PERIOD → ACTIVE
  const reactivationCandidates: string[] = []; // company names to check for pending watches

  for (const row of diff.Additions) {
    const fp      = (row["fingerprint"] ?? "").trim();
    const orgName = (row["Organisation Name"] ?? row["organisation name"] ?? "").trim();
    if (!fp || !orgName) continue;

    const existing = canonicalMap.get(fp);

    if (!existing) {
      // Brand new company
      toInsertNew.push({
        fingerprint:      fp,
        currentName:      orgName,
        townCity:         (row["Town/City"] ?? row["town/city"] ?? "").trim() || null,
        typeRating:       (row["Type & Rating"] ?? row["type & rating"] ?? "").trim() || null,
        route:            (row["Route"] ?? row["route"] ?? "").trim() || null,
        status:           "NEWLY_GRANTED",
        firstSeen:        today,
        lastSeen:         today,
        grantedAt:        today,
        consecutiveMisses: 0,
        historicalNames:  [],
      });
      changes.push({ organisationName: orgName, changeType: "NEW_LICENCE", previousValue: null, newValue: orgName, fingerprint: fp });
      reactivationCandidates.push(orgName);
      addedCount++;
    } else if (existing.status === "REMOVED_REVOKED") {
      // Reactivation
      toReactivate.push(fp);
      changes.push({ organisationName: orgName, changeType: "RE_ACTIVATED", previousValue: "REMOVED_REVOKED", newValue: "NEWLY_GRANTED", fingerprint: fp });
      reactivationCandidates.push(orgName);
      reactivatedCount++;
    } else if (existing.status === "GRACE_PERIOD") {
      // Flicker: company disappeared for one day and came back — suppress the removal
      toRecoverFlicker.push(fp);
      // No change event — flicker is noise, not a real change
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

  console.log(
    `[StateMachine] Phase C: +${toInsertNew.length} new, ${toReactivate.length} reactivated, ${toRecoverFlicker.length} flicker recovered.`,
  );

  // Fire reactivation watch notifications (non-blocking — errors are caught internally)
  await notifyReactivationWatchers(reactivationCandidates);

  // ── Phase D: Deletions (first and second misses) ──────────────────────────
  const toGracePeriod: string[] = [];
  const toRemove: string[] = [];
  const removedNames = new Map<string, string>(); // fp → orgName (for rename detection)

  for (const row of diff.Deletions) {
    const fp      = (row["fingerprint"] ?? "").trim();
    const orgName = (row["Organisation Name"] ?? row["organisation name"] ?? "").trim();
    if (!fp) continue;

    const existing = canonicalMap.get(fp);
    if (!existing) continue; // not in DB (already removed before)

    if (existing.status === "ACTIVE" || existing.status === "NEWLY_GRANTED") {
      toGracePeriod.push(fp);
      removedNames.set(fp, orgName || existing.currentName);
      gracePeriodCount++;
      // No change event yet — wait for second miss
    } else if (existing.status === "GRACE_PERIOD") {
      toRemove.push(fp);
      changes.push({
        organisationName: orgName || existing.currentName,
        changeType:       "REMOVED_REVOKED",
        previousValue:    "GRACE_PERIOD",
        newValue:         "REMOVED_REVOKED",
        fingerprint:      fp,
      });
      removedCount++;
    }
    // REMOVED_REVOKED: already removed, increment misses only
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

  console.log(
    `[StateMachine] Phase D: ${toGracePeriod.length} → GRACE_PERIOD, ${toRemove.length} → REMOVED_REVOKED.`,
  );

  // ── Phase D2: GRACE_PERIOD companies still absent (second miss via DB) ────
  // These are companies that were absent in D-1 AND D. csvdiff won't show them
  // because they're absent in both files. We detect them by comparing all
  // GRACE_PERIOD records against today's fingerprint set.
  const todayFingerprintSet = await loadFingerprintSet(todayFingerprintedCsvPath);
  const processedInPhaseD   = new Set([...toGracePeriod, ...toRemove]);

  const allGracePeriod = await db
    .select({
      fingerprint:  sponsorCanonical.fingerprint,
      currentName:  sponsorCanonical.currentName,
      consecutiveMisses: sponsorCanonical.consecutiveMisses,
    })
    .from(sponsorCanonical)
    .where(eq(sponsorCanonical.status, "GRACE_PERIOD"));

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
    console.log(`[StateMachine] Phase D2: ${toRemoveD2.length} second-miss removals confirmed.`);
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

  console.log(`[StateMachine] Phase F: ${promoted.length} NEWLY_GRANTED → ACTIVE promoted.`);

  // ── Phase G: Update lastSeen for all ACTIVE records ───────────────────────
  // By now, GRACE_PERIOD and REMOVED_REVOKED records have been moved.
  // All remaining ACTIVE records are present in today's CSV.
  const updated = await db
    .update(sponsorCanonical)
    .set({ lastSeen: today, consecutiveMisses: 0 })
    .where(eq(sponsorCanonical.status, "ACTIVE"))
    .returning({ fingerprint: sponsorCanonical.fingerprint });

  console.log(`[StateMachine] Phase G: ${updated.length} ACTIVE records updated lastSeen.`);

  // ── Persist change events ─────────────────────────────────────────────────
  if (changes.length > 0) {
    await batchedInsertChanges(changes, today);
  }

  console.log(
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

      const sim = stringSimilarity.compareTwoStrings(
        normalizeName(existing.currentName),
        normalizeName(candidate.name),
      );

      if (sim >= RENAME_SIMILARITY_THRESHOLD) {
        // This is a rename — update canonical record with new fingerprint + name
        const newHistorical = [...(existing.historicalNames ?? [])];
        if (existing.currentName && !newHistorical.includes(existing.currentName)) {
          newHistorical.push(existing.currentName);
        }

        await db
          .update(sponsorCanonical)
          .set({
            fingerprint:     candidate.fp,
            currentName:     candidate.name,
            status:          "ACTIVE",
            lastSeen:        today,
            consecutiveMisses: 0,
            historicalNames: newHistorical,
          })
          .where(eq(sponsorCanonical.fingerprint, oldFP));

        // Remove the NEWLY_GRANTED insert (it's actually the same company)
        await db
          .delete(sponsorCanonical)
          .where(
            and(
              eq(sponsorCanonical.fingerprint, candidate.fp),
              eq(sponsorCanonical.status, "NEWLY_GRANTED"),
            ),
          );

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
        console.log(`[StateMachine] Rename detected: "${existing.currentName}" → "${candidate.name}" (sim=${sim.toFixed(2)})`);
        break;
      }
    }
  }

  if (cancelGracePeriod.size > 0) {
    console.log(`[StateMachine] Phase E: ${cancelGracePeriod.size} renames resolved.`);
  }
}
