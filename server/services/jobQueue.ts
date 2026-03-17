import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

export const SPONSOR_REFRESH_JOB = 'sponsor-refresh';
export const SCRAPING_JOB = 'scraping-job';

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

/** True when Redis was reachable at startup and BullMQ queues are active. */
export function isQueueAvailable(): boolean { return redisAvailable; }

/**
 * The BullMQ sponsor-refresh queue, or null when Redis is unavailable.
 * Always check isQueueAvailable() before use.
 */
export function getSponsorRefreshQueue(): Queue | null { return sponsorQueue; }

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
    console.log('[JobQueue] Redis connected — BullMQ queues active.');
  } catch (err: any) {
    console.warn(
      `[JobQueue] Redis unavailable (${err.message}). ` +
      `BullMQ disabled — sponsor sync will run inline.`
    );
    probe.disconnect();
    return;
  }

  probe.disconnect();

  // Redis is reachable — create the queue using plain opts (no shared client).
  sponsorQueue = new Queue(SPONSOR_REFRESH_JOB, { connection: redisOpts });
}

/** Registers BullMQ workers. No-op if Redis was unavailable at startup. */
export function setupWorkers(): void {
  if (!redisAvailable) {
    console.log('[JobQueue] Skipping worker setup — Redis not available.');
    return;
  }

  new Worker(
    SPONSOR_REFRESH_JOB,
    async (job: Job) => {
      const { processSponsorRefreshJob } = await import('../workers/sponsorRefreshWorker');
      return processSponsorRefreshJob(job);
    },
    { connection: redisOpts }
  );

  new Worker(
    SCRAPING_JOB,
    async (job: Job) => {
      const { processScrapingJob } = await import('../workers/scrapingWorker');
      return processScrapingJob(job);
    },
    { connection: redisOpts }
  );

  console.log('[JobQueue] BullMQ workers registered.');
}
