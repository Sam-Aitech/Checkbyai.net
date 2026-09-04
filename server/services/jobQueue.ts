import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { recordQueueTiming } from '../utils/perfMonitor';
import IORedis from 'ioredis';
import * as Sentry from '@sentry/node';

export const SPONSOR_REFRESH_JOB = 'sponsor-refresh';
export const SCRAPING_JOB = 'scraping-job';
export const NOTIFICATION_JOB = 'notification-dispatch';
export const VERIFICATION_JOB = 'verification-job';

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
let verificationQueue: Queue | null = null;

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
          const serviceStart = Date.now();
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
          } finally {
            const serviceMs = Date.now() - serviceStart;
            const waitMs = job.processedOn && job.timestamp
              ? Math.max(0, job.processedOn - job.timestamp)
              : 0;
            recordQueueTiming(queueName, waitMs, serviceMs);
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

export function getVerificationQueue(): Queue | null { return verificationQueue; }

export async function getQueueCounts(): Promise<Record<string, Record<string, number>>> {
  const entries: Array<[string, Queue | null]> = [
    [SPONSOR_REFRESH_JOB, sponsorQueue],
    [NOTIFICATION_JOB, notificationQueue],
    [VERIFICATION_JOB, verificationQueue],
  ];
  const counts: Record<string, Record<string, number>> = {};
  for (const [name, queue] of entries) {
    if (!queue) {
      counts[name] = { unavailable: 1 };
      continue;
    }
    try {
      counts[name] = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed') as Record<string, number>;
    } catch {
      counts[name] = { error: 1 };
    }
  }
  return counts;
}

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
sponsorQueue = new Queue(SPONSOR_REFRESH_JOB, { connection: redisOpts });
notificationQueue = new Queue(NOTIFICATION_JOB, { connection: redisOpts });
verificationQueue = new Queue(VERIFICATION_JOB, { connection: redisOpts });
}

export type ProcessRole = 'api' | 'worker' | 'all';

export function getProcessRole(): ProcessRole {
  const raw = (process.env.PROCESS_ROLE || 'all').toLowerCase();
  return raw === 'api' || raw === 'worker' ? raw : 'all';
}

/** Registers API-owned BullMQ workers (everything except PDF verification). */
export function setupApiWorkers(): Worker[] {
  if (!redisAvailable) {
    logger.info('[JobQueue] Skipping API worker setup — Redis not available.');
    return [];
  }

  const workers = [
    new Worker(
      SPONSOR_REFRESH_JOB,
      async (job: Job) => {
        return runJobWithSentryTrace(job, SPONSOR_REFRESH_JOB, async () => {
          const { processSponsorRefreshJob } = await import('../workers/sponsorRefreshWorker');
          return processSponsorRefreshJob(job);
        });
      },
      { connection: redisOpts }
    ),

    new Worker(
      SCRAPING_JOB,
      async (job: Job) => {
        return runJobWithSentryTrace(job, SCRAPING_JOB, async () => {
          const { processScrapingJob } = await import('../workers/scrapingWorker');
          return processScrapingJob(job);
        });
      },
      { connection: redisOpts }
    ),

    new Worker(
      NOTIFICATION_JOB,
      async (job: Job) => {
        return runJobWithSentryTrace(job, NOTIFICATION_JOB, async () => {
          const { notifyUsersOfEvent } = await import('../services/notificationEngine');
          return notifyUsersOfEvent(job.data);
        });
      },
      { connection: redisOpts }
    ),
  ];

  logger.info('[JobQueue] API workers registered (sponsor-refresh, scraping, notification-dispatch).');
  return workers;
}

/** Registers only the CPU-bound PDF verification worker. Runs standalone via server/worker.ts. */
export function setupVerificationWorkers(): Worker[] {
  if (!redisAvailable) {
    logger.info('[JobQueue] Skipping verification worker setup — Redis not available.');
    return [];
  }

  const workers = [
    new Worker(
      VERIFICATION_JOB,
      async (job: Job) => {
        return runJobWithSentryTrace(job, VERIFICATION_JOB, async () => {
          const { processVerificationJob } = await import('../workers/verificationWorker');
          return processVerificationJob(job as Job);
        });
      },
      { connection: redisOpts, concurrency: 2 }
    ),
  ];

  logger.info('[JobQueue] Verification worker registered (concurrency 2).');
  return workers;
}

/** Registers all BullMQ workers in-process. Prefer role-split setup in production. */
export function setupWorkers(): Worker[] {
  return [...setupApiWorkers(), ...setupVerificationWorkers()];
}
