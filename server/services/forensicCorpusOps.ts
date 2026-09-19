/**
 * Forensic corpus operators — Phase 1 data work.
 *
 * Pure, seeded, deterministic string surgery for building
 * `data/forensic-corpus/v0/{synthetic,redteam}/` from genuine seeds.
 *
 * Design rules:
 *  - Every operator is a pure function `(binary, rng) -> { binary, params, skipped }`.
 *  - Same (input, seed) always yields the same output. No Date, no Math.random.
 *  - Operators that cannot apply (missing tag/structure) return `skipped: true`
 *    with bytes unchanged — the generator records this instead of crashing.
 *  - `expectedGate` documents what the CURRENT champion gate (6-check +
 *    pattern rules) is believed to say. The shadow eval measures actual vs
 *    expected; surprises are the point.
 *
 * Corpus discipline: outputs are derived-forgery simulations, NOT confirmed
 * fakes. Never train on `suspicious` as `fake`.
 */

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

/** Deterministic PRNG (mulberry32). Seed is recorded in every sidecar. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  };
}

export interface OperatorResult {
  binary: string;
  params: Record<string, unknown>;
  skipped: boolean;
}

export type GateExpectation = 'GENUINE' | 'EDITED' | 'NON-GENUINE';

export interface ForensicOperator {
  opId: string;
  title: string;
  /** What attack or processing step this simulates. */
  tactic: string;
  /** Belief about the current champion gate — eval verifies or refutes. */
  expectedGate: GateExpectation;
  apply(binary: string, rng: Rng): OperatorResult;
}

const ok = (binary: string, params: Record<string, unknown> = {}): OperatorResult => ({
  binary,
  params,
  skipped: false,
});

const skip = (binary: string, reason: string): OperatorResult => ({
  binary,
  params: { skippedReason: reason },
  skipped: true,
});

function replaceFirst(haystack: string, needle: string, replacement: string): string {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return haystack;
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

function replaceLast(haystack: string, needle: string, replacement: string): string {
  const idx = haystack.lastIndexOf(needle);
  if (idx === -1) return haystack;
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

/** Extract one XMP value: container form first, then bare node, then attribute. */
function extractXmpValue(xmp: string, field: string): string | null {
  const escaped = field;
  const container = new RegExp(
    `<${escaped}[^>]*>\\s*<rdf:(?:Seq|Bag|Alt)[^>]*>\\s*<rdf:li[^>]*>([^<]+)</rdf:li>`,
    'i',
  );
  const bare = new RegExp(`<${escaped}[^>]*>([^<]+)</${escaped}>`, 'i');
  const attr = new RegExp(`${escaped}="([^"]+)"`, 'i');
  for (const re of [container, bare, attr]) {
    const m = xmp.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

const XMP_FIELDS = [
  'dc:date',
  'dc:format',
  'dc:language',
  'pdf:PDFVersion',
  'pdf:Producer',
  'xmp:CreateDate',
  'xmp:CreatorTool',
  'xmp:MetadataDate',
] as const;

/** Split out the XMP packet (xpacket form preferred, RDF fallback). */
function splitXmp(binary: string): { before: string; packet: string; after: string } | null {
  const start = binary.indexOf('<?xpacket');
  if (start !== -1) {
    const endMarker = '<?xpacket end=';
    const endIdx = binary.indexOf(endMarker, start);
    if (endIdx !== -1) {
      const close = binary.indexOf('?>', endIdx) + 2;
      return { before: binary.slice(0, start), packet: binary.slice(start, close), after: binary.slice(close) };
    }
    const metaClose = binary.indexOf('</x:xmpmeta>', start);
    if (metaClose !== -1) {
      const close = metaClose + '</x:xmpmeta>'.length;
      return { before: binary.slice(0, start), packet: binary.slice(start, close), after: binary.slice(close) };
    }
  }
  const rdf = binary.match(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/i);
  if (rdf?.index !== undefined) {
    return {
      before: binary.slice(0, rdf.index),
      packet: rdf[0],
      after: binary.slice(rdf.index + rdf[0].length),
    };
  }
  return null;
}

// ── Synthetic operators (14) ─────────────────────────────────────────────────

const xmpValueSwap: ForensicOperator = {
  opId: 'xmp-value-swap',
  title: 'XMP CreateDate altered, Info dict untouched',
  tactic: 'Selective metadata edit — forger changes one XMP timestamp.',
  expectedGate: 'EDITED',
  apply(binary) {
    const needle = '<xmp:CreateDate>2025-07-08T21:59:56Z</xmp:CreateDate>';
    if (!binary.includes(needle)) return skip(binary, 'xmp:CreateDate tag not found');
    return ok(
      replaceFirst(binary, needle, '<xmp:CreateDate>2025-01-15T21:59:56Z</xmp:CreateDate>'),
      { field: 'xmp:CreateDate', from: '2025-07-08T21:59:56Z', to: '2025-01-15T21:59:56Z' },
    );
  },
};

const xmpFieldDrop: ForensicOperator = {
  opId: 'xmp-field-drop',
  title: 'Drop dc:language from XMP',
  tactic: 'Field stripping — tool drops a Dublin Core property.',
  expectedGate: 'EDITED',
  apply(binary) {
    const re = /<dc:language>[\s\S]*?<\/dc:language>/;
    if (!re.test(binary)) return skip(binary, 'dc:language block not found');
    return ok(binary.replace(re, ''), { field: 'dc:language' });
  },
};

const xmpOrderShuffle: ForensicOperator = {
  opId: 'xmp-order-shuffle',
  title: 'Swap first two XMP Description blocks',
  tactic: 'Reordering — serializer emits blocks in a different order.',
  expectedGate: 'EDITED',
  apply(binary) {
    const blocks = binary.match(/<rdf:Description[\s\S]*?<\/rdf:Description>/g);
    if (!blocks || blocks.length < 2) return skip(binary, 'fewer than 2 Description blocks');
    const [first, second] = blocks;
    const SLOT = '__XMP_SWAP_SLOT__';
    if (binary.includes(SLOT)) return skip(binary, 'swap slot collision');
    return ok(
      replaceFirst(replaceFirst(binary, first, SLOT), second, first).replace(SLOT, second),
      { swappedBlocks: 2 },
    );
  },
};

const xmpRebuild: ForensicOperator = {
  opId: 'xmp-rebuild',
  title: 'Strip + re-emit XMP with same values, different order',
  tactic: 'Metadata reconstruction — values preserved, serialization changed.',
  expectedGate: 'EDITED',
  apply(binary) {
    const parts = splitXmp(binary);
    if (!parts) return skip(binary, 'no XMP packet found');
    const values: Record<string, string> = {};
    for (const f of XMP_FIELDS) {
      const v = extractXmpValue(parts.packet, f);
      if (!v) return skip(binary, `cannot extract ${f} for rebuild`);
      values[f] = v;
    }
    const rebuilt =
      `<?xpacket begin="" id="REBUILT"?>` +
      `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
      `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
      `<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">` +
      `<xmp:CreatorTool>${values['xmp:CreatorTool']}</xmp:CreatorTool>` +
      `<xmp:CreateDate>${values['xmp:CreateDate']}</xmp:CreateDate>` +
      `<xmp:MetadataDate>${values['xmp:MetadataDate']}</xmp:MetadataDate>` +
      `</rdf:Description>` +
      `<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">` +
      `<pdf:Producer>${values['pdf:Producer']}</pdf:Producer>` +
      `<pdf:PDFVersion>${values['pdf:PDFVersion']}</pdf:PDFVersion>` +
      `</rdf:Description>` +
      `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
      `<dc:format>${values['dc:format']}</dc:format>` +
      `<dc:language>${values['dc:language']}</dc:language>` +
      `<dc:date>${values['dc:date']}</dc:date>` +
      `</rdf:Description>` +
      `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
    return ok(parts.before + rebuilt + parts.after, { order: 'xmp,pdf,dc (non-canonical)' });
  },
};

const infoProducerSpoof: ForensicOperator = {
  opId: 'info-producer-spoof',
  title: 'FOP 2.3 → FOP 2.9, applied consistently',
  tactic: 'Version drift — all strings agree with each other, but the SMS profile pins 2.3 exactly.',
  expectedGate: 'EDITED',
  apply(binary) {
    if (!binary.includes('Apache FOP Version 2.3')) return skip(binary, 'FOP 2.3 marker not found');
    return ok(binary.split('Apache FOP Version 2.3').join('Apache FOP Version 2.9'), {
      from: 'Apache FOP Version 2.3',
      to: 'Apache FOP Version 2.9',
    });
  },
};

const TOOL_SPOOF_CANDIDATES = ['iLovePDF', 'Canva', 'Smallpdf'] as const;

const toolSpoof: ForensicOperator = {
  opId: 'tool-spoof',
  title: 'Producer rewritten to a consumer editing tool',
  tactic: 'Naive forgery — re-exported through a consumer tool.',
  expectedGate: 'EDITED',
  apply(binary, rng) {
    if (!binary.includes('Apache FOP Version 2.3')) return skip(binary, 'FOP 2.3 marker not found');
    const tool = rng.pick(TOOL_SPOOF_CANDIDATES);
    return ok(binary.split('Apache FOP Version 2.3').join(tool), { tool });
  },
};

const dateSkew: ForensicOperator = {
  opId: 'date-skew',
  title: 'ModDate pushed +36 days past CreationDate',
  tactic: 'Backdate/forward-date — only the modification stamp moves.',
  expectedGate: 'NON-GENUINE',
  apply(binary) {
    if (!binary.includes('D:20250708215956Z')) return skip(binary, 'expected ModDate not found');
    // Move only the LAST occurrence (ModDate), leaving CreationDate fixed.
    return ok(replaceLast(binary, 'D:20250708215956Z', 'D:20250813215956Z'), {
      from: 'D:20250708215956Z',
      to: 'D:20250813215956Z',
      skewDays: 36,
    });
  },
};

const historyInject: ForensicOperator = {
  opId: 'history-inject',
  title: 'Append Photoshop entry to xmpMM:History',
  tactic: 'Edit-trail injection — history records an image editor.',
  expectedGate: 'NON-GENUINE',
  apply(binary) {
    if (!binary.includes('</rdf:RDF>')) return skip(binary, 'no rdf:RDF close tag');
    const entry =
      `<xmpMM:History><rdf:Seq><rdf:li ` +
      `stEvt:action="saved" stEvt:when="2026-09-01T00:00:00Z" ` +
      `stEvt:softwareAgent="Adobe Photoshop 25.0"/>` +
      `</rdf:Seq></xmpMM:History>`;
    return ok(replaceFirst(binary, '</rdf:RDF>', `${entry}</rdf:RDF>`), {
      softwareAgent: 'Adobe Photoshop 25.0',
    });
  },
};

const xrefRebuild: ForensicOperator = {
  opId: 'xref-rebuild',
  title: 'Insert extra xref section without new startxref',
  tactic: 'Tool rebuild — xref re-emitted, revision chain untouched.',
  expectedGate: 'GENUINE',
  apply(binary) {
    if (!binary.includes('trailer')) return skip(binary, 'no trailer keyword');
    return ok(replaceFirst(binary, 'trailer', 'xref\n0 1\n0000000000 65535 f \ntrailer'), {
      inserted: 'xref 0 1',
    });
  },
};

const incrementalAppend: ForensicOperator = {
  opId: 'incremental-append',
  title: 'Append genuine incremental update section',
  tactic:
    'Re-save — new revision appended with Prev chain. The strict SMS 17-gate ' +
    'does not judge revisions (all 17 profile strings intact → GENUINE); the ' +
    'Prev chain + object graft remain recorded in the structural evidence layer.',
  expectedGate: 'GENUINE',
  apply(binary) {
    return ok(
      binary + '8 0 obj\n<< /Changed true >>\nendobj\ntrailer\n<< /Prev 84100 >>\nstartxref\n90500\n%%EOF\n',
      { prev: 84100 },
    );
  },
};

const linearizeToggle: ForensicOperator = {
  opId: 'linearize-toggle',
  title: 'Toggle linearization header',
  tactic: 'Fast-web-view conversion — structural flag flips, content same.',
  expectedGate: 'GENUINE',
  apply(binary) {
    if (binary.includes('/Linearized')) {
      const toggled = binary.replace(/[^\n]*\/Linearized[^\n]*\n/, '');
      if (toggled === binary) return skip(binary, 'linearization line not removable');
      return ok(toggled, { direction: 'strip' });
    }
    // Insert AFTER the %PDF- header line: prepending before the magic would
    // corrupt check 1 (%PDF- must lead the file) and test the wrong thing.
    if (!binary.startsWith('%PDF-1.4\n')) return skip(binary, 'no %PDF-1.4 header line');
    return ok(
      binary.replace('%PDF-1.4\n', '%PDF-1.4\n<< /Linearized 1 /L 84210 /O 4 /E 12000 /N 2 /T 84000 >>\n'),
      { direction: 'add' },
    );
  },
};

const metadataStrip: ForensicOperator = {
  opId: 'metadata-strip',
  title: 'Remove XMP packet entirely',
  tactic: 'Metadata stripping — XMP gone, Info dict remains.',
  expectedGate: 'EDITED',
  apply(binary) {
    const parts = splitXmp(binary);
    if (!parts) return skip(binary, 'no XMP packet found');
    return ok(parts.before + parts.after, { removedBytes: parts.packet.length });
  },
};

const printToPdf: ForensicOperator = {
  opId: 'print-to-pdf',
  title: 'Print-to-PDF re-export (producer swap + XMP strip)',
  tactic: 'Print pipeline — OS driver regenerates the file.',
  expectedGate: 'EDITED',
  apply(binary) {
    let out = binary;
    if (out.includes('Apache FOP Version 2.3')) {
      out = out.split('Apache FOP Version 2.3').join('Microsoft Print to PDF');
    } else if (!out.includes('Microsoft Print to PDF')) {
      return skip(binary, 'no producer marker to replace');
    }
    const parts = splitXmp(out);
    if (parts) out = parts.before + parts.after;
    return ok(out, { producer: 'Microsoft Print to PDF', xmpStripped: true });
  },
};

const IMAGE_ONLY_TEMPLATE = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /XObject /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 10 >>
stream
0123456789
endstream
endobj
5 0 obj
<< /Length 12 >>
stream
/Im0 Do
endstream
endobj
trailer
<< /Root 1 0 R >>
startxref
999
%%EOF
`;

const imageOnlyRebuild: ForensicOperator = {
  opId: 'image-only-rebuild',
  title: 'Rasterize + re-embed as image-only PDF',
  tactic: 'Flattening — text layer destroyed, pages become images.',
  expectedGate: 'EDITED',
  apply(binary) {
    return ok(IMAGE_ONLY_TEMPLATE, { textBlocksExpected: 0 });
  },
};

// ── Red-team operators (3) ───────────────────────────────────────────────────
// Each is engineered to PASS the current string-level gate while changing
// something meaningful. A GENUINE verdict here is a bypass — the exhibit that
// motivates structural/l learned signals.

const rtContentSwap: ForensicOperator = {
  opId: 'rt-content-swap',
  title: 'REDTEAM: alter Title, touch nothing forensic',
  tactic: 'Semantic forgery — visible content changes, all checked strings intact.',
  expectedGate: 'GENUINE',
  apply(binary) {
    const needle = '(Certificate of Sponsorship)';
    if (!binary.includes(needle)) return skip(binary, 'Title marker not found');
    return ok(replaceFirst(binary, needle, '(Certificate of Sponsorship - REPLACEMENT)'), {
      changed: 'Title',
    });
  },
};

const rtHiddenObject: ForensicOperator = {
  opId: 'rt-hidden-object',
  title: 'REDTEAM: graft hidden object before trailer',
  tactic: 'Object graft — body grows with no new revision marker.',
  expectedGate: 'GENUINE',
  apply(binary) {
    if (!binary.includes('trailer')) return skip(binary, 'no trailer keyword');
    return ok(replaceFirst(binary, 'trailer', '99 0 obj\n<< /Hidden true >>\nendobj\ntrailer'), {
      graftedObject: 99,
    });
  },
};

const rtDateClone: ForensicOperator = {
  opId: 'rt-date-clone',
  title: 'REDTEAM: backdate consistently in Info + XMP',
  tactic: 'Consistent backdating — every date agrees, all in the past.',
  expectedGate: 'GENUINE',
  apply(binary) {
    if (!binary.includes('20250708215956Z') && !binary.includes('2025-07-08T21:59:56Z')) {
      return skip(binary, 'expected date markers not found');
    }
    const out = binary.split('20250708215956Z').join('20250115215956Z').split('2025-07-08T21:59:56Z').join('2025-01-15T21:59:56Z');
    if (out === binary) return skip(binary, 'no date markers replaced');
    return ok(out, { backdatedTo: '2025-01-15' });
  },
};

export const SYNTHETIC_OPERATORS: readonly ForensicOperator[] = [
  xmpValueSwap,
  xmpFieldDrop,
  xmpOrderShuffle,
  xmpRebuild,
  infoProducerSpoof,
  toolSpoof,
  dateSkew,
  historyInject,
  xrefRebuild,
  incrementalAppend,
  linearizeToggle,
  metadataStrip,
  printToPdf,
  imageOnlyRebuild,
];

const rtDeepBackdate: ForensicOperator = {
  opId: 'rt-deep-backdate',
  title: 'REDTEAM: backdate consistently to 1999 (pre-XMP, pre-PDF-1.4)',
  tactic:
    'Impossible backdating — every date agrees, but the claimed year predates both the XMP spec (2001) and PDF 1.4 (2001). Champion-blind by design; the anachronism challenger should catch it.',
  expectedGate: 'GENUINE',
  apply(binary) {
    if (!binary.includes('20250708215956Z') && !binary.includes('2025-07-08T21:59:56Z')) {
      return skip(binary, 'expected date markers not found');
    }
    const out = binary
      .split('20250708215956Z')
      .join('19990115215956Z')
      .split('2025-07-08T21:59:56Z')
      .join('1999-01-15T21:59:56Z');
    if (out === binary) return skip(binary, 'no date markers replaced');
    return ok(out, { backdatedTo: '1999-01-15', impossible: 'pre-XMP, pre-PDF-1.4' });
  },
};

export const REDTEAM_OPERATORS: readonly ForensicOperator[] = [
  rtContentSwap,
  rtHiddenObject,
  rtDateClone,
  rtDeepBackdate,
];

export const ALL_OPERATORS: readonly ForensicOperator[] = [
  ...SYNTHETIC_OPERATORS,
  ...REDTEAM_OPERATORS,
];

export function findOperator(opId: string): ForensicOperator | undefined {
  return ALL_OPERATORS.find((op) => op.opId === opId);
}
