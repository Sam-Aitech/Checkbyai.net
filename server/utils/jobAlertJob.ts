import * as cron from "node-cron";
import { getAppUrl } from "./appUrl";
import { db } from "../db";
import {
  companyWatches,
  jobAlertPreferences,
  jobListings,
  sponsorCanonical,
  users,
} from "@shared/schema";
import { eq, and, inArray, gte } from "drizzle-orm";
import { resolveTier } from "./tierConfig";
import { getOrFetchEnrichment } from "./companyEnricher";
import { scrapeJobsForCompany, type ScrapedJob } from "./jobScraper";
import { sql } from "drizzle-orm";

const ADVISORY_LOCK_KEY = 7483921; // Distinct from sponsor monitor (7483920)
const PRO_BOARDS = ["company", "linkedin", "indeed", "cvlibrary", "google"];
const FROM_ADDRESS = "Sponsor Monitor <alerts@checkbyai.net>";

// ─── Advisory lock ────────────────────────────────────────────────────────────

async function tryAcquireJobLock(): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS acquired`,
  );
  return (result.rows[0] as { acquired: boolean }).acquired;
}

async function releaseJobLock(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
}

// ─── Email builder ────────────────────────────────────────────────────────────

function buildJobDigestEmail(
  companyName: string,
  jobs: { title: string; location: string; source_board: string; source_url: string }[],
  date: string,
): { subject: string; html: string } {
  const subject = `📋 ${jobs.length} new job${jobs.length > 1 ? "s" : ""} at ${companyName} — ${date}`;

  const boardLabel: Record<string, string> = {
    indeed: "Indeed",
    linkedin: "LinkedIn",
    cvlibrary: "CV-Library",
    google: "Google Jobs",
    company: "Company Website",
  };

  const jobRows = jobs
    .map(
      (j) => `
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid #f0f0f0;">
          <div style="font-weight:600; color:#1a1a2e; font-size:14px;">${j.title}</div>
          <div style="color:#666; font-size:13px; margin-top:2px;">
            ${j.location ? `📍 ${j.location} · ` : ""}
            <a href="${j.source_url}" style="color:#6366f1; text-decoration:none;">${boardLabel[j.source_board] || j.source_board}</a>
          </div>
        </td>
      </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
      <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%); padding:28px 30px; border-radius:10px 10px 0 0;">
        <h1 style="color:#fff; margin:0; font-size:20px; font-weight:700;">📋 Job Alert</h1>
        <p style="color:rgba(255,255,255,0.85); margin:6px 0 0; font-size:14px;">${companyName}</p>
      </div>
      <div style="background:#fff; padding:24px 30px; border:1px solid #e5e7eb; border-top:none;">
        <p style="color:#374151; font-size:14px; margin:0 0 16px;">
          <strong>${jobs.length} new role${jobs.length > 1 ? "s" : ""}</strong> found today (${date}):
        </p>
        <table style="width:100%; border-collapse:collapse;">
          ${jobRows}
        </table>
      </div>
      <div style="background:#f9fafb; padding:16px 30px; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 10px 10px;">
        <p style="color:#9ca3af; font-size:11px; margin:0; text-align:center;">
          You are receiving job alerts for <strong>${companyName}</strong> on Check By AI Sponsor Monitor.<br/>
          <a href="${getAppUrl()}/sponsor-monitor" style="color:#6366f1;">Manage job alerts →</a>
        </p>
      </div>
    </div>
  `;

  return { subject, html };
}

// ─── Email send ───────────────────────────────────────────────────────────────

async function sendJobDigestEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
    });
  } catch (err) {
    console.error("[JobAlertJob] Email send failed:", err);
  }
}

// ─── Core job ─────────────────────────────────────────────────────────────────

export async function runJobAlertJob(): Promise<void> {
  const lockAcquired = await tryAcquireJobLock();
  if (!lockAcquired) {
    console.log("[JobAlertJob] Another instance is running. Skipping.");
    return;
  }

  try {
    console.log("[JobAlertJob] Starting nightly job alert scan...");
    const today = new Date().toISOString().split("T")[0];

    // 1. Find all distinct fingerprints where any Pro user has job alerts enabled
    const prefs = await db
      .select({
        userId: jobAlertPreferences.userId,
        fingerprint: jobAlertPreferences.fingerprint,
      })
      .from(jobAlertPreferences)
      .where(eq(jobAlertPreferences.enabled, true));

    if (prefs.length === 0) {
      console.log("[JobAlertJob] No active job alert preferences found.");
      return;
    }

    // 2. Batch-fetch users to verify they are Pro plan
    const userIds = Array.from(new Set(prefs.map((p) => p.userId)));
    const userRecords = await db
      .select({ id: users.id, email: users.email, subscriptionStatus: users.subscriptionStatus })
      .from(users)
      .where(inArray(users.id, userIds));

    const userMap = new Map(userRecords.map((u) => [u.id, u]));

    // Filter: only Pro users
    const eligiblePrefs = prefs.filter((p) => {
      const user = userMap.get(p.userId);
      if (!user) return false;
      const tier = resolveTier(user.subscriptionStatus);
      return tier === "pro";
    });

    if (eligiblePrefs.length === 0) {
      console.log("[JobAlertJob] No Pro users with job alerts enabled.");
      return;
    }

    // 3. Get distinct fingerprints and their company data from sponsorCanonical
    const fingerprints = Array.from(new Set(eligiblePrefs.map((p) => p.fingerprint)));
    const canonicals = await db
      .select({
        fingerprint: sponsorCanonical.fingerprint,
        currentName: sponsorCanonical.currentName,
        townCity: sponsorCanonical.townCity,
      })
      .from(sponsorCanonical)
      .where(inArray(sponsorCanonical.fingerprint, fingerprints));

    const canonicalMap = new Map(canonicals.map((c) => [c.fingerprint, c]));

    // 4. Get existing job hashes to skip already-seen jobs
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days lookback
    const existingJobs = await db
      .select({ contentHash: jobListings.contentHash, fingerprint: jobListings.fingerprint })
      .from(jobListings)
      .where(
        and(
          inArray(jobListings.fingerprint, fingerprints),
          gte(jobListings.firstSeen, since),
        ),
      );

    const existingHashes = new Set(existingJobs.map((j) => j.contentHash));

    // 5. Scrape each unique company (one scrape per fingerprint, shared across users)
    const newJobsByFingerprint = new Map<string, ScrapedJob[]>();

    for (const fp of fingerprints) {
      const canonical = canonicalMap.get(fp);
      if (!canonical) continue;

      const enrichment = await getOrFetchEnrichment(fp, canonical.currentName);
      const result = await scrapeJobsForCompany(
        fp,
        canonical.currentName,
        canonical.townCity || "United Kingdom",
        enrichment,
        PRO_BOARDS,
      );

      // Filter to only genuinely new jobs
      const newJobs = result.jobs.filter((j) => !existingHashes.has(j.content_hash));

      if (newJobs.length === 0) {
        console.log(`[JobAlertJob] No new jobs for "${canonical.currentName}".`);
        continue;
      }

      // Persist new jobs to job_listings
      try {
        await db.insert(jobListings).values(
          newJobs.map((j) => ({
            fingerprint: fp,
            title: j.title,
            location: j.location || null,
            salary: j.salary || null,
            sourceBoard: j.source_board,
            sourceUrl: j.source_url,
            contentHash: j.content_hash,
            firstSeen: new Date(),
            lastSeen: new Date(),
            isActive: true,
          })),
        ).onConflictDoNothing();
      } catch (err) {
        console.error(`[JobAlertJob] DB insert failed for "${canonical.currentName}":`, err);
      }

      newJobsByFingerprint.set(fp, newJobs as any);
      console.log(`[JobAlertJob] "${canonical.currentName}" → ${newJobs.length} new jobs.`);
    }

    // 6. Send one digest email per user (group all their watched companies)
    const prefsPerUser = new Map<string, string[]>();
    for (const pref of eligiblePrefs) {
      if (!prefsPerUser.has(pref.userId)) prefsPerUser.set(pref.userId, []);
      prefsPerUser.get(pref.userId)!.push(pref.fingerprint);
    }

    let emailsSent = 0;
    for (const [userId, userFingerprints] of Array.from(prefsPerUser.entries())) {
      const user = userMap.get(userId);
      if (!user?.email) continue;

      for (const fp of userFingerprints) {
        const newJobs = newJobsByFingerprint.get(fp);
        if (!newJobs || newJobs.length === 0) continue;

        const canonical = canonicalMap.get(fp);
        if (!canonical) continue;

        const { subject, html } = buildJobDigestEmail(canonical.currentName, newJobs, today);
        await sendJobDigestEmail(user.email, subject, html);
        emailsSent++;
      }
    }

    console.log(`[JobAlertJob] Complete. Emails sent: ${emailsSent}`);
  } catch (err) {
    console.error("[JobAlertJob] Fatal error:", err);
  } finally {
    await releaseJobLock();
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export function startJobAlertScheduler(): void {
  // Runs at 02:00 UTC Mon-Fri (after the main sponsor monitor job at 00:30)
  cron.schedule(
    "0 2 * * 1-5",
    async () => {
      console.log("[JobAlertJob] Cron triggered.");
      await runJobAlertJob().catch((err) =>
        console.error("[JobAlertJob] Unhandled cron error:", err),
      );
    },
    { timezone: "UTC" },
  );

  console.log("[JobAlertJob] Scheduled: 02:00 UTC Mon-Fri");
}
