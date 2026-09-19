/**
 * Phase 3 discrimination experiment — challenger vs champion, trusted-seed mode.
 *
 * Trusted set = extracted metadata + structural inventory of the genuine seeds
 * (simulating admin_reference ingestion). For every corpus case it computes the
 * champion verdict (current served logic, zero admin context) and then the
 * challenger verdict (Exp A near-reference content/structural binding + Exp B
 * anachronism). Exp C (text-opcode profile) is measured as a distribution, not
 * a verdict — stand-in seeds carry no text content streams.
 *
 * Measurement only. Promotion bar: red-team bypass cut ≥50% relative AND zero
 * genuine regressions AND a measured FPR on confirmed fakes. The last leg is
 * unmeasurable with no confirmed-fake corpus — the script prints that block
 * explicitly rather than claiming victory.
 *
 * Usage:
 *   npx tsx scripts/forensic-discrimination.ts [--corpus data/forensic-corpus/v0]
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function parseArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

async function main(): Promise<void> {
  const corpusRoot = path.resolve(parseArg('corpus', 'data/forensic-corpus/v0'));
  const manifest = JSON.parse(fs.readFileSync(path.join(corpusRoot, 'manifest.json'), 'utf8')) as {
    masterSeed: number;
    cases: Array<{
      group: string;
      seedId?: string;
      operator?: string;
      file?: string;
      skipped?: boolean;
    }>;
  };
  const invariants = JSON.parse(
    fs.readFileSync(path.join(corpusRoot, '..', 'generation-invariants.json'), 'utf8'),
  );

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'discriminate-uploads-'));
  process.env.UPLOADS_DIR = scratch;

  const { PDFAnalyzer } = await import('../server/services/pdfAnalyzer.ts');
  const { COSAuthenticityChecker } = await import('../server/services/cosAuthenticityChecker.ts');
  const { combineWithCosVerdict } = await import('../server/utils/cosVerdictCombiner.ts');
  const { challengerVerdict } = await import('../server/services/forensicChallengers.ts');

  const analyzer = new PDFAnalyzer();
  const checker = new COSAuthenticityChecker();

  const readBinary = (rel: string): string =>
    fs.readFileSync(path.join(corpusRoot, rel)).toString('binary');

  async function analyse(rel: string): Promise<{ metadata: any; binary: string }> {
    const bytes = fs.readFileSync(path.join(corpusRoot, rel));
    const tmp = path.join(scratch, rel.replace(/[/\\]/g, '_'));
    fs.writeFileSync(tmp, bytes);
    const metadata = await analyzer.extractMetadata(tmp);
    fs.rmSync(tmp, { force: true });
    return { metadata, binary: bytes.toString('binary') };
  }

  // Trusted set = genuine seeds (admin_reference simulation).
  const seedFiles = manifest.cases.filter((c) => c.group === 'genuine' && c.file);
  const trustedMetas: any[] = [];
  const trustedStructurals: Array<{ objectCountEstimate: number }> = [];
  for (const s of seedFiles) {
    const { metadata, binary } = await analyse(s.file!);
    trustedMetas.push(metadata);
    trustedStructurals.push({
      objectCountEstimate: analyzer.extractStructuralFeatures(binary).objectCountEstimate,
    });
  }

  const rows: Array<Record<string, unknown>> = [];
  const opcodeProbe: Array<{ file: string; textBlockCount: number; textOperatorCount: number }> = [];

  const liveCases = manifest.cases.filter((c) => !c.skipped && c.file);
  let done = 0;
  for (const c of liveCases) {
    const { metadata, binary } = await analyse(c.file!);
    const analysis = await analyzer.analyzeAgainstTrustedPatterns(metadata, [], undefined);
    const cosCheck = checker.check(binary, metadata);
    const champion = combineWithCosVerdict(analysis.result, analysis.confidence, cosCheck.verdict);
    const structural = analyzer.extractStructuralFeatures(binary);
    const challenger = challengerVerdict(
      champion.result,
      champion.confidence,
      metadata,
      trustedMetas,
      invariants,
      {
        doc: { objectCountEstimate: structural.objectCountEstimate },
        trusted: trustedStructurals,
      },
    );
    opcodeProbe.push({
      file: c.file!,
      textBlockCount: structural.textBlockCount,
      textOperatorCount: structural.textOperatorCount,
    });
    rows.push({
      group: c.group,
      file: c.file,
      seedId: c.seedId ?? null,
      operator: c.operator ?? null,
      champion: champion.result,
      challenger: challenger.result,
      changed: challenger.changedByChallenger,
      reasons: challenger.challengerReasons,
    });
    done++;
    if (done % 20 === 0) {
      // eslint-disable-next-line no-console
      console.error(`[discriminate] ${done}/${liveCases.length}`);
    }
  }

  const redteam = rows.filter((r) => r.group === 'redteam');
  const genuine = rows.filter((r) => r.group === 'genuine');
  const champBypass = redteam.filter((r) => r.champion === 'genuine').length;
  const challBypass = redteam.filter((r) => r.challenger === 'genuine').length;
  const bypassCut =
    champBypass === 0 ? null : (champBypass - challBypass) / champBypass;
  const genuineRegressions = genuine.filter((r) => (r.challenger as string) !== 'genuine');

  const byOperator: Record<string, { champion: string[]; challenger: string[] }> = {};
  for (const r of redteam) {
    const key = `${r.seedId}:${r.operator}`;
    (byOperator[key] ??= { champion: [], challenger: [] }).champion.push(r.champion as string);
    byOperator[key].challenger.push(r.challenger as string);
  }

  const opcodeValues = new Set(opcodeProbe.map((o) => `${o.textBlockCount}/${o.textOperatorCount}`));

  const report = {
    generator: 'discrimination-v1',
    trustedSeeds: seedFiles.map((s) => s.file),
    caseCount: rows.length,
    championRedteamBypass: `${champBypass}/${redteam.length}`,
    challengerRedteamBypass: `${challBypass}/${redteam.length}`,
    bypassCutRelative: bypassCut,
    genuineRegressions: genuineRegressions.length,
    promotionBar: {
      bypassCutMet: bypassCut !== null && bypassCut >= 0.5,
      zeroGenuineRegressions: genuineRegressions.length === 0,
      fprMeasured: false,
      verdict:
        'BLOCKED: bypass cut and genuine stability are measurable here, but FPR on confirmed fakes is not (quarantine empty). No promotion without it.',
    },
    expC_opcodeProfile: {
      distinctValues: [...opcodeValues],
      conclusion:
        opcodeValues.size === 1
          ? 'BLOCKED: stand-in seeds carry no text content streams — opcode profiling requires real captures.'
          : 'UNBLOCKED: corpus carries text ops — proceed to profile analysis.',
    },
    byOperator,
    rows,
  };

  const outPath = path.join(corpusRoot, 'DISCRIMINATION.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

  const pct = (n: number | null): string => (n === null ? 'n/a' : `${Math.round(n * 100)}%`);
  const lines = [
    `cases=${rows.length} trustedSeeds=${seedFiles.length}`,
    `champion redteam bypass: ${champBypass}/${redteam.length} -> challenger: ${challBypass}/${redteam.length} (cut ${pct(bypassCut)})`,
    `genuine regressions: ${genuineRegressions.length}`,
    ...Object.entries(byOperator).map(
      ([k, v]) => `  ${k}: champion=${v.champion.join(',')} challenger=${v.challenger.join(',')}`,
    ),
    `ExpC opcode distinct (blocks/ops): ${[...opcodeValues].join(' | ')}`,
    `promotion: ${report.promotionBar.verdict}`,
    `report=${outPath}`,
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));

  fs.rmSync(scratch, { recursive: true, force: true });
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
