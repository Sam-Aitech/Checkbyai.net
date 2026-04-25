import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    console.log('Finding and terminating sessions holding the advisory lock...');
    const result = await db.execute(sql`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE pid IN (
        SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND objid = 7483920
      )
    `);
    console.log('Result:', result.rows);
    
    // Also update any stuck 'running' jobs in the DB to 'failed'
    const updateResult = await db.execute(sql`
      UPDATE monitor_job_runs 
      SET status = 'failed', 
          "errorMessage" = 'Manually cleared stuck lock', 
          "completedAt" = NOW() 
      WHERE status = 'running'
    `);
    console.log('Updated stuck runs in DB.');

    process.exit(0);
  } catch (error) {
    console.error('Error clearing lock:', error);
    process.exit(1);
  }
}

main();