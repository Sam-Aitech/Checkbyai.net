import type { Worker } from 'bullmq';
import { getHeapStatistics } from 'v8';
import { initJobQueue, setupVerificationWorkers, isQueueAvailable } from './services/jobQueue';
import { getDocumentStore } from './services/documentStore';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  logger.info({
    pid: process.pid,
    role: 'worker',
    nodeOptions: process.env.NODE_OPTIONS ?? '(unset)',
    heapLimitMB: Math.round(getHeapStatistics().heap_size_limit / 1024 / 1024),
  }, '[Worker] Starting standalone PDF verification worker');

  await initJobQueue();

  if (!isQueueAvailable()) {
    logger.error('[Worker] Redis unavailable — verification worker cannot run standalone. Exiting.');
    process.exit(1);
  }

  const workers: Worker[] = setupVerificationWorkers();

  try {
    const purged = await getDocumentStore().purgeStale(24 * 60 * 60 * 1000);
    if (purged > 0) logger.info({ purged }, '[Worker] Purged orphaned verification documents');
  } catch (err) {
    logger.warn({ err }, '[Worker] Document orphan purge failed (non-fatal)');
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, '[Worker] Shutting down — closing BullMQ workers');
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, '[Worker] Fatal startup error');
  process.exit(1);
});
