/**
 * Shadow-mode baseline eval — runs the CHAMPION pipeline (current rules +
 * six-check gate, served verdict logic, zero changes) over the v0 corpus and
 * reports where it stands. Nothing here changes a verdict; it only measures.
 *
 * Metrics: per-group outcome rates, per-operator bypass (combined == genuine),
 * expected-vs-actual surprises, structural-feature means per group, latency
 * P50/P95. Quarantine dir is never read.
 *
 * IMPORTANT: trusted patterns + admin context are intentionally EMPTY — this
 * is the zero-trust baseline (what the pipeline says about the bytes alone).
 *
 * Usage:
 *   npx tsx scripts/forensic-shadow-eval.ts [--corpus data/forensic-corpus/v0]
 *     [--out data/forensic-corpus/v0/SHADOW_BASELINE.json]
 *
 * NOTE: UPLOADS_DIR is pointed at a temp dir BEFORE importing the analyzer
 * (uploadGuard resolves it at module load), hence the dynamic imports below.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function parseArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

interface CaseResult {
  group: string;
  file: string;
  seedId: string | null;
  operator: string | null;
  expectedGate: string | null;
  patternResult: string;
  cosVerdict: string;
  combined: string;
  confidence: number;
  latencyMs: number;
  structural: Record<string, unknown>;
}

async function main(): Promise<void> {
  const corpusRoot = path.resolve(parseArg('corpus', 'data/forensic-corpus/v0'));
  const outPath = path.resolve(parseArg('out', path.join(corpusRoot, 'SHADOW_BASELINE.json')));

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-eval-uploads-'));
  process.env.UPLOADS_DIR = scratch;

  const { PDFAnalyzer } = await import('../server/services/pdfAnalyzer.ts');
  const { COSAuthenticityChecker } = await import('../server/services/cosAuthenticityChecker.ts');
  const { combineWithCosVerdict } = await import('../server/utils/cosVerdictCombiner.ts');

  const analyzer = new PDFAnalyzer();
  const checker = new COSAuthenticityChecker();

  const groups = ['genuine', 'synthetic', 'redteam'] as const;
  const results: CaseResult[] = [];

  for (const group of groups) {
    const dir = path.join(corpusRoot, group);
    if (!fs.existsSync(dir)) continue;
    const pdfs = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort();
    for (const pdf of pdfs) {
      const filePath = path.join(dir, pdf);
      const bytes = fs.readFileSync(filePath);
      const binary = bytes.toString('binary');
      const base = pdf.replace(/\.pdf$/, '');
      let seedId: string | null = null;
      let operator: string | null = null;
      let expectedGate: string | null = null;
      const sidecarPath = path.join(dir, `${base}.json`);
      if (fs.existsSync(sidecarPath)) {
        try {
          const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) as {
            seedId?: string;
            operator?: string;
            expectedGate?: string;
          };
          seedId = sidecar.seedId ?? (group === 'genuine' ? base : null);
          operator = sidecar.operator ?? null;
          expectedGate = sidecar.expectedGate ?? (group === 'genuine' ? 'GENUINE' : null);
        } catch {
          // Sidecar unreadable — record the case anyway with null provenance.
        }
      }

      const started = Date.now();
      // eslint-disable-next-line no-console
      console.error(`[shadow-eval] ${results.length + 1}: ${group}/${pdf}`);
      const tmpFile = path.join(scratch, `${group}-${base}.pdf`);
      fs.writeFileSync(tmpFile, bytes);
      const metadata = await analyzer.extractMetadata(tmpFile);
      const structural = analyzer.extractStructuralFeatures(binary);
      const analysis = await analyzer.analyzeAgainstTrustedPatterns(metadata, [], undefined);
      const cosCheck = checker.check(binary, metadata);
      const combined = combineWithCosVerdict(analysis.result, analysis.confidence, cosCheck.verdict);
      const latencyMs = Date.now() - started;

      results.push({
        group,
        file: `${group}/${pdf}`,
        seedId,
        operator,
        expectedGate,
        patternResult: analysis.result,
        cosVerdict: cosCheck.verdict,
        combined: combined.result,
        confidence: combined.confidence,
        latencyMs,
        structural: structural as unknown as Record<string, unknown>,
      });
      fs.rmSync(tmpFile, { force: true });
    }
  }

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const byGroup: Record<string, { total: number; genuine: number; suspicious: number; fake: number }> = {};
  const byOperator: Record<string, { total: number; bypass: number; expected: string | null }> = {};
  const surprises: Array<{ file: string; expected: string; actual: string }> = [];
  const structuralSums: Record<string, Record<string, { sum: number; n: number }>> = {};
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);

  for (const r of results) {
    const g = (byGroup[r.group] ??= { total: 0, genuine: 0, suspicious: 0, fake: 0 });
    g.total++;
    if (r.combined === 'genuine') g.genuine++;
    else if (r.combined === 'suspicious') g.suspicious++;
    else g.fake++;

    if (r.operator) {
      const key = `${r.group}:${r.operator}`;
      const o = (byOperator[key] ??= { total: 0, bypass: 0, expected: r.expectedGate });
      o.total++;
      if (r.combined === 'genuine') o.bypass++;
    }
    if (r.expectedGate && (r.expectedGate === 'GENUINE') !== (r.combined === 'genuine')) {
      if (!(r.expectedGate === 'NON-GENUINE' && r.combined !== 'genuine')) {
        surprises.push({ file: r.file, expected: r.expectedGate, actual: r.combined });
      }
    }
    const s = (structuralSums[r.group] ??= {});
    for (const [k, v] of Object.entries(r.structural)) {
      if (typeof v !== 'number') continue;
      const cell = (s[k] ??= { sum: 0, n: 0 });
      cell.sum += v;
      cell.n++;
    }
  }

  const structuralMeans: Record<string, Record<string, number>> = {};
  for (const [group, sums] of Object.entries(structuralSums)) {
    structuralMeans[group] = {};
    for (const [k, cell] of Object.entries(sums)) {
      structuralMeans[group][k] = Math.round((cell.sum / cell.n) * 100) / 100;
    }
  }

  const redteam = results.filter((r) => r.group === 'redteam');
  const report = {
    generator: 'shadow-eval-v1',
    corpusRoot,
    caseCount: results.length,
    note: 'Champion pipeline, zero trusted patterns, zero admin context. Quarantine never read.',
    byGroup,
    redteamBypassRate:
      redteam.length === 0 ? null : redteam.filter((r) => r.combined === 'genuine').length / redteam.length,
    byOperator,
    surprises,
    structuralMeans,
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), max: latencies[latencies.length - 1] ?? 0 },
    cases: results,
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

  const lines = [
    `cases=${results.length} groups=${Object.keys(byGroup).join(',')}`,
    ...Object.entries(byGroup).map(
      ([g, s]) => `  ${g}: genuine=${s.genuine}/${s.total} suspicious=${s.suspicious} fake=${s.fake}`,
    ),
    `redteamBypassRate=${report.redteamBypassRate ?? 'n/a'}`,
    `surprises=${surprises.length}`,
    ...surprises.map((s) => `  ! ${s.file}: expected ${s.expected}, got ${s.actual}`),
    `latencyMs p50=${report.latencyMs.p50} p95=${report.latencyMs.p95} max=${report.latencyMs.max}`,
    `report=${outPath}`,
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));

  fs.rmSync(scratch, { recursive: true, force: true });
  // The analyzer's pino transport keeps a worker handle alive; the report is
  // fully written by this point, so exit explicitly instead of hanging.
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
