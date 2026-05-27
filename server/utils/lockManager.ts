import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const log = logger.child({ module: "LockManager" });

/**
 * Attempts to acquire a lock for a given job.
 * Uses atomic INSERT ... ON CONFLICT DO UPDATE.
 * Returns true if acquired, false otherwise.
 */
export async function tryAcquireLock(
  jobName: string,
  leaseDurationMs: number,
  lockedBy: string
): Promise<boolean> {
  try {
    const expiresAt = new Date(Date.now() + leaseDurationMs);

    const result = await db.execute(sql`
      INSERT INTO job_locks (job_name, locked_at, locked_by, expires_at)
      VALUES (${jobName}, NOW(), ${lockedBy}, ${expiresAt})
      ON CONFLICT (job_name)
      DO UPDATE SET
        locked_at = EXCLUDED.locked_at,
        locked_by = EXCLUDED.locked_by,
        expires_at = EXCLUDED.expires_at
      WHERE job_locks.expires_at < NOW()
      RETURNING job_name
    `);

    const acquired = result.rows && result.rows.length > 0;
    if (acquired) {
      log.info({ jobName, lockedBy, leaseDurationMs }, "Successfully acquired lock");
    } else {
      log.warn({ jobName, lockedBy }, "Failed to acquire lock (already locked and active)");
    }
    return acquired;
  } catch (err) {
    log.error({ err, jobName, lockedBy }, "Error acquiring lock");
    return false;
  }
}

/**
 * Releases a lock if owned by the specific owner.
 */
export async function releaseLock(
  jobName: string,
  lockedBy: string
): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM job_locks
      WHERE job_name = ${jobName} AND locked_by = ${lockedBy}
    `);
    log.info({ jobName, lockedBy }, "Released lock");
  } catch (err) {
    log.error({ err, jobName, lockedBy }, "Error releasing lock");
  }
}

/**
 * Checks if a valid, non-expired lock exists for the given job.
 */
export async function isLockActive(jobName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT count(*) > 0 AS active
      FROM job_locks
      WHERE job_name = ${jobName} AND expires_at > NOW()
    `);
    const row = result.rows[0] as { active: boolean } | undefined;
    return row?.active === true;
  } catch (err) {
    log.error({ err, jobName }, "Error checking lock active status");
    return false;
  }
}
