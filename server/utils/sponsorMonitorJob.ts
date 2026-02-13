import cron from "node-cron";
import stringSimilarity from "string-similarity";
import { db } from "../db";
import { sponsorCanonical, sponsorChanges, dailyDigest } from "@shared/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import {
  downloadAndParseSponsorList,
  storeSnapshot,
  cleanupOldSnapshots,
  generateFingerprint,
  type SponsorRecord,
  type SponsorChange,
} from "./sponsorListFetcher";
import { rebuildSponsorIndex } from "./sponsorSearch";
import { notifyAffectedUsers, processDelayedNotifications } from "./notificationDispatcher";
import { generateHeadline, type RawDigestData } from "../services/aiDigest";

let isRunning = false;

interface CanonicalRecord {
  id: number;
  fingerprint: string;
  currentName: string;
  townCity: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
  firstSeen: string;
  lastSeen: string;
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

const RETRY_DELAY_MS = 30 * 60 * 1000;
const MAX_RETRIES = 3;
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
              <p style="color: #333; font-size: 15px; line-height: 1.6;">The daily sponsor licence register check failed after ${MAX_RETRIES} attempts.</p>
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

async function downloadWithRetry(): Promise<SponsorRecord[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[SponsorMonitorJob] CSV download attempt ${attempt}/${MAX_RETRIES}...`);
      const records = await downloadAndParseSponsorList();
      console.log(`[SponsorMonitorJob] CSV download succeeded on attempt ${attempt}: ${records.length} records parsed`);
      return records;
    } catch (err: any) {
      lastError = err;
      console.error(`[SponsorMonitorJob] CSV download attempt ${attempt} failed: ${err.message}`);

      if (attempt < MAX_RETRIES) {
        console.log(`[SponsorMonitorJob] Waiting 30 minutes before retry...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError || new Error("CSV download failed after all retries");
}

async function loadActiveCanonical(): Promise<Map<string, CanonicalRecord>> {
  const records = await db
    .select()
    .from(sponsorCanonical)
    .where(eq(sponsorCanonical.status, "ACTIVE"));

  const map = new Map<string, CanonicalRecord>();
  for (const r of records) {
    map.set(r.fingerprint, r as CanonicalRecord);
  }
  return map;
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

async function reconcile(
  canonicalMap: Map<string, CanonicalRecord>,
  todayMap: Map<string, TodayRecord>,
  today: string,
): Promise<SponsorChange[]> {
  const changes: SponsorChange[] = [];
  const matchedFingerprints = new Set<string>();
  const newRecordsToday: TodayRecord[] = [];

  // Phase 1: Process today's records against canonical
  for (const [fp, todayRec] of Array.from(todayMap.entries())) {
    const canonical = canonicalMap.get(fp);

    if (canonical) {
      matchedFingerprints.add(fp);

      await db
        .update(sponsorCanonical)
        .set({
          lastSeen: today,
          consecutiveMisses: 0,
          currentName: todayRec.organisationName,
          typeRating: todayRec.typeRating || null,
          route: todayRec.route || null,
        })
        .where(eq(sponsorCanonical.id, canonical.id));

      const prevRating = (canonical.typeRating ?? "").trim();
      const currRating = (todayRec.typeRating ?? "").trim();
      if (prevRating && currRating && prevRating !== currRating) {
        const ratingChange = classifyRatingChange(prevRating, currRating);
        if (ratingChange) {
          changes.push({
            organisationName: todayRec.organisationName,
            changeType: ratingChange,
            previousValue: prevRating,
            newValue: currRating,
          });
        }
      }

      if (canonical.currentName !== todayRec.organisationName) {
        const existingHistorical = canonical.historicalNames || [];
        if (!existingHistorical.includes(canonical.currentName)) {
          await db
            .update(sponsorCanonical)
            .set({
              historicalNames: sql`array_append(${sponsorCanonical.historicalNames}, ${canonical.currentName})`,
            })
            .where(eq(sponsorCanonical.id, canonical.id));
        }

        changes.push({
          organisationName: todayRec.organisationName,
          changeType: "NAME_CHANGE",
          previousValue: canonical.currentName,
          newValue: todayRec.organisationName,
        });
      }
    } else {
      newRecordsToday.push(todayRec);
    }
  }

  // Phase 1b: Insert genuinely new records
  for (const newRec of newRecordsToday) {
    try {
      await db.insert(sponsorCanonical).values({
        fingerprint: newRec.fingerprint,
        currentName: newRec.organisationName,
        townCity: newRec.townCity || null,
        typeRating: newRec.typeRating || null,
        route: newRec.route || null,
        status: "ACTIVE",
        firstSeen: today,
        lastSeen: today,
        consecutiveMisses: 0,
        historicalNames: [],
      }).onConflictDoNothing();

      changes.push({
        organisationName: newRec.organisationName,
        changeType: "NEW_LICENCE",
        previousValue: null,
        newValue: newRec.typeRating || null,
      });
    } catch (err: any) {
      console.error(`[Reconciliation] Error inserting new canonical "${newRec.organisationName}":`, err.message);
    }
  }

  // Phase 2: Process missing records (in canonical but not in today's CSV)
  const missingRecords: CanonicalRecord[] = [];
  for (const [fp, canonical] of Array.from(canonicalMap.entries())) {
    if (!matchedFingerprints.has(fp) && !todayMap.has(fp)) {
      missingRecords.push(canonical);
    }
  }

  if (missingRecords.length > 0) {
    const missingRatio = canonicalMap.size > 0 ? missingRecords.length / canonicalMap.size : 0;
    if (missingRatio > 0.1 && missingRecords.length > 100) {
      console.warn(
        `[Reconciliation] WARNING: ${missingRecords.length} of ${canonicalMap.size} (${(missingRatio * 100).toFixed(1)}%) canonical records missing from today's CSV. ` +
        `This may indicate a data format change. Processing normally but flagging for review.`
      );
    }

    console.log(`[Reconciliation] Processing ${missingRecords.length} missing record(s)...`);

    for (const missing of missingRecords) {
      const newMissCount = missing.consecutiveMisses + 1;

      if (newMissCount === 1) {
        // First absence, run rename check against new records
        let renamed = false;

        for (const newRec of newRecordsToday) {
          const sameCity = (newRec.townCity || "").toLowerCase().trim() === (missing.townCity || "").toLowerCase().trim();
          const sameRoute = (newRec.route || "").toLowerCase().trim() === (missing.route || "").toLowerCase().trim();

          if (sameCity && sameRoute) {
            const similarity = stringSimilarity.compareTwoStrings(
              missing.currentName.toLowerCase(),
              newRec.organisationName.toLowerCase(),
            );

            if (similarity >= RENAME_SIMILARITY_THRESHOLD) {
              console.log(
                `[Reconciliation] Rename detected: "${missing.currentName}" → "${newRec.organisationName}" (similarity: ${(similarity * 100).toFixed(1)}%)`
              );

              const existingHistorical = missing.historicalNames || [];
              const updatedHistorical = existingHistorical.includes(missing.currentName)
                ? existingHistorical
                : [...existingHistorical, missing.currentName];

              await db
                .update(sponsorCanonical)
                .set({
                  fingerprint: newRec.fingerprint,
                  currentName: newRec.organisationName,
                  lastSeen: today,
                  consecutiveMisses: 0,
                  historicalNames: updatedHistorical,
                  typeRating: newRec.typeRating || missing.typeRating,
                })
                .where(eq(sponsorCanonical.id, missing.id));

              try {
                await db
                  .delete(sponsorCanonical)
                  .where(
                    and(
                      eq(sponsorCanonical.fingerprint, newRec.fingerprint),
                      ne(sponsorCanonical.id, missing.id),
                    )
                  );
              } catch {}

              changes.push({
                organisationName: newRec.organisationName,
                changeType: "NAME_CHANGE",
                previousValue: missing.currentName,
                newValue: newRec.organisationName,
              });

              renamed = true;
              break;
            }
          }
        }

        if (!renamed) {
          await db
            .update(sponsorCanonical)
            .set({ consecutiveMisses: newMissCount })
            .where(eq(sponsorCanonical.id, missing.id));

          console.log(
            `[Reconciliation] First absence for "${missing.currentName}", waiting for confirmation.`
          );
        }
      } else if (newMissCount >= 2) {
        await db
          .update(sponsorCanonical)
          .set({
            consecutiveMisses: newMissCount,
            status: "NOT_LISTED",
          })
          .where(eq(sponsorCanonical.id, missing.id));

        changes.push({
          organisationName: missing.currentName,
          changeType: "REMOVED",
          previousValue: missing.typeRating,
          newValue: null,
        });

        console.log(
          `[Reconciliation] Confirmed removal: "${missing.currentName}" (missing ${newMissCount} consecutive days)`
        );
      } else {
        await db
          .update(sponsorCanonical)
          .set({ consecutiveMisses: newMissCount })
          .where(eq(sponsorCanonical.id, missing.id));
      }
    }
  }

  // Summary
  const counts: Record<string, number> = {};
  for (const c of changes) counts[c.changeType] = (counts[c.changeType] || 0) + 1;

  console.log(
    `[Reconciliation] Complete. Canonical: ${canonicalMap.size}, Today: ${todayMap.size}, ` +
    `New: ${newRecordsToday.length}, Missing: ${missingRecords.length}, ` +
    `Changes: ${changes.length} total` +
    (Object.keys(counts).length > 0
      ? ` (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")})`
      : "")
  );

  return changes;
}

export async function runSponsorMonitorJob(source: string = "cron"): Promise<{
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

  if (isRunning) {
    const msg = "Job is already running. Skipping this execution.";
    console.warn(`[SponsorMonitorJob] ${msg}`);
    return { ...result, error: msg };
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log(`[SponsorMonitorJob] === Daily sponsor monitor check starting (triggered by: ${source}) ===`);

    let currentRecords: SponsorRecord[];
    try {
      currentRecords = await downloadWithRetry();
    } catch (err: any) {
      const errorMsg = `CSV download failed after ${MAX_RETRIES} attempts: ${err.message}`;
      console.error(`[SponsorMonitorJob] ${errorMsg}`);
      await sendAdminFailureAlert(errorMsg);
      return { ...result, error: errorMsg };
    }

    result.recordsProcessed = currentRecords.length;

    if (currentRecords.length === 0) {
      const errorMsg = "CSV download returned 0 records. Aborting to prevent false mass-removal detection.";
      console.error(`[SponsorMonitorJob] ${errorMsg}`);
      await sendAdminFailureAlert(errorMsg);
      return { ...result, error: errorMsg };
    }

    const today = new Date().toISOString().split("T")[0];

    console.log(`[SponsorMonitorJob] Storing snapshot for ${today} (${currentRecords.length} records)...`);
    await storeSnapshot(currentRecords, today);

    const canonicalMap = await loadActiveCanonical();

    if (canonicalMap.size === 0) {
      console.log(`[SponsorMonitorJob] No canonical records found. This appears to be the first run.`);
      console.log(`[SponsorMonitorJob] Run the migration endpoint (POST /api/admin/migrate-canonical) to populate canonical data from the latest snapshot.`);
      await rebuildSponsorIndex();
      result.success = true;
      return result;
    }

    const todayMap = buildTodayRecords(currentRecords);

    const detectedChanges = await reconcile(canonicalMap, todayMap, today);

    await rebuildSponsorIndex();

    const changeCounts: Record<string, number> = {};
    for (const change of detectedChanges) {
      changeCounts[change.changeType] = (changeCounts[change.changeType] || 0) + 1;
    }
    result.changes = changeCounts;

    const alertableChanges = detectedChanges.filter(
      (c) => c.changeType !== "NAME_CHANGE"
    );

    if (alertableChanges.length > 0) {
      console.log(`[SponsorMonitorJob] Saving ${detectedChanges.length} changes (${alertableChanges.length} alertable) and dispatching notifications...`);

      for (const change of detectedChanges) {
        try {
          const [savedChange] = await db
            .insert(sponsorChanges)
            .values({
              organisationName: change.organisationName,
              changeType: change.changeType,
              previousValue: change.previousValue,
              newValue: change.newValue,
              snapshotDate: today,
            })
            .returning();

          if (change.changeType !== "NAME_CHANGE") {
            const notifResult = await notifyAffectedUsers(savedChange);
            result.notificationsSent += notifResult.sent;
            result.notificationsSkipped += notifResult.skipped;
            result.notificationsFailed += notifResult.failed;
          }
        } catch (err: any) {
          console.error(`[SponsorMonitorJob] Error processing change for "${change.organisationName}":`, err.message);
        }
      }
    } else if (detectedChanges.length > 0) {
      console.log(`[SponsorMonitorJob] ${detectedChanges.length} changes detected (all non-alertable, e.g. name corrections).`);
      for (const change of detectedChanges) {
        try {
          await db
            .insert(sponsorChanges)
            .values({
              organisationName: change.organisationName,
              changeType: change.changeType,
              previousValue: change.previousValue,
              newValue: change.newValue,
              snapshotDate: today,
            });
        } catch (err: any) {
          console.error(`[SponsorMonitorJob] Error saving non-alertable change for "${change.organisationName}":`, err.message);
        }
      }
    } else {
      console.log("[SponsorMonitorJob] No changes detected today.");
    }

    try {
      const addedCount = changeCounts["ADDED"] || changeCounts["NEW_LICENCE"] || 0;
      const updatedCount = (changeCounts["UPGRADED"] || 0) + (changeCounts["DOWNGRADED"] || 0) + (changeCounts["ROUTE_CHANGE"] || 0) + (changeCounts["NAME_CHANGE"] || 0);
      const removedCount = changeCounts["REMOVED"] || 0;

      const removedCompanies = detectedChanges
        .filter((c) => c.changeType === "REMOVED")
        .slice(0, 10)
        .map((c) => c.organisationName);
      const addedCompanies = detectedChanges
        .filter((c) => c.changeType === "ADDED" || c.changeType === "NEW_LICENCE")
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

    console.log(`[SponsorMonitorJob] Cleaning up snapshots older than 90 days...`);
    await cleanupOldSnapshots(90);

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

    return result;
  } catch (err: any) {
    const errorMsg = `Unexpected error: ${err.message}`;
    console.error(`[SponsorMonitorJob] ${errorMsg}`, err);
    await sendAdminFailureAlert(errorMsg);
    return { ...result, error: errorMsg };
  } finally {
    isRunning = false;
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

export function startSponsorMonitorCron(): void {
  cron.schedule("30 0 * * *", () => {
    console.log("[SponsorMonitorJob] Cron trigger fired at", new Date().toISOString());
    runSponsorMonitorJob("cron").catch((err) => {
      console.error("[SponsorMonitorJob] Unhandled error in cron execution:", err);
    });
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

  console.log("[SponsorMonitorJob] Cron jobs scheduled: daily monitor at 00:30 UTC, delayed notifications hourly");
}

export function isJobRunning(): boolean {
  return isRunning;
}
