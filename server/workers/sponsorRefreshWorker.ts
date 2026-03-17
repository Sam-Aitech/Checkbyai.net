import { Job } from 'bullmq';
import { runSponsorMonitorJob } from '../utils/sponsorMonitorJob';

/**
 * BullMQ worker handler for the sponsor-refresh job.
 *
 * Delegates entirely to runSponsorMonitorJob() — the single source of truth
 * for all reconciliation logic. This eliminates the previous 800-line duplicate
 * that maintained its own copy of every phase, its own lock acquisition, and
 * its own DB writes — all using the same advisory lock key, causing race conditions.
 *
 * runSponsorMonitorJob() handles:
 *   - pg_try_advisory_lock acquisition + release in finally
 *   - CSV download with retries
 *   - 4-phase bulk reconciliation
 *   - Fuse.js index rebuild
 *   - Notification dispatch
 *   - Daily digest generation
 *   - monitorJobRuns logging
 *   - Admin email on failure
 */
export async function processSponsorRefreshJob(job: Job) {
  console.log(`[SponsorRefreshWorker] Job ${job.id} received — delegating to runSponsorMonitorJob().`);

  const result = await runSponsorMonitorJob('background-job', true);

  if (!result.success) {
    // Re-throw so BullMQ marks the job as failed and applies its retry policy.
    throw new Error(result.error ?? 'Sponsor monitor job failed without a specific error message.');
  }

  console.log(
    `[SponsorRefreshWorker] Job ${job.id} complete. ` +
    `Records: ${result.recordsProcessed}, Changes: ${JSON.stringify(result.changes)}`
  );

  return result;
}
