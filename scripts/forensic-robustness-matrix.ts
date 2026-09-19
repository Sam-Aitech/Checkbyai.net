/**
 * Phase 2 robustness matrix — crosses every structural feature against every
 * synthetic operator and tabulates survival.
 *
 * Reads data/forensic-corpus/v0/manifest.json (no regeneration), computes
 * StructuralFeatures for each seed + derived case with the CURRENT parser,
 * classifies every cell (stable-robust / sensitive / side-effect / blind /
 * volatile / rebuild) and writes ROBUSTNESS_MATRIX.json next to the manifest.
 *
 * Red-team cases are reported separately as a movement exhibit: which (if
 * any) structural signals move when all string-level signals are cloned.
 *
 * Pure measurement — no verdict logic, quarantine never read.
 *
 * Usage:
 *   npx tsx scripts/forensic-robustness-matrix.ts [--corpus data/forensic-corpus/v0]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PDFAnalyzer } from '../server/services/pdfAnalyzer.ts';
import {
  MATRIX_FEATURES,
  classifyCell,
  diffFeatures,
  scoreMatrix,
  type MatrixCell,
} from '../server/services/forensicRobustness.ts';

function parseArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

interface ManifestCase {
  group: string;
  seedId?: string;
  operator?: string;
  file?: string;
  skipped?: boolean;
}

function main(): void {
  const corpusRoot = path.resolve(parseArg('corpus', 'data/forensic-corpus/v0'));
  const manifestPath = path.join(corpusRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    masterSeed: number;
    cases: ManifestCase[];
  };

  const analyzer = new PDFAnalyzer();
  const featuresOf = (relFile: string) =>
    analyzer.extractStructuralFeatures(
      fs.readFileSync(path.join(corpusRoot, relFile)).toString('binary'),
    );

  const cells: MatrixCell[] = [];
  const skipped: string[] = [];

  for (const c of manifest.cases) {
    if (c.group !== 'synthetic' || c.skipped || !c.file || !c.seedId || !c.operator) {
      if (c.skipped) skipped.push(`${c.seedId}:${c.operator}`);
      continue;
    }
    const seedFile = `genuine/${c.seedId}.pdf`;
    const baseline = featuresOf(seedFile);
    const derived = featuresOf(c.file);
    for (const delta of diffFeatures(baseline, derived)) {
      cells.push({
        seedId: c.seedId,
        operator: c.operator,
        field: delta.field,
        baseline: delta.baseline,
        derived: delta.derived,
        moved: delta.moved,
        class: classifyCell(c.operator, delta.field, delta.moved),
      });
    }
  }

  const scores = scoreMatrix(cells);

  // ── Red-team movement exhibit ──────────────────────────────────────────────
  const redteamMovements: Array<{
    file: string;
    operator: string;
    movedFields: string[];
    movedCount: number;
  }> = [];
  for (const c of manifest.cases) {
    if (c.group !== 'redteam' || c.skipped || !c.file || !c.seedId || !c.operator) continue;
    const baseline = featuresOf(`genuine/${c.seedId}.pdf`);
    const derived = featuresOf(c.file);
    const movedFields = diffFeatures(baseline, derived)
      .filter((d) => d.moved)
      .map((d) => `${d.field} (${JSON.stringify(d.baseline)}→${JSON.stringify(d.derived)})`);
    redteamMovements.push({
      file: c.file,
      operator: `${c.seedId}:${c.operator}`,
      movedFields,
      movedCount: movedFields.length,
    });
  }

  const sideEffects = cells.filter((c) => c.class === 'side-effect');
  const blinds = cells.filter((c) => c.class === 'blind');

  const report = {
    generator: 'robustness-matrix-v1',
    masterSeed: manifest.masterSeed,
    cellCount: cells.length,
    scores,
    sideEffects: sideEffects.map((c) => ({
      seed: c.seedId,
      operator: c.operator,
      field: c.field,
      baseline: c.baseline,
      derived: c.derived,
    })),
    blinds: blinds.map((c) => ({
      seed: c.seedId,
      operator: c.operator,
      field: c.field,
    })),
    redteamMovements,
    skipped,
  };

  const outPath = path.join(corpusRoot, 'ROBUSTNESS_MATRIX.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

  const pct = (n: number): string => `${Math.round(n * 100)}%`;
  const lines = [
    `cells=${cells.length} robustness=${pct(scores.robustness)} ` +
      `sensitivity=${scores.sensitivity === null ? 'n/a' : pct(scores.sensitivity)} ` +
      `sideEffects=${sideEffects.length} blinds=${blinds.length}`,
    `counts=${JSON.stringify(scores.counts)}`,
    'perOperator (stability): ' +
      Object.entries(scores.perOperator)
        .map(([op, v]) => `${op}=${v === null ? 'rebuild' : pct(v)}`)
        .join(' '),
    `redteam movements (structural fields moved per attack):`,
    ...redteamMovements.map(
      (r) => `  ${r.operator}: ${r.movedCount === 0 ? '(none)' : ''}${r.movedFields.join('; ')}`,
    ),
    `report=${outPath}`,
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
  process.exit(0);
}

main();
