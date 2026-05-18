import type { Express } from "express";
import type { SponsorChange } from "../utils/sponsorListFetcher";
import * as crypto from "crypto";
import * as fs from "fs";
import { db } from "../db";
import { sql, eq, and, desc, gte, asc, inArray } from "drizzle-orm";
import {
  insertFeedbackSchema,
  sponsorCanonical,
  sponsorChanges,
  companyWatches,
  notificationLog,
  notifLog,
  monitorJobRuns,
  csvArchive,
  users,
  sessions,
  DEFAULT_NOTIF_PREFS,
  type NotifPrefs,
} from "@shared/schema";
import { z } from "zod";
import { isAdmin, isAuthenticated } from "../auth";
import { storage } from "../storage";
import { PDFAnalyzer } from "../services/pdfAnalyzer";
import { upload } from "./verification";
import { sendEmailReliably } from "../utils/resilientEmail";
import { getAppUrl } from "../utils/appUrl";
import { checkBinaryHealth } from "../utils/binaryRunner";
import { sanitizeUploadPath } from "../utils/uploadGuard";
import { isJobRunning, getLastRunInfo, runSponsorMonitorJob } from "../utils/sponsorMonitorJob";
import { rebuildSponsorIndex } from "../utils/sponsorSearch";
import { isQueueAvailable, getSponsorRefreshQueue } from "../services/jobQueue";
import { getWatchLimit } from "../utils/tierConfig";
import { sanitizeUploadPath } from "../utils/uploadGuard";

function sanitizeForPrompt(text: string): string {
  return text.replace(/[<>`{}]/g, '');
}

const SPONSOR_JOB_LOCK_KEY = 7483920; // Same key as sponsorMonitorJob — init and nightly are mutually exclusive

// ── Sponsor Monitor Initialize Job State ─────────────────────────────────────

type InitStage =
  | "pending"
  | "downloading"
  | "inserting"
  | "rebuilding_index"
  | "done"
  | "failed";

interface InitJobState {
  jobId: string;
  stage: InitStage;
  rowsInserted: number;
  batchesComplete: number;
  estimatedTotalBatches: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  snapshotDate: string | null;
}

const activeInitJobs = new Map<string, InitJobState>();

function scheduleInitJobCleanup(jobId: string): void {
  setTimeout(() => activeInitJobs.delete(jobId), 30 * 60 * 1000);
}

async function runInitJob(jobId: string, today: string): Promise<void> {
  const state = activeInitJobs.get(jobId);
  if (!state) return;

  try {
    state.stage = "downloading";
    console.log(`[SponsorMonitor][${jobId}] Triggering monitor job for ${today}`);

    await runSponsorMonitorJob("manual");

    state.stage = "done";
    state.completedAt = Date.now();
    console.log(`[SponsorMonitor][${jobId}] Monitor job complete for ${today}`);

  } catch (err: unknown) {
    state.stage = "failed";
    state.error = (err instanceof Error ? err.message : String(err)) || "Unknown error during initialization";
    state.completedAt = Date.now();
    console.error(`[SponsorMonitor][${jobId}] Initialization failed:`, err);
  } finally {
    scheduleInitJobCleanup(jobId);
  }
}

export function registerAdminRoutes(app: Express): void {
  app.get('/api/admin/trusted-patterns', isAdmin, async (req, res) => {
    try {
      const patterns = await storage.getTrustedPatterns();
      res.json(patterns);
    } catch (error) {
      console.error("Error fetching trusted patterns:", error);
      res.status(500).json({ message: "Failed to fetch trusted patterns" });
    }
  });

  app.post('/api/admin/trusted-patterns', isAdmin, upload.single('file'), async (req, res) => {
    let safeFilePath;
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
        // Path-traversal guard: assert req.file.path is inside uploads/
              const safeFilePath = sanitizeUploadPath((req as any).file.path);
      
      const pdfAnalyzer = new PDFAnalyzer();
      const metadata = await pdfAnalyzer.extractMetadata(safeFilePath);
      const patterns = { metadata, documentType: 'trusted_cos' };

      const aiInstructions = req.body?.aiInstructions || null;

      const patternId = await storage.createTrustedPattern(
        req.file.originalname,
        metadata,
        patterns,
        aiInstructions
      );

      res.json({ id: patternId, message: 'Trusted pattern created successfully', aiInstructions: !!aiInstructions });
    } catch (error) {
      console.error("Error creating trusted pattern:", error);
      res.status(500).json({ message: "Failed to create trusted pattern" });
    } finally {
      if (safeFilePath) {
        try {
          fs.unlink(safeFilePath, () => {});
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  });

  app.delete('/api/admin/trusted-patterns/:id', isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTrustedPattern(id);
      res.json({ message: 'Trusted pattern deleted successfully' });
    } catch (error) {
      console.error("Error deleting trusted pattern:", error);
      res.status(500).json({ message: "Failed to delete trusted pattern" });
    }
  });

  app.post('/api/admin/extract-metadata', isAdmin, upload.single('file'), async (req: any, res) => {
    let safeFilePath;
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // SEC-001: safeFilePath was missing here — caused ReferenceError + path-traversal bypass
      const safeFilePath = sanitizeUploadPath((req as any).file.path);
      const pdfAnalyzer = new PDFAnalyzer();
      const metadata = await pdfAnalyzer.extractMetadata(safeFilePath);

      res.json({
        metadata: {
          producer: metadata.producer,
          creator: metadata.creator,
          created: metadata.creationDate,
          modified: metadata.modificationDate,
          fontCount: metadata.fontCount,
          fonts: metadata.fonts,
          pdfVersion: metadata.pdfVersion,
          isEncrypted: metadata.isEncrypted,
          hasDigitalSignature: metadata.hasDigitalSignature,
        },
        forensic: metadata.forensic,
      });
    } catch (error) {
      console.error("Error extracting metadata:", error);
      res.status(500).json({ message: "Failed to extract metadata" });
    } finally {
      if (safeFilePath) {
        try {
          await fs.promises.unlink(safeFilePath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  });

  app.get('/api/admin/recent-activity', isAdmin, async (req, res) => {
    try {
      const activity = await storage.getRecentActivity(20);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  app.get('/api/admin/verification-logs', isAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const status = req.query.status as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const search = req.query.search as string | undefined;
      const period = req.query.period as string | undefined;

      const result = await storage.getPaginatedVerificationLogs({
        page,
        limit,
        status,
        startDate,
        endDate,
        search,
        period,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching verification logs:", error);
      res.status(500).json({ message: "Failed to fetch verification logs" });
    }
  });

  app.post('/api/admin/analyze-reasoning/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const verification = await storage.getVerificationById(id);

      if (!verification) {
        return res.status(404).json({ message: "Verification not found" });
      }

      const globalRules = await storage.getActiveGlobalAiRules();
      const trustedPatterns = await storage.getTrustedPatterns();
      const hitlKnowledge = await storage.getAdminFakeKnowledge(15);

      let knowledgeContext = '';

      if (globalRules.length > 0) {
        knowledgeContext += '\n<admin_global_rules>\n';
        globalRules.forEach((rule, idx) => {
          knowledgeContext += `Rule #${idx + 1} [${rule.category}] (Priority: ${rule.priority}): ${rule.ruleText}\n`;
        });
        knowledgeContext += '</admin_global_rules>\n';
      }

      if (hitlKnowledge.length > 0) {
        knowledgeContext += '\n<human_expert_corrections>\n';
        knowledgeContext += 'CRITICAL: The following documents were marked as FAKE by human experts after the AI called them genuine or suspicious.\n';
        knowledgeContext += 'Learn from these corrections and DO NOT repeat the same mistakes.\n\n';
        hitlKnowledge.forEach((entry, idx) => {
          const metadata = entry.metadata as any;
          knowledgeContext += `[Case ${idx + 1}]\n`;
          knowledgeContext += `  File: ${entry.filename}\n`;
          knowledgeContext += `  Producer: ${metadata?.producer || 'Unknown'}\n`;
          knowledgeContext += `  AI said: ${entry.result} (${entry.confidence}% confidence)\n`;
          knowledgeContext += `  Human verdict: FAKE\n`;
          knowledgeContext += `  Expert reasoning: ${sanitizeForPrompt(entry.adminFeedback || 'No details')}\n\n`;
        });
        knowledgeContext += '</human_expert_corrections>\n';
      }

      const docProducer = (verification.metadata as any)?.producer || '';
      const matchingPatterns = trustedPatterns.filter(p => {
        const patternProducer = (p.metadata as any)?.producer || '';
        return patternProducer && docProducer.toLowerCase().includes(patternProducer.toLowerCase().split(' ')[0]);
      });

      if (matchingPatterns.length > 0) {
        knowledgeContext += '\n<pattern_specific_instructions>\n';
        matchingPatterns.forEach(p => {
          if (p.aiInstructions) {
            knowledgeContext += `Pattern "${p.filename}": ${p.aiInstructions}\n`;
          }
        });
        knowledgeContext += '</pattern_specific_instructions>\n';
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const { createChatCompletionWithFallback, getAvailableProviders, hasAnyProvider } = await import('../services/aiService');

      if (!hasAnyProvider()) {
        return res.status(503).json({ message: 'No AI providers are currently available. Please configure at least one AI integration.' });
      }

      const systemPrompt = `You are a forensic document analyst specializing in UK Certificate of Sponsorship (COS) documents.
Analyze documents based on metadata AND the specific forensic knowledge base provided below.

${knowledgeContext ? `<knowledge_base>\n${knowledgeContext}\n</knowledge_base>` : ''}

CRITICAL INSTRUCTIONS:
1. Your previous outputs have been OVERCONFIDENT. You must now PRIORITIZE 'Forensic Metadata' over visual appearance.
2. When making your analysis, you MUST explicitly state if you are following any specific Admin Rules or Human Expert Corrections from the knowledge base.
3. If human experts have previously flagged similar patterns as FAKE, lower your confidence and flag the document accordingly.
4. For example: "Per Admin Rule #3 regarding Sunday modifications, this document is flagged as suspicious."
5. Or: "Per Human Expert Correction Case #2, this producer pattern was previously identified as fake."
6. Be conservative - it is better to flag a genuine document as suspicious than to miss a fake.`;

      const prompt = `Analyze the following verification result and provide expert insights.

Verification Result:
- Status: ${verification.result}
- Confidence: ${verification.confidence}%
- Filename: ${verification.filename}

Metadata:
${JSON.stringify(verification.metadata, null, 2)}

Analysis Details:
${JSON.stringify(verification.analysisDetails, null, 2)}

Provide a detailed forensic analysis covering:
1. **Summary**: Brief overview of the document's authenticity assessment
2. **Key Findings**: Most significant indicators that influenced the verdict
3. **Admin Rules Applied**: List any admin rules from the knowledge base that influenced this analysis
4. **Red Flags**: Any suspicious patterns or anomalies detected
5. **Legitimate Indicators**: Evidence supporting authenticity
6. **Recommendations**: Next steps for the admin or user
7. **Confidence Assessment**: Explain why the confidence level is ${verification.confidence}%

Format your response in clear, professional markdown.`;

      const { stream, provider } = await createChatCompletionWithFallback([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ], { maxTokens: 2000 });

      res.write(`data: ${JSON.stringify({ provider, availableProviders: getAvailableProviders() })}\n\n`);

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in AI analysis:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to analyze verification" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Analysis failed" })}\n\n`);
        res.end();
      }
    }
  });

  app.get('/api/admin/system-health', isAdmin, async (req, res) => {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();

      let dbStatus = 'healthy';
      let dbConnectionCount = 0;
      try {
        const result = await db.execute(sql`SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()`);
        dbConnectionCount = Number((result.rows[0] as any)?.count || 0);
      } catch (e) {
        dbStatus = 'error';
      }

      const stats = await storage.getStats();

      res.json({
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
        uptime: Math.round(uptime),
        database: {
          status: dbStatus,
          connections: dbConnectionCount,
        },
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching system health:", error);
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  app.post('/api/admin/sponsor-monitor/run', isAdmin, async (req: any, res) => {
    try {
      if (await isJobRunning()) {
        return res.status(409).json({ message: "Sponsor monitor job is already running. Please wait for it to finish." });
      }

      const queue = getSponsorRefreshQueue();

      if (isQueueAvailable() && queue) {
        const job = await queue.add('refresh-sponsors', {
          triggeredBy: req.user?.id || 'unknown',
          timestamp: new Date().toISOString()
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 10,
        });

        return res.status(202).json({
          message: "Sponsor monitor job started via queue.",
          jobId: job.id,
          status: "accepted",
          mode: "bullmq",
        });
      }

      console.warn("[SponsorMonitor] Redis unavailable — running sponsor sync inline.");
      runSponsorMonitorJob("admin-manual", true).catch((err) =>
        console.error("[SponsorMonitor] Inline run error:", err)
      );

      return res.status(202).json({
        message: "Sponsor monitor job started inline (Redis unavailable).",
        status: "accepted",
        mode: "inline",
      });

    } catch (error) {
      console.error("Error triggering sponsor monitor job:", error);
      res.status(500).json({ message: "Failed to trigger sponsor monitor job." });
    }
  });

  app.get('/api/admin/jobs/:jobId/progress', isAdmin, async (req: any, res) => {
    try {
      const { jobId } = req.params;
      const queue = getSponsorRefreshQueue();

      if (!isQueueAvailable() || !queue) {
        return res.status(503).json({ message: "Job queue unavailable (Redis not configured)." });
      }

      const job = await queue.getJob(jobId);

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      const progress = job.progress;
      const state = await job.getState();

      res.json({ jobId: job.id, progress, status: state, data: job.data });
    } catch (error) {
      console.error("Error getting job progress:", error);
      res.status(500).json({ message: "Failed to get job progress." });
    }
  });

  app.post('/api/admin/sponsor-monitor/release-lock', isAdmin, async (req: any, res) => {
    try {
      const unlockResult = await db.execute(
        sql`SELECT pg_advisory_unlock(${SPONSOR_JOB_LOCK_KEY}) AS released`
      );
      const released = (unlockResult.rows[0] as any)?.released === true;

      await db.execute(sql`SELECT pg_advisory_unlock_all()`);

      const message = released
        ? "Advisory lock was held and has been released. You can now trigger a new run."
        : "No lock was held by this connection (may have been on a different pooled connection). All locks on this connection cleared.";

      console.warn(`[SponsorMonitorJob] Admin force-release: ${message}`);
      res.json({ released, message });
    } catch (error: unknown) {
      console.error("Error releasing advisory lock:", error);
      res.status(500).json({ message: "Failed to release lock: " + (error instanceof Error ? error.message : "") });
    }
  });

  app.get('/api/admin/sponsor-monitor/binary-health', isAdmin, async (_req, res) => {
    try {
      const health = await checkBinaryHealth();
      const allInstalled = health.qsv.installed && health.csvdiff.installed;
      res.status(allInstalled ? 200 : 206).json({
        allInstalled,
        qsv: health.qsv,
        csvdiff: health.csvdiff,
        setupCommand: "npm run setup:binaries",
      });
    } catch (error: unknown) {
      res.status(500).json({ message: "Binary health check failed: " + (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.post('/api/admin/sponsor-monitor/initialize', isAdmin, async (req: any, res) => {
    try {
      for (const [, job] of activeInitJobs) {
        if (job.stage !== "done" && job.stage !== "failed") {
          return res.status(409).json({
            message: "An initialization job is already running.",
            jobId: job.jobId,
          });
        }
      }

      try {
        const lockHolder = await db.execute(sql`
          SELECT pl.pid, pa.state,
                 EXTRACT(EPOCH FROM (now() - pa.state_change))::int AS idle_seconds
          FROM   pg_locks pl
          LEFT JOIN pg_stat_activity pa ON pa.pid = pl.pid
          WHERE  pl.locktype  = 'advisory'
            AND  pl.classid   = (${SPONSOR_JOB_LOCK_KEY}::bigint >> 32)::int
            AND  pl.objid     = (${SPONSOR_JOB_LOCK_KEY}::bigint & x'ffffffff'::bigint)::int
            AND  pl.granted   = true
        `);
        const holder = lockHolder.rows[0] as any;
        const ZOMBIE_IDLE_THRESHOLD_SECONDS = 600;
        if (
          holder &&
          (holder.state === 'idle' || holder.state === 'idle in transaction') &&
          holder.idle_seconds > ZOMBIE_IDLE_THRESHOLD_SECONDS
        ) {
          console.warn(
            `[SponsorMonitor] Advisory lock held by idle backend PID ${holder.pid} ` +
            `(idle ${holder.idle_seconds}s > ${ZOMBIE_IDLE_THRESHOLD_SECONDS}s threshold) — terminating zombie to release lock.`
          );
          await db.execute(sql`SELECT pg_terminate_backend(${holder.pid})`);
        } else if (holder && (holder.state === 'idle' || holder.state === 'idle in transaction')) {
          console.log(
            `[SponsorMonitor] Advisory lock held by idle backend PID ${holder.pid} ` +
            `(idle ${holder.idle_seconds}s) — within active-job window, not terminating.`
          );
        }
      } catch (lockCheckErr: any) {
        console.warn('[SponsorMonitor] Pre-flight zombie-lock check failed (non-fatal):', lockCheckErr.message);
      }

      const jobId = crypto.randomUUID();
      const today = new Date().toISOString().split("T")[0];

      const state: InitJobState = {
        jobId,
        stage: "pending",
        rowsInserted: 0,
        batchesComplete: 0,
        estimatedTotalBatches: 25,
        startedAt: Date.now(),
        completedAt: null,
        error: null,
        snapshotDate: today,
      };
      activeInitJobs.set(jobId, state);

      runInitJob(jobId, today).catch((err) => {
        console.error(`[SponsorMonitor] runInitJob uncaught error for ${jobId}:`, err);
      });

      return res.status(202).json({
        message: "Initialization started. Poll /api/admin/sponsor-monitor/init-progress/:jobId for status.",
        jobId,
        snapshotDate: today,
      });

    } catch (error: unknown) {
      console.error("[SponsorMonitor] Failed to start initialization:", error);
      return res.status(500).json({ message: "Failed to start initialization: " + (error instanceof Error ? error.message : "") });
    }
  });

  app.get('/api/admin/sponsor-monitor/init-progress/:jobId', isAdmin, (req: any, res) => {
    const { jobId } = req.params;
    const state = activeInitJobs.get(jobId);

    if (!state) {
      return res.status(404).json({ message: "Job not found or already expired (>30 min)." });
    }

    const elapsedMs = Date.now() - state.startedAt;

    let progressPct: number;
    if (state.stage === "done") {
      progressPct = 100;
    } else if (state.stage === "rebuilding_index") {
      progressPct = 95;
    } else if (state.stage === "failed") {
      progressPct = 0;
    } else {
      const raw = state.estimatedTotalBatches > 0
        ? Math.round((state.batchesComplete / state.estimatedTotalBatches) * 90)
        : 0;
      progressPct = Math.min(raw, 90);
    }

    return res.json({
      jobId: state.jobId,
      stage: state.stage,
      rowsInserted: state.rowsInserted,
      batchesComplete: state.batchesComplete,
      estimatedTotalBatches: state.estimatedTotalBatches,
      progressPct,
      elapsedMs,
      error: state.error,
      snapshotDate: state.snapshotDate,
      done: state.stage === "done" || state.stage === "failed",
    });
  });

  app.get('/api/admin/sponsor-monitor/status', isAdmin, async (req: any, res) => {
    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sponsorCanonical);
      const snapshotRecordCount = countResult[0]?.count ?? 0;

      const archiveResult = await db
        .select({ snapshotDate: csvArchive.snapshotDate })
        .from(csvArchive)
        .orderBy(desc(csvArchive.snapshotDate))
        .limit(1);
      const latestDate = archiveResult[0]?.snapshotDate ?? null;

      const lastRunChanges = await db
        .select({
          changeType: sponsorChanges.changeType,
          count: sql<number>`count(*)::int`,
          snapshotDate: sponsorChanges.snapshotDate,
        })
        .from(sponsorChanges)
        .groupBy(sponsorChanges.snapshotDate, sponsorChanges.changeType)
        .orderBy(desc(sponsorChanges.snapshotDate))
        .limit(20);

      let lastRunDate: string | null = null;
      const lastRunSummary: Record<string, number> = {};
      if (lastRunChanges.length > 0) {
        lastRunDate = lastRunChanges[0].snapshotDate;
        for (const row of lastRunChanges) {
          if (row.snapshotDate === lastRunDate) {
            lastRunSummary[row.changeType] = row.count;
          }
        }
      }

      const lastRunMemory = getLastRunInfo();

      const lastRunDb = await db
        .select()
        .from(monitorJobRuns)
        .orderBy(desc(monitorJobRuns.startedAt))
        .limit(1);
      const lastRunDbRow = lastRunDb[0] ?? null;

      const activeWatchResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(companyWatches)
        .where(eq(companyWatches.isActive, true));
      const activeWatchCount = activeWatchResult[0]?.count ?? 0;

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const notifResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationLog)
        .where(
          and(
            eq(notificationLog.status, "sent"),
            gte(notificationLog.sentAt, oneDayAgo)
          )
        );
      const notificationsSent24h = notifResult[0]?.count ?? 0;

      const lastRun = lastRunMemory ?? (lastRunDbRow ? {
        date:             lastRunDbRow.runDate,
        success:          lastRunDbRow.status === "success",
        error:            lastRunDbRow.errorMessage ?? undefined,
        recordsProcessed: lastRunDbRow.recordsProcessed ?? 0,
        changesDetected:  lastRunDbRow.changesDetected ?? 0,
        durationMs:       lastRunDbRow.durationMs ?? undefined,
      } : (lastRunDate ? { date: lastRunDate, success: true, changes: lastRunSummary } : null));

      res.json({
        latestSnapshot: latestDate,
        snapshotRecordCount,
        lastRun,
        activeWatchCount,
        notificationsSent24h,
        jobRunning: await isJobRunning(),
      });
    } catch (error) {
      console.error("Error fetching sponsor monitor status:", error);
      res.status(500).json({ message: "Failed to fetch sponsor monitor status." });
    }
  });

  app.get('/api/admin/sponsor-monitor/job-history', isAdmin, async (_req: any, res) => {
    try {
      const history = await db
        .select()
        .from(monitorJobRuns)
        .orderBy(desc(monitorJobRuns.startedAt))
        .limit(10);
      return res.json(history);
    } catch (error: unknown) {
      return res.status(500).json({ message: "Failed to fetch job history: " + (error instanceof Error ? error.message : "") });
    }
  });

  app.get('/api/admin/sponsor-monitor/recent-changes', isAdmin, async (req: any, res) => {
    try {
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
        .orderBy(desc(sponsorChanges.detectedAt))
        .limit(50);
      res.json(changes);
    } catch (error) {
      console.error("Error fetching recent changes:", error);
      res.status(500).json({ message: "Failed to fetch recent changes." });
    }
  });

  app.get('/api/admin/sponsor-monitor/top-watched', isAdmin, async (req: any, res) => {
    try {
      const topWatched = await db
        .select({
          organisationName: companyWatches.organisationName,
          watcherCount: sql<number>`count(*)::int`,
        })
        .from(companyWatches)
        .where(eq(companyWatches.isActive, true))
        .groupBy(companyWatches.organisationName)
        .orderBy(desc(sql`count(*)`))
        .limit(20);
      res.json(topWatched);
    } catch (error) {
      console.error("Error fetching top watched:", error);
      res.status(500).json({ message: "Failed to fetch top watched companies." });
    }
  });

  app.get('/api/admin/sponsor-monitor/notification-stats', isAdmin, async (req: any, res) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const stats = await db
        .select({
          channel: notificationLog.channel,
          status: notificationLog.status,
          count: sql<number>`count(*)::int`,
          day: sql<string>`date_trunc('day', ${notificationLog.sentAt})::date::text`,
        })
        .from(notificationLog)
        .where(gte(notificationLog.sentAt, sevenDaysAgo))
        .groupBy(notificationLog.channel, notificationLog.status, sql`date_trunc('day', ${notificationLog.sentAt})`)
        .orderBy(desc(sql`date_trunc('day', ${notificationLog.sentAt})`));
      res.json(stats);
    } catch (error) {
      console.error("Error fetching notification stats:", error);
      res.status(500).json({ message: "Failed to fetch notification stats." });
    }
  });

  app.get('/api/admin/sponsor-monitor/storage', isAdmin, async (req: any, res) => {
    try {
      const [canonicalCount, archiveStats] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(sponsorCanonical),
        db.select({
          earliest: sql<string>`min(${csvArchive.snapshotDate})::text`,
          latest:   sql<string>`max(${csvArchive.snapshotDate})::text`,
          count:    sql<number>`count(*)::int`,
        }).from(csvArchive).where(eq(csvArchive.isValid, true)),
      ]);

      res.json({
        totalRecords:      canonicalCount[0]?.count ?? 0,
        earliestSnapshot:  archiveStats[0]?.earliest || null,
        latestSnapshot:    archiveStats[0]?.latest || null,
        snapshotCount:     archiveStats[0]?.count ?? 0,
      });
    } catch (error) {
      console.error("Error fetching sponsor storage stats:", error);
      res.status(500).json({ message: "Failed to fetch storage stats." });
    }
  });

  app.post('/api/admin/sponsor-monitor/cleanup', isAdmin, (_req: any, res) => {
    res.status(410).json({
      message: "This endpoint is deprecated. The sponsor_list table is being retired. " +
               "Data is now stored in sponsorCanonical (per-company state) and csv_archive (daily CSV files on disk).",
    });
  });

  app.post('/api/admin/migrate-canonical', isAdmin, (_req: any, res) => {
    res.status(410).json({
      message: "This migration route is no longer needed. The nightly monitor job (or the Initialize button) " +
               "automatically seeds sponsorCanonical on its first run via the state machine.",
    });
  });

  app.post('/api/admin/sponsor-monitor/rebuild-index', isAdmin, async (_req: any, res) => {
    try {
      await rebuildSponsorIndex();
      const count = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(sponsorCanonical)
        .where(sql`${sponsorCanonical.status} IN ('ACTIVE', 'NEWLY_GRANTED')`))[0]?.n ?? 0;
      res.json({ count, message: `Search index rebuilt with ${count.toLocaleString()} active sponsors.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: `Failed to rebuild index: ${msg}` });
    }
  });

  app.post('/api/admin/sponsor-monitor/test', isAdmin, async (req: any, res) => {
    try {
      const { organisationName, changeType, previousValue, newValue } = req.body;

      if (!organisationName || !changeType) {
        return res.status(400).json({ message: "organisationName and changeType are required." });
      }

      const validTypes = ["REMOVED_REVOKED", "GRACE_PERIOD", "NEW_LICENCE", "RE_ACTIVATED", "DOWNGRADED", "UPGRADED", "ROUTE_CHANGE", "NAME_CHANGE"];
      if (!validTypes.includes(changeType)) {
        return res.status(400).json({ message: `changeType must be one of: ${validTypes.join(", ")}` });
      }

      const today = new Date().toISOString().split("T")[0];
      const [savedChange] = await db
        .insert(sponsorChanges)
        .values({
          organisationName,
          changeType,
          previousValue: previousValue || null,
          newValue: newValue || null,
          snapshotDate: today,
        })
        .returning();

      const { notifyAffectedUsers } = await import("../utils/notificationDispatcher");
      const notifResult = await notifyAffectedUsers(savedChange as SponsorChange);

      res.json({
        message: "Test change created and notifications dispatched.",
        change: savedChange,
        notifications: notifResult,
      });
    } catch (error) {
      console.error("Error running sponsor monitor test:", error);
      res.status(500).json({ message: "Failed to run test detection cycle." });
    }
  });

  app.post('/api/admin/trust-producer', isAdmin, async (req: any, res) => {
    try {
      const trustProducerSchema = z.object({
        producer: z.string().trim().min(1, "Producer name is required").max(500),
        verificationId: z.number().int().optional(),
      });
      const tpParsed = trustProducerSchema.safeParse(req.body);
      if (!tpParsed.success) {
        return res.status(400).json({ message: tpParsed.error.errors.map(e => e.message).join(', ') });
      }
      const { producer, verificationId } = tpParsed.data;

      const verification = verificationId !== undefined ? await storage.getVerificationById(verificationId) : null;

      const patternId = await storage.createTrustedPattern(
        `trusted-producer-${producer.replace(/\s+/g, '-').toLowerCase()}`,
        {
          producer,
          source: 'pattern-override',
          trustedAt: new Date().toISOString(),
          sourceVerificationId: verificationId,
        },
        { trustedProducers: [producer] }
      );

      res.json({
        message: `Producer "${producer}" is now trusted`,
        patternId
      });
    } catch (error) {
      console.error("Error trusting producer:", error);
      res.status(500).json({ message: "Failed to trust producer" });
    }
  });

  app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const search = req.query.search as string | undefined;
      const paidOnly = req.query.paidOnly === 'true';

      const result = await storage.getPaginatedUsers({ page, limit, search, paidOnly });
      res.json(result);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/admin/users/:id/restrict', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { restricted, reason } = req.body;

      await storage.updateUserRestriction(userId, restricted, reason);

      const targetUser = await storage.getUser(userId);
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && targetUser?.email) {
        const html = restricted
          ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">Account Restricted</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Your CheckByAI account has been restricted${reason ? `: <strong>${reason}</strong>` : '.'}</p>
                <p style="color:#333;font-size:15px;">If you believe this is a mistake, please contact us at <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a>.</p>
              </div>
            </div>`
          : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#16a34a 0%,#22c55e 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">Account Restriction Removed</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Good news — the restriction on your CheckByAI account has been lifted. You now have full access again.</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${getAppUrl()}/dashboard" style="background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Dashboard</a>
                </div>
                <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
              </div>
            </div>`;
        sendEmailReliably(
          {
            from: "CheckByAI <noreply@checkbyai.net>",
            to: [targetUser.email],
            subject: restricted ? "Your CheckByAI account has been restricted" : "Your CheckByAI account restriction has been removed",
            html,
          },
          "[Restrict]",
        );
      }

      res.json({
        message: restricted ? 'User has been restricted' : 'User restriction removed',
        userId,
        restricted
      });
    } catch (error) {
      console.error("Error updating user restriction:", error);
      res.status(500).json({ message: "Failed to update user restriction" });
    }
  });

  app.patch('/api/admin/users/:id/limit', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const limitSchema = z.object({
        limit: z.union([z.literal(null), z.literal(-1), z.number().int().positive()]),
      });
      const limitParsed = limitSchema.safeParse(req.body);
      if (!limitParsed.success) {
        return res.status(400).json({ message: "limit must be null, -1 (unlimited), or a positive integer" });
      }
      const { limit } = limitParsed.data;

      const updatedUser = await storage.updateUserVerificationLimit(userId, limit);

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      let limitDescription = 'Default (1/day)';
      if (limit === -1) limitDescription = 'Unlimited';
      else if (limit !== null && limit > 0) limitDescription = `${limit} verifications`;

      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && updatedUser.email) {
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);padding:28px;border-radius:10px 10px 0 0;">
            <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">Verification Limit Updated</h1>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
            <p style="color:#333;font-size:15px;margin-top:0;">Your COS verification limit has been updated by an administrator.</p>
            <div style="background:#f0f4ff;padding:16px;border-radius:8px;margin:16px 0;text-align:center;">
              <span style="font-size:22px;font-weight:bold;color:#1d4ed8;">${limitDescription}</span>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${getAppUrl()}/dashboard" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Dashboard</a>
            </div>
            <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
          </div>
        </div>`;
        sendEmailReliably(
          {
            from: "CheckByAI <noreply@checkbyai.net>",
            to: [updatedUser.email],
            subject: "Your COS verification limit has been updated",
            html,
          },
          "[Limit]",
        );
      }

      res.json({
        message: `Verification limit set to: ${limitDescription}`,
        userId,
        verificationLimit: limit
      });
    } catch (error) {
      console.error("Error updating user verification limit:", error);
      res.status(500).json({ message: "Failed to update verification limit" });
    }
  });

  app.patch('/api/admin/users/:id/cos-approval', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { approved } = req.body;

      if (typeof approved !== 'boolean') {
        return res.status(400).json({ message: 'approved must be a boolean' });
      }

      await storage.updateCosCheckApproval(userId, approved);
      const updatedUser = await storage.getUser(userId);

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (updatedUser.email) {
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const html = approved
            ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);padding:28px;border-radius:10px 10px 0 0;">
                  <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127381; CoS Check Access Approved</h1>
                </div>
                <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                  <p style="color:#333;font-size:15px;margin-top:0;">Great news — your account has been approved for <strong>CoS Check</strong>.</p>
                  <p style="color:#333;font-size:15px;">You can now upload and verify Certificates of Sponsorship using our forensic AI detection system.</p>
                  <div style="text-align:center;margin:24px 0;">
                    <a href="${getAppUrl()}/dashboard" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Start Verifying</a>
                  </div>
                  <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
                </div>
              </div>`
            : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#6b7280 0%,#9ca3af 100%);padding:28px;border-radius:10px 10px 0 0;">
                  <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">CoS Check Access Removed</h1>
                </div>
                <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                  <p style="color:#333;font-size:15px;margin-top:0;">Your CoS Check access has been removed by an administrator.</p>
                  <p style="color:#333;font-size:15px;">If you believe this is a mistake, please contact us at <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a>.</p>
                </div>
              </div>`;
          sendEmailReliably(
            {
              from: "CheckByAI <noreply@checkbyai.net>",
              to: [updatedUser.email],
              subject: approved ? "Your CoS Check access has been approved" : "Your CoS Check access has been removed",
              html,
            },
            "[CoS Approval]",
          );
        }
      }

      res.json({
        message: approved ? 'Beta access granted' : 'Beta access revoked',
        userId,
        cosCheckApproved: approved,
      });
    } catch (error) {
      console.error("Error updating CoS Check approval:", error);
      res.status(500).json({ message: "Failed to update beta approval" });
    }
  });

  app.get('/api/admin/system-settings', isAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAllSystemSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching system settings:", error);
      res.status(500).json({ message: "Failed to fetch system settings" });
    }
  });

  const ALLOWED_SYSTEM_SETTINGS = ['defaultDailyLimit', 'notifications_paused'] as const;

  app.patch('/api/admin/system-settings/:key', isAdmin, async (req: any, res) => {
    try {
      const { key } = req.params;
      if (!ALLOWED_SYSTEM_SETTINGS.includes(key as typeof ALLOWED_SYSTEM_SETTINGS[number])) {
        return res.status(400).json({ message: `Invalid setting key: '${key}'. Allowed: ${ALLOWED_SYSTEM_SETTINGS.join(', ')}` });
      }
      const { value } = req.body;
      if (value === undefined || value === null) {
        return res.status(400).json({ message: 'value is required' });
      }
      await storage.setSystemSetting(key, String(value));
      res.json({ message: `Setting '${key}' updated`, key, value: String(value) });
    } catch (error) {
      console.error("Error updating system setting:", error);
      res.status(500).json({ message: "Failed to update system setting" });
    }
  });

  app.patch('/api/admin/users/:id/ip-exempt', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { exempt } = req.body;
      if (typeof exempt !== 'boolean') {
        return res.status(400).json({ message: 'exempt must be a boolean' });
      }
      await storage.updateIpExempt(userId, exempt);
      res.json({ message: exempt ? 'IP rate limit exemption granted' : 'IP rate limit exemption removed', userId, ipExempt: exempt });
    } catch (error) {
      console.error("Error updating IP exemption:", error);
      res.status(500).json({ message: "Failed to update IP exemption" });
    }
  });

  app.patch('/api/admin/users/:id/cos-subscription', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { active } = req.body;
      if (typeof active !== 'boolean') {
        return res.status(400).json({ message: 'active must be a boolean' });
      }
      await storage.updateCosCheckSubscription(userId, active);

      const targetUser = await storage.getUser(userId);
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && targetUser?.email) {
        const html = active
          ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127881; COS Check Subscription Activated</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Your <strong>COS Check subscription</strong> has been activated. You now have full access to COS document verification.</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${getAppUrl()}/dashboard" style="background:#059669;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Start Verifying</a>
                </div>
                <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
              </div>
            </div>`
          : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#6b7280 0%,#9ca3af 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">COS Check Subscription Deactivated</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Your COS Check subscription has been deactivated.</p>
                <p style="color:#333;font-size:15px;">If you have questions, please contact us at <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a>.</p>
              </div>
            </div>`;
        sendEmailReliably(
          {
            from: "CheckByAI <noreply@checkbyai.net>",
            to: [targetUser.email],
            subject: active ? "Your COS Check subscription has been activated" : "Your COS Check subscription has been deactivated",
            html,
          },
          "[COS Subscription]",
        );
      }

      res.json({ message: active ? 'COS check subscription activated' : 'COS check subscription deactivated', userId, cosCheckSubscription: active });
    } catch (error) {
      console.error("Error updating COS check subscription:", error);
      res.status(500).json({ message: "Failed to update COS check subscription" });
    }
  });

  app.patch('/api/admin/users/:id/cos-beta', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { enabled, limit } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: 'enabled must be a boolean' });
      }
      if (limit !== null && limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        return res.status(400).json({ message: 'limit must be a positive integer or null' });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      const updatedUser = await storage.updateCosBeta(userId, enabled, limit ?? null);

      const isPaid = ['starter', 'pro', 'unlimited', 'enterprise'].includes(updatedUser.subscriptionStatus || '');
      if (enabled && isPaid && updatedUser.email) {
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const limitLine = limit ? `<p style="color:#333;font-size:15px;">Your daily verification limit has been set to <strong>${limit}</strong>.</p>` : '';
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:28px;border-radius:10px 10px 0 0;">
              <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127881; COS Beta Access Granted</h1>
            </div>
            <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
              <p style="color:#333;font-size:15px;margin-top:0;">Congratulations! You have been granted <strong>COS Beta access</strong> on Check By AI.</p>
              ${limitLine}
              <div style="text-align:center;margin:24px 0;">
                <a href="${getAppUrl()}/dashboard" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Dashboard</a>
              </div>
              <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
            </div>
          </div>`;
          sendEmailReliably(
            {
              from: "CheckByAI <noreply@checkbyai.net>",
              to: [updatedUser.email],
              subject: "You've been granted COS Beta access",
              html,
            },
            "[COS Beta]",
          );
        }
      }

      res.json({ message: enabled ? 'COS Beta access enabled' : 'COS Beta access disabled', userId, cosBetaEnabled: enabled, cosBetaLimit: limit ?? null });
    } catch (error) {
      console.error("Error updating COS Beta access:", error);
      res.status(500).json({ message: "Failed to update COS Beta access" });
    }
  });

  app.delete('/api/admin/users/:id', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;

      if (req.user?.id === userId) {
        return res.status(403).json({ message: 'You cannot delete your own account' });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (targetUser.role === 'admin') {
        return res.status(403).json({ message: 'Admin accounts cannot be deleted' });
      }

      await storage.deleteUser(userId);

      await db.execute(
        sql`DELETE FROM sessions WHERE sess->'passport'->'user'->>'id' = ${userId}`
      );

      res.json({ message: 'User deleted successfully', userId });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.get('/api/admin/export-report/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const verification = await storage.getVerificationById(id);

      if (!verification) {
        return res.status(404).json({ message: 'Verification not found' });
      }

      const report = {
        title: 'COS Verification Forensic Report',
        generatedAt: new Date().toISOString(),
        verification: {
          id: verification.id,
          filename: verification.filename,
          result: verification.result,
          confidence: verification.confidence,
          verifiedAt: verification.verifiedAt,
        },
        metadata: verification.metadata,
        analysisDetails: verification.analysisDetails,
      };

      res.json(report);
    } catch (error) {
      console.error("Error exporting report:", error);
      res.status(500).json({ message: "Failed to export report" });
    }
  });

  app.get('/api/admin/global-rules', isAdmin, async (req, res) => {
    try {
      const rules = await storage.getGlobalAiRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching global rules:", error);
      res.status(500).json({ message: "Failed to fetch global rules" });
    }
  });

  const globalRuleSchema = z.object({
    category: z.enum(['date_check', 'producer_check', 'metadata_check', 'pattern_check', 'red_flag', 'trusted_marker']),
    ruleText: z.string().min(5).max(1000),
    priority: z.number().min(0).max(100).optional().default(0),
  });

  app.post('/api/admin/global-rules', isAdmin, async (req: any, res) => {
    try {
      const parsed = globalRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(', ') });
      }

      const { category, ruleText, priority } = parsed.data;

      const rule = await storage.createGlobalAiRule({
        category,
        ruleText,
        priority,
        createdBy: req.user?.id ?? null,
      });

      res.json(rule);
    } catch (error) {
      console.error("Error creating global rule:", error);
      res.status(500).json({ message: "Failed to create global rule" });
    }
  });

  app.patch('/api/admin/global-rules/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { category, ruleText, priority, isActive } = req.body;

      const rule = await storage.updateGlobalAiRule(id, {
        ...(category && { category }),
        ...(ruleText && { ruleText }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
      });

      res.json(rule);
    } catch (error) {
      console.error("Error updating global rule:", error);
      res.status(500).json({ message: "Failed to update global rule" });
    }
  });

  app.delete('/api/admin/global-rules/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGlobalAiRule(id);
      res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
      console.error("Error deleting global rule:", error);
      res.status(500).json({ message: "Failed to delete global rule" });
    }
  });

  app.post('/api/admin/global-rules/:id/toggle', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isActive } = req.body;

      await storage.toggleGlobalAiRule(id, isActive);
      res.json({ message: `Rule ${isActive ? 'activated' : 'deactivated'}` });
    } catch (error) {
      console.error("Error toggling global rule:", error);
      res.status(500).json({ message: "Failed to toggle global rule" });
    }
  });

  const teachAiSchema = z.object({
    verificationId: z.number().optional(),
    category: z.enum(['date_check', 'producer_check', 'metadata_check', 'pattern_check', 'red_flag', 'trusted_marker']).default('red_flag'),
    ruleText: z.string().min(5).max(1000),
    priority: z.number().min(0).max(100).default(10),
  });

  app.post('/api/admin/teach-ai', isAdmin, async (req: any, res) => {
    try {
      const parsed = teachAiSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(', ') });
      }

      const { verificationId, category, ruleText, priority } = parsed.data;

      let enrichedRuleText = ruleText;
      if (verificationId) {
        const verification = await storage.getVerificationById(verificationId);
        if (verification) {
          enrichedRuleText = `[Learned from verification #${verificationId} - ${verification.result}] ${ruleText}`;
        }
      }

      const rule = await storage.createGlobalAiRule({
        category,
        ruleText: enrichedRuleText,
        priority,
        createdBy: req.user?.id ?? null,
      });

      res.json({
        message: 'AI has learned this pattern',
        rule
      });
    } catch (error) {
      console.error("Error teaching AI:", error);
      res.status(500).json({ message: "Failed to teach AI" });
    }
  });

  app.patch('/api/admin/trusted-patterns/:id/instructions', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { aiInstructions } = req.body;

      await storage.updateTrustedPatternInstructions(id, aiInstructions);
      res.json({ message: 'Pattern instructions updated' });
    } catch (error) {
      console.error("Error updating pattern instructions:", error);
      res.status(500).json({ message: "Failed to update pattern instructions" });
    }
  });

  // SEC-007: added isAuthenticated guard — was fully unauthenticated (spam risk)
  app.post('/api/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const feedbackData = insertFeedbackSchema.parse(req.body);

      if (req.isAuthenticated()) {
        feedbackData.userId = req.user.id;
      }

      const newFeedback = await storage.createFeedback(feedbackData);
      res.json(newFeedback);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid feedback data", errors: error.errors });
      }
      console.error("Error creating feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  app.get('/api/feedback/stats', isAdmin, async (req, res) => {
    try {
      const stats = await storage.getFeedbackStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching feedback stats:", error);
      res.status(500).json({ message: "Failed to fetch feedback stats" });
    }
  });

  app.post('/api/paid/create-checkout', isAuthenticated, async (req, res) => {
    try {
      const { packageType } = req.body;

      if (!packageType || !['normal', 'full'].includes(packageType)) {
        return res.status(400).json({ message: 'Invalid package type' });
      }

      const prices = {
        normal: 1999, // £19.99 in pence
        full: 4999,   // £49.99 in pence
      };

      // Need stripe here — import dynamically to avoid circular deps
      const Stripe = (await import('stripe')).default;
      if (!process.env.STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY');
      const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-11-17.clover" as any });

      const session = await stripeInstance.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'gbp',
              product_data: {
                name: packageType === 'full' ? 'Full CoS Verification Package' : 'Normal CoS Verification',
                description: packageType === 'full'
                  ? 'Priority review, phone consultation, employer verification, detailed analysis'
                  : 'AI + expert verification with guaranteed report',
              },
              unit_amount: prices[packageType as keyof typeof prices],
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.headers.origin}/submit?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/pricing`,
        metadata: {
          packageType,
        },
      });

      const submission = await storage.createPaidSubmission({
        userId: req.user.id,
        email: '',
        packageType,
        paymentStatus: 'pending',
        stripeSessionId: session.id,
        priority: packageType === 'full',
        phoneConsultationRequested: packageType === 'full',
      });

      res.json({ url: session.url, sessionId: session.id, submissionId: submission.id });
    } catch (error: unknown) {
      console.error('Checkout creation error:', error);
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  app.get('/api/paid/submission/:sessionId', isAuthenticated, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const submission = await storage.getPaidSubmissionBySessionId(sessionId);

      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      const Stripe = (await import('stripe')).default;
      if (!process.env.STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY');
      const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-11-17.clover" as any });

      const session = await stripeInstance.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid' && submission.paymentStatus !== 'paid') {
        await storage.updatePaidSubmission(submission.id, {
          paymentStatus: 'paid',
          email: session.customer_details?.email || '',
        });
      }

      const updatedSubmission = await storage.getPaidSubmissionBySessionId(sessionId);
      res.json(updatedSubmission);
    } catch (error: unknown) {
      console.error('Get submission error:', error);
      res.status(500).json({ message: 'Failed to get submission' });
    }
  });

  app.post('/api/paid/submit/:submissionId', upload.fields([
    { name: 'cosDocument', maxCount: 1 },
    { name: 'supportingDocuments', maxCount: 5 },
  ]), isAuthenticated, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.submissionId);
      const submission = await storage.getPaidSubmission(submissionId);

      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      if (submission.userId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      if (submission.paymentStatus !== 'paid') {
        return res.status(400).json({ message: 'Payment not completed' });
      }

      // SEC-008: IDOR fix — verify caller owns this submission
      if (submission.userId && submission.userId !== (req as any).user?.id) {
        return res.status(403).json({ message: 'Forbidden: you do not own this submission' });
      }

      const {
        howApplied,
        emailsReceived,
        confirmationDetails,
        employerName,
        jobTitle,
        cosReferenceNumber,
        additionalNotes,
      } = req.body;

      const cosDocumentPath = req.files?.cosDocument?.[0]?.path || null;
      const supportingDocumentsPath = req.files?.supportingDocuments?.map((f: any) => f.path) || [];

      await storage.updatePaidSubmission(submissionId, {
        howApplied,
        emailsReceived,
        confirmationDetails,
        employerName,
        jobTitle,
        cosReferenceNumber,
        additionalNotes,
        cosDocumentPath,
        supportingDocumentsPath,
        reviewStatus: 'pending',
      });

      res.json({ message: 'Submission received successfully', submissionId });
    } catch (error: unknown) {
      console.error('Submit error:', error);
      res.status(500).json({ message: 'Failed to submit' });
    }
  });

  app.get('/api/paid/status/:submissionId', isAuthenticated, async (req, res) => {
    try {
      const submissionId = parseInt(req.params.submissionId);
      const submission = await storage.getPaidSubmission(submissionId);

      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      if (submission.userId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      res.json({
        id: submission.id,
        packageType: submission.packageType,
        reviewStatus: submission.reviewStatus,
        expertVerdict: submission.expertVerdict,
        reportDelivered: submission.reportDelivered,
        createdAt: submission.createdAt,
      });
    }

    // SEC-009: IDOR fix — verify caller owns this submission
    if (submission.userId && submission.userId !== (req as any).user?.id) {
      return res.status(403).json({ message: 'Forbidden: you do not own this submission' });
    } catch (error: unknown) {
      console.error('Status error:', error);
      res.status(500).json({ message: 'Failed to get status' });
    }
  });

  app.get('/api/admin/paid-submissions', isAdmin, async (req, res) => {
    try {
      const submissions = await storage.getAllPaidSubmissions();
      res.json(submissions);
    } catch (error: unknown) {
      console.error('Get submissions error:', error);
      res.status(500).json({ message: 'Failed to get submissions' });
    }
  });

  app.patch('/api/admin/paid-submissions/:id', isAdmin, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const {
        reviewStatus,
        expertVerdict,
        expertConfidence,
        documentAnalysisReport,
        alterationsDetected,
        recommendations,
        employerVerificationResult,
      } = req.body;

      const submission = await storage.updatePaidSubmission(submissionId, {
        reviewStatus,
        expertVerdict,
        expertConfidence,
        documentAnalysisReport,
        alterationsDetected,
        recommendations,
        employerVerificationResult,
        assignedTo: req.user.id,
      });

      res.json(submission);
    } catch (error: unknown) {
      console.error('Update submission error:', error);
      res.status(500).json({ message: 'Failed to update submission' });
    }
  });

  app.post('/api/admin/paid-submissions/:id/verify-employer', isAdmin, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getPaidSubmission(submissionId);

      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      if (submission.packageType !== 'full') {
        return res.status(400).json({ message: 'Employer verification is only available for Full Package' });
      }

      if (!submission.employerName) {
        return res.status(400).json({ message: 'Employer name is required for verification' });
      }

      const verificationResult = {
        employerName: submission.employerName,
        verifiedAt: new Date().toISOString(),
        status: 'manual_review_required',
        message: 'Employer verification requires manual check against UK Home Office Sponsor Register',
        recommendedChecks: [
          'Verify employer exists on gov.uk sponsor licence register',
          'Check employer trading name matches',
          'Confirm sponsor licence tier (Skilled Worker)',
          'Check licence is not suspended or revoked',
          'Verify Companies House registration if applicable'
        ],
        governmentResources: {
          sponsorRegister: 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
          companiesHouse: 'https://find-and-update.company-information.service.gov.uk/'
        },
        notes: 'Manual verification against official UK government sources is recommended for highest accuracy.'
      };

      await storage.updatePaidSubmission(submissionId, {
        employerVerificationResult: verificationResult,
      });

      res.json({
        message: 'Employer verification data recorded',
        verificationResult
      });
    } catch (error: unknown) {
      console.error('Employer verification error:', error);
      res.status(500).json({ message: 'Failed to verify employer' });
    }
  });

  app.post('/api/admin/paid-submissions/:id/send-report', isAdmin, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getPaidSubmission(submissionId);

      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      if (submission.reviewStatus !== 'completed') {
        return res.status(400).json({ message: 'Review must be completed before sending report' });
      }

      if (!submission.email) {
        return res.status(400).json({ message: 'No email address on file' });
      }

      const verdictColors: Record<string, string> = {
        genuine: '#22c55e',
        suspicious: '#f59e0b',
        fake: '#ef4444',
        inconclusive: '#6b7280',
      };

      const verdictColor = verdictColors[submission.expertVerdict || 'inconclusive'] || '#6b7280';

      const reportHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #003366 0%, #0066CC 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .verdict { background: ${verdictColor}; color: white; padding: 15px 30px; border-radius: 8px; display: inline-block; font-size: 24px; font-weight: bold; text-transform: uppercase; }
            .confidence { font-size: 18px; margin-top: 10px; }
            .section { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .section h3 { color: #003366; margin-top: 0; border-bottom: 2px solid #0066CC; padding-bottom: 10px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .package-badge { background: ${submission.packageType === 'full' ? '#0066CC' : '#6b7280'}; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Certificate of Sponsorship Verification Report</h1>
            <span class="package-badge">${submission.packageType === 'full' ? 'Full Package' : 'Normal Verification'}</span>
          </div>
          <div class="content">
            <div style="text-align: center; margin-bottom: 30px;">
              <div class="verdict">${submission.expertVerdict || 'Pending'}</div>
              <div class="confidence">Confidence: ${submission.expertConfidence || 0}%</div>
            </div>

            <div class="section">
              <h3>Submission Details</h3>
              <p><strong>Employer:</strong> ${submission.employerName || 'Not provided'}</p>
              <p><strong>Job Title:</strong> ${submission.jobTitle || 'Not provided'}</p>
              <p><strong>CoS Reference:</strong> ${submission.cosReferenceNumber || 'Not provided'}</p>
              <p><strong>Submission Date:</strong> ${new Date(submission.createdAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>

            <div class="section">
              <h3>Expert Analysis</h3>
              <p>${submission.documentAnalysisReport || 'No detailed analysis available.'}</p>
            </div>

            ${submission.recommendations ? `
            <div class="section">
              <h3>Recommendations</h3>
              <p>${submission.recommendations}</p>
            </div>
            ` : ''}

            ${submission.packageType === 'full' && submission.employerVerificationResult ? `
            <div class="section">
              <h3>Employer Verification</h3>
              <p>${JSON.stringify(submission.employerVerificationResult)}</p>
            </div>
            ` : ''}
          </div>
          <div class="footer">
            <p>This report was generated by CoS Verify UK</p>
            <p>For questions, contact support@cosverify.uk</p>
            <p>Report ID: ${submission.id} | Generated: ${new Date().toISOString()}</p>
          </div>
        </body>
        </html>
      `;

      if (!process.env.RESEND_API_KEY) {
        return res.status(500).json({ message: 'Email service not configured' });
      }

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'CheckByAI <reports@checkbyai.net>',
          to: [submission.email],
          subject: `Your CoS Verification Report - ${submission.expertVerdict?.toUpperCase() || 'COMPLETE'}`,
          html: reportHtml,
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        console.error('Resend error:', errorData);
        return res.status(500).json({ message: 'Failed to send email' });
      }

      await storage.updatePaidSubmission(submissionId, {
        reportDelivered: true,
        reportDeliveredAt: new Date(),
      });

      res.json({ message: 'Report sent successfully' });
    } catch (error: unknown) {
      console.error('Send report error:', error);
      res.status(500).json({ message: 'Failed to send report' });
    }
  });

  app.patch('/api/logs/:id/feedback', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { adminStatus, adminFeedback, accuracyScore } = req.body;

      if (!['pending', 'approved', 'fake'].includes(adminStatus)) {
        return res.status(400).json({ message: 'Invalid admin status' });
      }

      const verification = await storage.getVerificationById(id);
      if (!verification) {
        return res.status(404).json({ message: 'Verification log not found' });
      }

      const updated = await storage.updateVerificationFeedback(id, {
        adminStatus,
        adminFeedback: adminFeedback || null,
        adminReviewedBy: req.user.id,
        adminReviewedAt: new Date(),
        accuracyScore: adminStatus === 'fake' ? 0 : (accuracyScore || null),
        overrideResult: adminStatus === 'fake' ? 'fake' : undefined,
      });

      if (adminStatus === 'fake' && adminFeedback?.trim()) {
        try {
          const overrideDate = new Date().toISOString().split('T')[0];
          const originalResult = verification.result;
          const originalConfidence = verification.confidence;
          const producer = (verification.metadata as any)?.producer || 'Unknown';
          const ruleText =
            `CRITICAL ADMIN OVERRIDE [${overrideDate}]: Document initially verified as '${originalResult}' (${originalConfidence}% confidence) was confirmed FAKE by a human expert.\n` +
            `Producer: ${producer}\n` +
            `Admin reasoning: ${sanitizeForPrompt(adminFeedback.trim())}\n` +
            `Action required: Apply heightened scrutiny to documents with similar metadata patterns. Do not classify as Genuine without explicit justification.`;

          await storage.createGlobalAiRule({
            category: 'hitl-override',
            ruleText,
            priority: 100,
            isActive: true,
          });
        } catch (ruleError) {
          console.error('Failed to create AI rule from admin override (non-fatal):', ruleError);
        }
      }

      res.json({
        message: 'Feedback recorded',
        verification: updated,
        ruleAdded: adminStatus === 'fake' && !!adminFeedback?.trim(),
      });
    } catch (error) {
      console.error('Error updating verification feedback:', error);
      res.status(500).json({ message: 'Failed to update feedback' });
    }
  });

  app.delete('/api/logs/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const log = await storage.getVerificationById(id);
      if (!log) return res.status(404).json({ message: 'Log not found' });
      await storage.deleteVerificationLog(id);
      res.json({ message: 'Log deleted' });
    } catch (error) {
      console.error('Error deleting verification log:', error);
      res.status(500).json({ message: 'Failed to delete log' });
    }
  });

  app.get('/api/knowledge-base', isAdmin, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 15;
      const knowledge = await storage.getAdminFakeKnowledge(limit);

      let knowledgeContext = '';
      if (knowledge.length > 0) {
        knowledgeContext = 'IMPORTANT HUMAN FEEDBACK CONTEXT:\n';
        knowledgeContext += 'In previous verifications, human experts have flagged the following patterns as FAKE:\n\n';

        knowledge.forEach((entry, idx) => {
          const metadata = entry.metadata as any;
          knowledgeContext += `[Case ${idx + 1}] File: ${entry.filename}\n`;
          knowledgeContext += `Producer: ${metadata?.producer || 'Unknown'}\n`;
          knowledgeContext += `AI said: ${entry.result} (${entry.confidence}% confidence)\n`;
          knowledgeContext += `Admin override: FAKE\n`;
          knowledgeContext += `Admin reasoning: ${sanitizeForPrompt(entry.adminFeedback || 'No details provided')}\n\n`;
        });

        knowledgeContext += 'DO NOT repeat the mistake of marking similar patterns as Genuine.\n';
        knowledgeContext += 'Prioritize forensic metadata analysis over visual appearance.\n';
      }

      res.json({
        entries: knowledge,
        count: knowledge.length,
        knowledgeContext,
      });
    } catch (error) {
      console.error('Error fetching knowledge base:', error);
      res.status(500).json({ message: 'Failed to fetch knowledge base' });
    }
  });

  // ── Sponsor Monitor Plan Override ─────────────────────────────────────────
  app.patch('/api/admin/users/:id/sponsor-monitor-plan', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const planSchema = z.object({
        plan: z.enum(['free', 'starter', 'pro']),
      });
      const parsed = planSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "plan must be 'free', 'starter', or 'pro'" });
      }
      const { plan } = parsed.data;

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (targetUser.role === 'admin') {
        return res.status(403).json({ message: 'Admin accounts cannot be modified' });
      }

      const previousStatus = targetUser.subscriptionStatus || 'free';
      const updatedUser = await storage.updateUserSubscription(userId, {
        subscriptionStatus: plan,
      });

      // ── Phase 2B: Write to subscription audit log (updated after watch cleanup) ──

      // ── Phase 1C: Deactivate excess watches on downgrade ─────────────────
      const newWatchLimit = getWatchLimit(plan);
      let deactivatedWatchCount = 0;

      if (newWatchLimit !== -1) {
        const activeWatches = await db
          .select({ id: companyWatches.id })
          .from(companyWatches)
          .where(and(
            eq(companyWatches.userId, userId),
            eq(companyWatches.isActive, true),
          ))
          .orderBy(asc(companyWatches.createdAt)); // oldest first — keep oldest watches

        if (activeWatches.length > newWatchLimit) {
          const watchesToDeactivate = activeWatches.slice(newWatchLimit);
          for (const watch of watchesToDeactivate) {
            await db
              .update(companyWatches)
              .set({ isActive: false })
              .where(eq(companyWatches.id, watch.id));
          }
          deactivatedWatchCount = watchesToDeactivate.length;
          console.log(`[AdminPlanOverride] Deactivated ${deactivatedWatchCount} excess watches for user ${userId} (${previousStatus} → ${plan}, limit=${newWatchLimit})`);
        }
      }

      // ── Phase 2B: Audit log write (after watch cleanup count is known) ────
      await storage.logSubscriptionChange({
        userId,
        changedBy: (req.user as any)?.id ?? 'admin',
        source: 'admin_override',
        previousStatus,
        newStatus: plan,
        reason: 'Admin plan override via admin panel',
        metadata: { deactivatedWatches: deactivatedWatchCount },
      }).catch((err) => console.error('[AdminPlanOverride] Audit log write failed:', err));

      const planLabels: Record<string, string> = {
        free: 'Free',
        starter: 'Sponsor Monitor Starter',
        pro: 'Sponsor Monitor Pro',
      };
      const planFeatures: Record<string, string> = {
        free: 'No company watches or notifications.',
        starter: '2 company watches · Same-day alerts · Email & WhatsApp notifications.',
        pro: '5 company watches · Immediate alerts · Email, WhatsApp & SMS · Enriched intelligence.',
      };

      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && updatedUser.email) {
        const isUpgrade = plan !== 'free';
        const headerColor = plan === 'pro' ? '#7c3aed' : plan === 'starter' ? '#059669' : '#6b7280';
        const watchNote = deactivatedWatchCount > 0
          ? `<p style="color:#b45309;font-size:13px;background:#fffbeb;border:1px solid #fde68a;padding:10px 14px;border-radius:6px;margin:12px 0;">${deactivatedWatchCount} company watch${deactivatedWatchCount > 1 ? 'es were' : ' was'} removed to match your new plan limit.</p>`
          : '';
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,${headerColor} 0%,${headerColor}cc 100%);padding:28px;border-radius:10px 10px 0 0;">
            <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">${isUpgrade ? '🎉 ' : ''}Sponsor Monitor Plan ${isUpgrade ? 'Updated' : 'Removed'}</h1>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
            <p style="color:#333;font-size:15px;margin-top:0;">Your Sponsor Monitor plan has been updated by an administrator.</p>
            <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;text-align:center;">
              <span style="font-size:20px;font-weight:bold;color:${headerColor};">${planLabels[plan]}</span>
              <p style="color:#555;font-size:13px;margin:8px 0 0;">${planFeatures[plan]}</p>
            </div>
            ${watchNote}
            ${isUpgrade ? `<div style="text-align:center;margin:24px 0;">
              <a href="${getAppUrl()}/sponsor-monitor" style="background:${headerColor};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Sponsor Monitor</a>
            </div>` : ''}
            <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
          </div>
        </div>`;
        sendEmailReliably(
          {
            from: 'CheckByAI <noreply@checkbyai.net>',
            to: [updatedUser.email],
            subject: isUpgrade
              ? `Your Sponsor Monitor plan has been updated to ${planLabels[plan]}`
              : 'Your Sponsor Monitor subscription has been removed',
            html,
          },
          '[SponsorMonitorPlan]',
        );
      }

      res.json({
        message: `Sponsor Monitor plan set to '${plan}'`,
        userId,
        previousStatus,
        subscriptionStatus: plan,
        deactivatedWatches: deactivatedWatchCount,
      });
    } catch (error) {
      console.error('Error updating sponsor monitor plan:', error);
      res.status(500).json({ message: 'Failed to update sponsor monitor plan' });
    }
  });

  // ── Manual Credit Management ───────────────────────────────────────────────
  app.patch('/api/admin/users/:id/credits', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const creditSchema = z.object({
        operation: z.enum(['add', 'deduct', 'set']),
        amount: z.number().int().min(0),
        reason: z.string().max(200).optional(),
      });
      const parsed = creditSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'operation must be add/deduct/set, amount must be a non-negative integer' });
      }
      const { operation, amount, reason } = parsed.data;

      const targetUser = await storage.getUser(userId);
      if (!targetUser) return res.status(404).json({ message: 'User not found' });
      if (targetUser.role === 'admin') return res.status(403).json({ message: 'Admin accounts cannot be modified' });

      const prevCredits = targetUser.credits ?? 0;
      let updatedUser: typeof targetUser;

      if (operation === 'add') {
        updatedUser = await storage.addCredits(userId, amount);
      } else if (operation === 'deduct') {
        updatedUser = await storage.deductCredits(userId, amount);
      } else {
        // 'set' — direct assignment using already-imported db and users table
        const [u] = await db
          .update(users)
          .set({ credits: amount, updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning();
        updatedUser = u;
      }

      const newCredits = updatedUser?.credits ?? 0;
      const delta = newCredits - prevCredits;
      console.log(`[AdminCredits] User ${userId}: ${prevCredits} → ${newCredits} (${operation} ${amount}, reason: ${reason ?? 'none'})`);

      // Audit log
      storage.logSubscriptionChange({
        userId,
        changedBy: (req.user as any)?.id ?? 'admin',
        source: 'admin_override',
        previousStatus: targetUser.subscriptionStatus || 'free',
        newStatus: targetUser.subscriptionStatus || 'free',
        reason: reason ? `Credits ${operation}: ${reason}` : `Credits ${operation} by admin`,
        metadata: { creditsBefore: prevCredits, creditsAfter: newCredits, delta, operation, amount },
      }).catch(() => {});

      res.json({
        message: `Credits updated: ${prevCredits} → ${newCredits}`,
        userId,
        creditsBefore: prevCredits,
        creditsAfter: newCredits,
      });
    } catch (error) {
      console.error('Error updating credits:', error);
      res.status(500).json({ message: 'Failed to update credits' });
    }
  });

  app.get('/api/admin/users/:id/subscription-audit', isAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const log = await storage.getSubscriptionAuditLog(userId, limit);
      res.json(log);
    } catch (error) {
      console.error('Error fetching subscription audit log:', error);
      res.status(500).json({ message: 'Failed to fetch subscription audit log' });
    }
  });

  app.get('/api/admin/verification-logs-hitl', isAdmin, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const adminStatus = req.query.adminStatus as string;

      const logs = await storage.getVerificationLogsWithHITL(page, limit, adminStatus);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching HITL logs:', error);
      res.status(500).json({ message: 'Failed to fetch logs' });
    }
  });

  // ── Notification Portal ───────────────────────────────────────────────────

  // GET /api/admin/notifications/status — kill switch state
  app.get('/api/admin/notifications/status', isAdmin, async (_req, res) => {
    try {
      const value = await storage.getSystemSetting('notifications_paused');
      const paused = value === 'true';
      res.json({ paused });
    } catch (error) {
      console.error('Error fetching notification status:', error);
      res.status(500).json({ message: 'Failed to fetch notification status' });
    }
  });

  // POST /api/admin/notifications/pause — activate kill switch
  app.post('/api/admin/notifications/pause', isAdmin, async (req: any, res) => {
    try {
      await storage.setSystemSetting('notifications_paused', 'true');
      console.log(`[Admin] Notifications PAUSED by ${req.user?.email ?? req.user?.id}`);
      res.json({ paused: true });
    } catch (error) {
      console.error('Error pausing notifications:', error);
      res.status(500).json({ message: 'Failed to pause notifications' });
    }
  });

  // POST /api/admin/notifications/resume — deactivate kill switch
  app.post('/api/admin/notifications/resume', isAdmin, async (req: any, res) => {
    try {
      await storage.setSystemSetting('notifications_paused', 'false');
      console.log(`[Admin] Notifications RESUMED by ${req.user?.email ?? req.user?.id}`);
      res.json({ paused: false });
    } catch (error) {
      console.error('Error resuming notifications:', error);
      res.status(500).json({ message: 'Failed to resume notifications' });
    }
  });

  // GET /api/admin/notifications/users — paginated user notif_prefs
  app.get('/api/admin/notifications/users', isAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
      const search = (req.query.search as string)?.trim() ?? '';
      const offset = (page - 1) * limit;

      const searchFilter = search
        ? sql`${users.email} ILIKE ${'%' + search + '%'} AND ${users.deletedAt} IS NULL`
        : sql`${users.deletedAt} IS NULL`;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: users.id,
            email: users.email,
            subscriptionStatus: users.subscriptionStatus,
            notifPrefs: users.notifPrefs,
          })
          .from(users)
          .where(searchFilter)
          .orderBy(desc(users.subscriptionStatus), asc(users.email))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(users)
          .where(searchFilter),
      ]);

      res.json({
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error('Error fetching notification user list:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });

  // PATCH /api/admin/notifications/users/:id/prefs — deep-merge override a user's notif_prefs
  app.patch('/api/admin/notifications/users/:id/prefs', isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const patch = req.body as Partial<NotifPrefs>;

      const [existing] = await db
        .select({ notifPrefs: users.notifPrefs })
        .from(users)
        .where(eq(users.id, id));

      if (!existing) {
        return res.status(404).json({ message: 'User not found' });
      }

      const base = (existing.notifPrefs as NotifPrefs | null) ?? DEFAULT_NOTIF_PREFS;
      const merged: NotifPrefs = { ...base };
      for (const [k, v] of Object.entries(patch)) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_NOTIF_PREFS, k)) continue;
        const key = k as keyof NotifPrefs;
        if (merged[key]) {
          merged[key] = { ...merged[key], ...v, channels: { ...merged[key].channels, ...(v as any).channels } };
        }
      }

      await db
        .update(users)
        .set({ notifPrefs: merged })
        .where(eq(users.id, id));

      console.log(`[Admin] notif_prefs updated for user ${id} by ${req.user?.email ?? req.user?.id}`);
      res.json({ notifPrefs: merged });
    } catch (error) {
      console.error('Error updating notif_prefs:', error);
      res.status(500).json({ message: 'Failed to update preferences' });
    }
  });

  // GET /api/admin/notifications/log — paginated notif_log entries with user email join
  app.get('/api/admin/notifications/log', isAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 25);
      const userId = req.query.userId as string | undefined;
      const offset = (page - 1) * limit;

      const filter = userId
        ? eq(notifLog.userId, userId)
        : undefined;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: notifLog.id,
            userId: notifLog.userId,
            userEmail: users.email,
            eventType: notifLog.eventType,
            channel: notifLog.channel,
            companyName: notifLog.companyName,
            success: notifLog.success,
            errorDetails: notifLog.errorDetails,
            sentAt: notifLog.sentAt,
          })
          .from(notifLog)
          .leftJoin(users, eq(notifLog.userId, users.id))
          .where(filter)
          .orderBy(desc(notifLog.sentAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(notifLog)
          .where(filter),
      ]);

      res.json({ data: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      console.error('Error fetching notif_log:', error);
      res.status(500).json({ message: 'Failed to fetch notification log' });
    }
  });

  // ── GET /api/admin/enrichment-queue ──────────────────────────────────────────
  // Returns queue health stats: status counts, job-type breakdown, recent failures,
  // and stalled in-progress items (locked > 30 min).
  app.get('/api/admin/enrichment-queue', isAdmin, async (_req, res) => {
    try {
      const [statusRows, typeRows, recentFailures, stalled, totals] = await Promise.all([
        // Status counts
        db.execute(sql`
          SELECT status, COUNT(*)::int AS count
          FROM enrichment_queue
          GROUP BY status
          ORDER BY count DESC
        `),
        // Breakdown by job_type × status
        db.execute(sql`
          SELECT job_type, status, COUNT(*)::int AS count
          FROM enrichment_queue
          GROUP BY job_type, status
          ORDER BY job_type, count DESC
        `),
        // Last 15 failed / captcha-blocked items
        db.execute(sql`
          SELECT fingerprint, job_type, status, attempt_count, error_message, last_attempted_at, updated_at
          FROM enrichment_queue
          WHERE status IN ('failed', 'captcha_blocked', 'no_match')
          ORDER BY updated_at DESC
          LIMIT 15
        `),
        // In-progress items locked > 30 minutes (stalled workers)
        db.execute(sql`
          SELECT fingerprint, job_type, locked_by, locked_at
          FROM enrichment_queue
          WHERE status = 'in_progress'
            AND locked_at < NOW() - INTERVAL '30 minutes'
          ORDER BY locked_at ASC
          LIMIT 10
        `),
        // Total and completed counts for progress %
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
          FROM enrichment_queue
        `),
      ]);

      res.json({
        statusCounts:   statusRows.rows,
        jobTypeCounts:  typeRows.rows,
        recentFailures: recentFailures.rows,
        stalled:        stalled.rows,
        total:          (totals.rows[0] as any)?.total    ?? 0,
        completed:      (totals.rows[0] as any)?.completed ?? 0,
      });
    } catch (error) {
      console.error('[Admin] enrichment-queue error:', error);
      res.status(500).json({ message: 'Failed to fetch enrichment queue stats' });
    }
  });
}
