import 'dotenv/config';
import { db } from '../server/db.ts';
import { sponsorCanonical } from '../shared/schema';
import { sql, inArray } from 'drizzle-orm';
import { getArchiveForDate } from '../server/utils/csvArchiver';
import { loadFingerprintSet } from '../server/utils/csvFingerprintBuilder';

// Read-only audit for the 2026-05/06 fingerprint-format migration
// (GOV.UK dropped the Town/City column; fingerprints went from
// "name|town|route" to "name||route" — see migration 0021 and commit
// 4a30855). Reports possible residue, does not fix anything.
async function main() {
  console.log('=== Fingerprint Migration Audit ===');

  // 1. Stale-format fingerprints (old 3-segment pattern with a non-empty
  //    middle segment). Expect 0 after migration 0021's backfill.
  console.log('\n--- Stale-format fingerprints (expect 0) ---');
  const stale = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sponsorCanonical)
    .where(sql`fingerprint ~ '^[^|]*\\|[^|]+\\|'`);
  console.log({ staleFormatCount: stale[0]?.count ?? 0 });

  // 2. Duplicate fingerprints — should be structurally impossible given the
  //    unique constraint, but cheap to verify post-migration.
  console.log('\n--- Duplicate fingerprints (expect none) ---');
  const dupes = await db
    .select({ fingerprint: sponsorCanonical.fingerprint, count: sql<number>`count(*)::int` })
    .from(sponsorCanonical)
    .groupBy(sponsorCanonical.fingerprint)
    .having(sql`count(*) > 1`)
    .limit(20);
  console.table(dupes);

  // 3. ACTIVE/NEWLY_GRANTED rows whose fingerprint isn't in today's archived
  //    fingerprinted CSV. These are invisible to the diff/self-heal
  //    machinery (which keys everything off fingerprint matching) — the
  //    highest-value check, since a corrupted fingerprint here means the
  //    sponsor can never be correctly diffed against the live register.
  console.log('\n--- Active sponsors missing from today\'s fingerprint set ---');
  const today = new Date().toISOString().split('T')[0];
  const archive = await getArchiveForDate(today);
  if (!archive) {
    console.log(`No archive found for ${today} — skipping this check (run after today's job completes).`);
  } else {
    const todaySet = await loadFingerprintSet(archive.fingerprintedFilePath);
    const activeRows = await db
      .select({ id: sponsorCanonical.id, currentName: sponsorCanonical.currentName, fingerprint: sponsorCanonical.fingerprint })
      .from(sponsorCanonical)
      .where(inArray(sponsorCanonical.status, ['ACTIVE', 'NEWLY_GRANTED']));

    const missing = activeRows.filter((r) => !todaySet.has(r.fingerprint));
    console.log(`Checked ${activeRows.length} active/newly-granted rows against ${todaySet.size} fingerprints in today's CSV.`);
    console.log(`Missing: ${missing.length}`);
    if (missing.length > 0) {
      console.table(missing.slice(0, 50).map((r) => ({ id: r.id, name: r.currentName, fingerprint: r.fingerprint })));
      if (missing.length > 50) console.log(`...and ${missing.length - 50} more (truncated).`);
    }
  }

  console.log('\n=== Audit complete. No data was modified. ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
