/**
 * Corpus generator — populates data/forensic-corpus/v0/{genuine,synthetic,redteam}/.
 *
 * Deterministic: same --seed always yields byte-identical outputs (no Date,
 * no Math.random; per-case sub-seeds derive from masterSeed + seedId + opId).
 * Safe to re-run; it overwrites only files it owns (manifest-tracked).
 *
 * IMPORTANT: genuine seeds here are FIXTURE-DERIVED STAND-INS that mirror the
 * Apache FOP 2.9 CoS structure — they are not captured Home Office PDFs.
 * Every seed ships a .provenance.json sidecar saying exactly that, so a real
 * capture can replace them later without changing the pipeline.
 *
 * Usage:
 *   npx tsx scripts/forensic-corpus-gen.ts [--seed 42] [--out data/forensic-corpus/v0]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  REDTEAM_OPERATORS,
  SYNTHETIC_OPERATORS,
  createRng,
} from '../server/services/forensicCorpusOps.ts';
import {
  FOP_XMP_PLAIN,
  FOP_XMP_WITH_CONTAINERS,
  genuinePdfBinary,
  linearizedPdfBinary,
} from '../server/services/__tests__/fixtures/cosFixtures.ts';

const GENERATOR_VERSION = 'corpus-gen-v1';

function parseArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

/** djb2 — derives stable per-case sub-seeds from strings. */
function hashString(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

interface SeedDef {
  seedId: string;
  build: () => string;
  description: string;
}

const SEEDS: SeedDef[] = [
  {
    seedId: 'seed-fop-v29-container',
    build: () => genuinePdfBinary(FOP_XMP_WITH_CONTAINERS),
    description: 'Apache FOP 2.9, DC values in RDF containers (canonical genuine shape)',
  },
  {
    seedId: 'seed-fop-v29-plain',
    build: () => genuinePdfBinary(FOP_XMP_PLAIN),
    description: 'Apache FOP 2.9, DC values as bare text nodes (alternate config)',
  },
  {
    seedId: 'seed-linearized',
    build: () => linearizedPdfBinary(FOP_XMP_WITH_CONTAINERS),
    description: 'Apache FOP 2.9, linearized (fast web view) — 2x startxref baseline',
  },
];

function main(): void {
  const masterSeed = Number.parseInt(parseArg('seed', '42'), 10);
  if (!Number.isFinite(masterSeed)) throw new Error('--seed must be an integer');
  const outRoot = path.resolve(parseArg('out', 'data/forensic-corpus/v0'));
  const dirs = {
    genuine: path.join(outRoot, 'genuine'),
    synthetic: path.join(outRoot, 'synthetic'),
    redteam: path.join(outRoot, 'redteam'),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

  const manifest: Record<string, unknown>[] = [];
  let written = 0;
  let skipped = 0;

  const writePdf = (dir: string, name: string, binary: string): string => {
    const filePath = path.join(dir, `${name}.pdf`);
    fs.writeFileSync(filePath, Buffer.from(binary, 'binary'));
    written++;
    return sha256Hex(Buffer.from(binary, 'binary'));
  };
  const writeSidecar = (dir: string, name: string, sidecar: Record<string, unknown>): void => {
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(sidecar, null, 2) + '\n');
  };

  // ── Genuine seeds ──────────────────────────────────────────────────────────
  const seedBinaries = new Map<string, string>();
  for (const seed of SEEDS) {
    const binary = seed.build();
    seedBinaries.set(seed.seedId, binary);
    const hash = writePdf(dirs.genuine, seed.seedId, binary);
    writeSidecar(dirs.genuine, seed.seedId, {
      kind: 'fixture-derived-standin',
      seedId: seed.seedId,
      description: seed.description,
      warning:
        'NOT a captured Home Office PDF. Mirrors the FOP 2.9 structure for pipeline development only; replace with provenanced captures when available.',
      sha256: hash,
      generator: GENERATOR_VERSION,
      masterSeed,
    });
    manifest.push({ group: 'genuine', seedId: seed.seedId, file: `genuine/${seed.seedId}.pdf`, sha256: hash });
  }

  // ── Derived cases ──────────────────────────────────────────────────────────
  const runOperators = (
    group: 'synthetic' | 'redteam',
    dir: string,
    ops: typeof SYNTHETIC_OPERATORS,
  ): void => {
    for (const seed of SEEDS) {
      const seedBinary = seedBinaries.get(seed.seedId)!;
      const seedSha = sha256Hex(Buffer.from(seedBinary, 'binary'));
      for (const op of ops) {
        const caseName = `${seed.seedId}__${op.opId}`;
        const subSeed = (masterSeed * 31 + hashString(`${seed.seedId}:${op.opId}`)) >>> 0;
        const result = op.apply(seedBinary, createRng(subSeed));
        if (result.skipped) {
          skipped++;
          writeSidecar(dir, caseName, {
            group,
            seedId: seed.seedId,
            seedSha256: seedSha,
            operator: op.opId,
            skipped: true,
            skippedReason: result.params.skippedReason ?? 'unknown',
            generator: GENERATOR_VERSION,
            masterSeed,
            subSeed,
          });
          manifest.push({ group, seedId: seed.seedId, operator: op.opId, skipped: true });
          continue;
        }
        const hash = writePdf(dir, caseName, result.binary);
        writeSidecar(dir, caseName, {
          group,
          seedId: seed.seedId,
          seedSha256: seedSha,
          operator: op.opId,
          tactic: op.tactic,
          expectedGate: op.expectedGate,
          subSeed,
          operatorParams: result.params,
          sha256: hash,
          generator: GENERATOR_VERSION,
          masterSeed,
        });
        manifest.push({
          group,
          seedId: seed.seedId,
          operator: op.opId,
          file: `${group}/${caseName}.pdf`,
          sha256: hash,
        });
      }
    }
  };

  runOperators('synthetic', dirs.synthetic, SYNTHETIC_OPERATORS);
  runOperators('redteam', dirs.redteam, REDTEAM_OPERATORS);

  fs.writeFileSync(
    path.join(outRoot, 'manifest.json'),
    JSON.stringify({ generator: GENERATOR_VERSION, masterSeed, cases: manifest }, null, 2) + '\n',
  );

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        generator: GENERATOR_VERSION,
        masterSeed,
        outRoot,
        seeds: SEEDS.length,
        syntheticOperators: SYNTHETIC_OPERATORS.length,
        redteamOperators: REDTEAM_OPERATORS.length,
        pdfsWritten: written,
        skippedCases: skipped,
      },
      null,
      2,
    ),
  );
}

main();
