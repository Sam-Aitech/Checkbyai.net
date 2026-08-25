import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    console.log('Clearing stuck job_locks entries...');
    const result = await db.execute(sql`
      DELETE FROM job_locks WHERE job_name = 'sponsorMonitorJob'
    `);
    console.log('Cleared lock rows:', result.rowCount ?? result.rows?.length ?? 0);

    // Also update any stuck 'running' jobs in the DB to 'failed'
    const updateResult = await db.execute(sql`
      UPDATE monitor_job_runs
      SET status = 'failed',
          error_message = 'Manually cleared stuck lock',
          completed_at = NOW()
      WHERE status = 'running'
    `);
    console.log('Updated stuck runs in DB:', updateResult.rowCount ?? 0);

    process.exit(0);
  } catch (error) {
    console.error('Error clearing lock:', error);
    process.exit(1);
  }
}

main();
