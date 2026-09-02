import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import IORedis from 'ioredis';
import * as Sentry from '@sentry/node';
import type { PdfVerifyJobData } from '../workers/pdfVerifyWorker';

export const SPONSOR_REFRESH_JOB = 'sponsor-refresh';
export const SCRAPING_JOB = 'scraping-job';
export const NOTIFICATION_JOB = 'notification-dispatch';
export const PDF_VERIFY_JOB = 'pdf-verify';

// Plain connection options — passed directly to BullMQ so it creates its own
// internal ioredis instance. Avoids the type-mismatch caused by bullmq bundling
// a different ioredis version than the one installed in node_modules.
const redisOpts = {
  host:     process.env.REDIS_HOST     || '127.0.0.1',
  port:     parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null as null,
};

let redisAvailable  = false;
let sponsorQueue:  Queue | null = null;
let notificationQueue: Queue | null = null;
let pdfVerifyQueue: Queue<PdfVerifyJobData> | null = null;

async function runJobWithSentryTrace<T>(
  job: Job,
  queueName: string,
  processor: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan(
    {
      name: `BullMQ ${queueName}`,
      op: 'bullmq.job',
      forceTransaction: true,
    },
    async () => {
      return Sentry.startSpan(
        {
          name: job.name,
          op: 'bullmq.process',
        },
        async () => {
          try {
            return await processor();
          } catch (error) {
            Sentry.captureException(error, {
              tags: {
                queue: queueName,
                jobName: job.name,
              },
              extra: {
                jobId: job.id ?? 'missing-job-id',
                attemptsMade: job.attemptsMade,
              },
            });
            throw error;
          }
        },
      );
    },
  );
}

/** True when Redis was reachable at startup and BullMQ queues are active. */
export function isQueueAvailable(): boolean { return redisAvailable; }

/**
 * The BullMQ sponsor-refresh queue, or null when Redis is unavailable.
 * Always check isQueueAvailable() before use.
 */
export function getSponsorRefreshQueue(): Queue | null { return sponsorQueue; }

/**
 * The BullMQ notification-dispatch queue, or null when Redis is unavailable.
 * Always check isQueueAvailable() before use.
 */
export function getNotificationQueue(): Queue | null { return notificationQueue; }

export function getPdfVerifyQueue(): Queue<PdfVerifyJobData> | null { return pdfVerifyQueue; }

/**
 * Probe Redis with a standalone IORedis connection, then create BullMQ
 * queues + workers only when the ping succeeds.
 * Called once from server/index.ts at startup.
 */
export async function initJobQueue(): Promise<void> {
  // Use a short-lived IORedis client just to verify connectivity.
  const probe = new IORedis({
    host:            redisOpts.host,
    port:            redisOpts.port,
    password:        redisOpts.password,
    connectTimeout:  5000,
    enableOfflineQueue: false,
    lazyConnect:     true,
    maxRetriesPerRequest: null,
  });

  try {
    await probe.connect();
    await probe.ping();
    redisAvailable = true;
    logger.info('[JobQueue] Redis connected — BullMQ queues active.');
  } catch (err: unknown) {
    logger.warn(
      `[JobQueue] Redis unavailable (${err instanceof Error ? err.message : String(err)}). ` +
      `BullMQ disabled — sponsor sync will run inline.`
    );
    probe.disconnect();
    return;
  }

  probe.disconnect();

// Redis is reachable — create the queues using plain opts (no shared client).
// defaultJobOptions give every job a retry policy and bound Redis growth —
// without this, BullMQ defaults to attempts:1 (no retry) and keeps
// completed/failed jobs forever.
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 24 * 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
};

sponsorQueue = new Queue(SPONSOR_REFRESH_JOB, { connection: redisOpts, defaultJobOptions });
notificationQueue = new Queue(NOTIFICATION_JOB, { connection: redisOpts, defaultJobOptions });
pdfVerifyQueue = new Queue<PdfVerifyJobData>(PDF_VERIFY_JOB, { connection: redisOpts, defaultJobOptions });
}

/** Registers BullMQ workers. No-op if Redis was unavailable at startup. */
export function setupWorkers(): void {
  if (!redisAvailable) {
    logger.info('[JobQueue] Skipping worker setup — Redis not available.');
    return;
  }

  new Worker(
    SPONSOR_REFRESH_JOB,
    async (job: Job) => {
      return runJobWithSentryTrace(job, SPONSOR_REFRESH_JOB, async () => {
        const { processSponsorRefreshJob } = await import('../workers/sponsorRefreshWorker');
        return processSponsorRefreshJob(job);
      });
    },
    { connection: redisOpts }
  );

  new Worker(
    SCRAPING_JOB,
    async (job: Job) => {
      return runJobWithSentryTrace(job, SCRAPING_JOB, async () => {
        const { processScrapingJob } = await import('../workers/scrapingWorker');
        return processScrapingJob(job);
      });
    },
    { connection: redisOpts }
  );

  new Worker(
    NOTIFICATION_JOB,
    async (job: Job) => {
      return runJobWithSentryTrace(job, NOTIFICATION_JOB, async () => {
        const { notifyUsersOfEvent } = await import('../services/notificationEngine');
        return notifyUsersOfEvent(job.data);
      });
    },
    { connection: redisOpts, concurrency: 3 }
  );

  new Worker<PdfVerifyJobData>(
    PDF_VERIFY_JOB,
    async (job) => {
      return runJobWithSentryTrace(job, PDF_VERIFY_JOB, async () => {
        const { processPdfVerifyJob } = await import('../workers/pdfVerifyWorker');
        return processPdfVerifyJob(job);
      });
    },
    { connection: redisOpts, concurrency: 2 }
  );

  logger.info('[JobQueue] BullMQ workers registered.');
}
