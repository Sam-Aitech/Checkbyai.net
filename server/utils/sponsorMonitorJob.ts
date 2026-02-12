import cron from "node-cron";
import { db } from "../db";
import { sponsorChanges } from "@shared/schema";
import {
  downloadAndParseSponsorList,
  storeSnapshot,
  getPreviousSnapshot,
  detectChanges,
  cleanupOldSnapshots,
  normalizeName,
  type SponsorRecord,
} from "./sponsorListFetcher";
import { rebuildSponsorIndex } from "./sponsorSearch";
import { notifyAffectedUsers } from "./notificationDispatcher";

let isRunning = false;

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

    const previousSnapshot = await getPreviousSnapshot();

    const today = new Date().toISOString().split("T")[0];

    if (previousSnapshot.size === 0) {
      console.log(`[SponsorMonitorJob] No previous snapshot found. Storing initial snapshot (${currentRecords.length} records) for ${today}.`);
      await storeSnapshot(currentRecords, today);
      await rebuildSponsorIndex();
      console.log(`[SponsorMonitorJob] Initial snapshot stored. No changes to detect on first run.`);
      result.success = true;
      return result;
    }

    const currentMap = new Map<string, { organisationName: string; organisationNameNormalized: string; typeRating: string | null; route: string | null }>();
    for (const record of currentRecords) {
      const normalized = normalizeName(record.organisationName);
      currentMap.set(normalized, {
        organisationName: record.organisationName,
        organisationNameNormalized: normalized,
        typeRating: record.typeRating || null,
        route: record.route || null,
      });
    }

    const detectedChanges = detectChanges(previousSnapshot, currentMap);

    console.log(`[SponsorMonitorJob] Storing new snapshot for ${today} (${currentRecords.length} records)...`);
    await storeSnapshot(currentRecords, today);
    await rebuildSponsorIndex();

    const changeCounts: Record<string, number> = {};
    for (const change of detectedChanges) {
      changeCounts[change.changeType] = (changeCounts[change.changeType] || 0) + 1;
    }
    result.changes = changeCounts;

    if (detectedChanges.length > 0) {
      console.log(`[SponsorMonitorJob] Saving ${detectedChanges.length} changes to database and dispatching notifications...`);

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

          const notifResult = await notifyAffectedUsers(savedChange);
          result.notificationsSent += notifResult.sent;
          result.notificationsSkipped += notifResult.skipped;
          result.notificationsFailed += notifResult.failed;
        } catch (err: any) {
          console.error(`[SponsorMonitorJob] Error processing change for "${change.organisationName}":`, err.message);
        }
      }
    } else {
      console.log("[SponsorMonitorJob] No changes detected today.");
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

  console.log("[SponsorMonitorJob] Cron job scheduled: daily at 00:30 UTC");
}

export function isJobRunning(): boolean {
  return isRunning;
}
