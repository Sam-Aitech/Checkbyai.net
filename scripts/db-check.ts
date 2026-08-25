import 'dotenv/config';
import { db } from '../server/db.ts';
import { csvArchive, monitorJobRuns, dailyDigest, sponsorChanges, sponsorCanonical } from '../shared/schema';
import { desc, sql } from 'drizzle-orm';

async function main() {
  console.log('=== Database Diagnostic ===');
  try {
    // 1. Recent CSV archives
    console.log('\n--- Recent CSV Archives ---');
    const archives = await db.select({
      snapshotDate: csvArchive.snapshotDate,
      recordCount: csvArchive.recordCount,
      syncStatus: csvArchive.syncStatus,
      isValid: csvArchive.isValid,
      downloadedAt: csvArchive.downloadedAt,
    }).from(csvArchive).orderBy(desc(csvArchive.snapshotDate)).limit(10);
    console.table(archives);

    // 2. Recent monitor job runs
    console.log('\n--- Recent Monitor Job Runs ---');
    const runs = await db.select({
      runDate: monitorJobRuns.runDate,
      status: monitorJobRuns.status,
      recordsProcessed: monitorJobRuns.recordsProcessed,
      changesDetected: monitorJobRuns.changesDetected,
      durationMs: monitorJobRuns.durationMs,
      completedAt: monitorJobRuns.completedAt,
      errorMessage: monitorJobRuns.errorMessage,
    }).from(monitorJobRuns).orderBy(desc(monitorJobRuns.runDate)).limit(10);
    console.table(runs);

    // 3. Recent daily digests (focus on displayedOnLanding)
    console.log('\n--- Recent Daily Digests ---');
    const digests = await db.select({
      snapshotDate: dailyDigest.snapshotDate,
      addedCount: dailyDigest.addedCount,
      removedCount: dailyDigest.removedCount,
      updatedCount: dailyDigest.updatedCount,
      displayedOnLanding: dailyDigest.displayedOnLanding,
      aiModel: dailyDigest.aiModel,
      headlineGenerated: dailyDigest.headlineGenerated,
    }).from(dailyDigest).orderBy(desc(dailyDigest.snapshotDate)).limit(10);
    console.table(digests);

    // 4. Sponsor changes distribution (latest change types)
    console.log('\n--- Recent Sponsor Changes Distribution ---');
    const changes = await db.select({
      changeType: sponsorChanges.changeType,
      organisationName: sponsorChanges.organisationName,
      count: sql<number>`count(*)::int`,
    }).from(sponsorChanges)
      .groupBy(sponsorChanges.changeType, sponsorChanges.organisationName)
      .orderBy(desc(sql`count(*)`))
      .limit(20);
    console.table(changes);

    // 5. Active sponsors count (sanity)
    console.log('\n--- Active Sponsors Count ---');
    const [activeResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(sponsorCanonical)
      .where(sql`status = 'ACTIVE'`);
    console.log({ activeSponsors: activeResult?.count ?? 0 });

  } catch (error) {
    console.error('Error during diagnostics:', error);
  }
  process.exit(0);
}

main();
