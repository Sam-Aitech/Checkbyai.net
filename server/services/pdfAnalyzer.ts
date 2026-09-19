import * as fs from 'fs';
import { logger } from '../utils/logger';
import { XMLParser } from 'fast-xml-parser';
import { sanitizeUploadPath, toConfinedFsPath } from '../utils/uploadGuard';
import {
  FORENSIC_FEATURE_SCHEMA_VERSION,
  FORENSIC_PARSER_NAME,
  FORENSIC_PARSER_VERSION,
  producerFamily,
  type IForensicParser,
  type StructuralFeatures,
} from './forensicTypes';

/**
 * Machine-readable signal block appended to auto-created hitl-override rules
 * at flag time (see admin.ts). It records WHICH checks failed on the
 * confirmed fake, in the auditor's own check-ID vocabulary:
 *
 *   Signal(check-ids): check-15, check-17
 *   Signal(producer-family): apache-fop
 *
 * Legacy free-text rows have no block and are permanently display-only:
 * without a recorded signal there is nothing specific to match, so matching
 * would degenerate to the producer-string echo chamber.
 */
export interface AdminSignal {
  checkIds: string[];
  producerFamily: string | null;
}

export function parseAdminSignal(ruleText: unknown): AdminSignal | null {
  if (typeof ruleText !== 'string') return null;
  // Value class excludes newlines so a following Signal(...) line can never bleed in.
  const idMatch = ruleText.match(/Signal\(check-ids\):\s*([a-z0-9\-, ]+)/i);
  if (!idMatch) return null;
  const checkIds = idMatch[1]
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^check-\d{2}$/.test(s));
  if (checkIds.length === 0) return null;
  const famMatch = ruleText.match(/Signal\(producer-family\):\s*(\S+)/i);
  return { checkIds, producerFamily: famMatch ? famMatch[1].toLowerCase() : null };
}

/** Failed check IDs stored on a past verification row (its own cosCheck at flag time). */
export function storedFailedCheckIds(row: unknown): string[] {
  const checks = (row as { analysisDetails?: { cosCheck?: { checks?: unknown } } })?.analysisDetails?.cosCheck?.checks;
  if (!Array.isArray(checks)) return [];
  return checks
    .filter((c) => c && typeof c === 'object' && !(c as { passed?: unknown }).passed)
    .map((c) => {
      const check = c as { checkId?: unknown; name?: unknown };
      const id = typeof check.checkId === 'string' ? check.checkId : check.name;
      return typeof id === 'string' ? id : '';
    })
    .filter((s) => s.length > 0);
}

/**
 * Yields control back to the Node.js event loop, preventing CPU-intensive
 * synchronous operations from starving incoming HTTP requests / webhooks.
 * Must be awaited at strategic points within heavy processing loops.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Runs a single regex match in a deferred microtask so multiple patterns
 * can be composed with Promise.all() for logical parallelism.
 */
function matchAsync(str: string, pattern: RegExp): Promise<RegExpMatchArray | null> {
  return new Promise(resolve => setImmediate(() => resolve(str.match(pattern))));
}

export interface ForensicMetadata {
  producer: string;
  creator: string;
  creatorTool: string;
  created: string;
  modified: string;
  metadataDate: string;
  softwareAgent: string;
  fontCount: number;
  fonts: string[];
  pdfVersion: string;
  fileSize: number;
  pageCount: number;
  isEncrypted: boolean;
  hasDigitalSignature: boolean;
  xmpHistory: XMPHistoryEntry[];
  suspiciousIndicators: string[];
}

export interface XMPHistoryEntry {
  action: string;
  when: string;
  softwareAgent: string;
  changed?: string;
}

export interface PDFMetadata {
  producer?: string;
  creator?: string;
  title?: string;
  subject?: string;
  author?: string;
  creationDate?: string;
  modificationDate?: string;
  trapped?: string;
  pages?: number;
  fileSize?: number;
  pdfVersion?: string;
  language?: string;
  format?: string;
  /**
   * `%PDF-` header version snapshot, captured before XMP merge can overwrite
   * `pdfVersion`. The SMS profile gate (Check 3) judges the header version —
   * XMP's `pdf:PDFVersion` is Check 13's domain. Never derive one from the other.
   */
  pdfVersionHeader?: string;
  creatorTool?: string;
  metadataDate?: string;
  isEncrypted?: boolean;
  fonts?: string[];
  fontCount?: number;
  hasDigitalSignature?: boolean;
  wordCount?: number;
  characterCount?: number;
  forensic?: ForensicMetadata;
  xmp_tags?: {
    'dc:date'?: string;
    'dc:format'?: string;
    'dc:language'?: string;
    'pdf:PDFVersion'?: string;
    'pdf:Producer'?: string;
    'xmp:CreateDate'?: string;
    'xmp:CreatorTool'?: string;
    'xmp:MetadataDate'?: string;
    'xmpMM:History'?: XMPHistoryEntry[];
  };
  rawMetadata?: any;
  rawXmpData?: string;
  parsedXmp?: any;
  [key: string]: any;
}

export interface VerificationResult {
  status: 'genuine' | 'suspicious' | 'fake';
  confidence: number;
  reason: string;
  checks: VerificationCheck[];
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  details?: any;
  /**
   * Provenance of the check. `forensic` (default when absent) = measured from
   * the document bytes and allowed to move the verdict. `advisory` = an
   * administrator note surfaced for context — display-only UNLESS
   * `signalMatched` (same failed check IDs as a confirmed fake): matched
   * advisories carry limited, capped influence and can never fake alone.
   * UI must render advisory rows in a neutral "Administrator notes" section,
   * excluded from pass/fail tallies.
   */
  kind?: 'forensic' | 'advisory';
  /** True when this advisory shares a recorded failure signature with the current doc. */
  signalMatched?: boolean;
}

export interface VerificationAnalysis {
  result: 'genuine' | 'suspicious' | 'fake';
  confidence: number;
  details: {
    metadataVerification: {
      creationDate: { status: string; score: number };
      producer: { status: string; score: number };
      creator: { status: string; score: number };
    };
    patternMatching: {
      documentStructure: number;
      formattingPatterns: number;
      vectorSimilarity: number;
    };
    forensicAnalysis?: {
      producerMatch: boolean;
      dateConsistency: boolean;
      editingHistory: string[];
      suspiciousTools: string[];
    };
  };
  checks?: VerificationCheck[];
}

const SUSPICIOUS_SOFTWARE = [
  'photoshop', 'illustrator', 'gimp', 'inkscape', 'canva',
  'corel', 'affinity', 'paint', 'pixlr', 'fotor',
  'picsart', 'snapseed', 'lightroom', 'capture one'
];

const KNOWN_GENUINE_PRODUCERS = [
  'apache fop',                                          // UK Home Office official COS generator
  'microsoft word', 'microsoft office', 'acrobat', 'adobe acrobat',
  'libreoffice', 'openoffice', 'google docs', 'gov.uk',
  'home office', 'uk visas', 'hmrc'
];

/**
 * Shortest producer/creator string usable as a match key.
 *
 * Guards the empty-string case: `'anything'.includes('')` is always true, so a
 * document whose Producer could not be extracted from the Info dictionary would
 * otherwise appear to match every admin rule in the system at once.
 */
const MIN_PRODUCER_MATCH_LENGTH = 4;

/**
 * Score deducted when a document's metadata cannot be read at all. Sized to push
 * the result below the 'genuine' threshold: an unreadable file is unverifiable,
 * and must be routed to human review rather than passed.
 */
const UNVERIFIABLE_METADATA_PENALTY = 35;

/** True when `text` mentions `value`, ignoring values too short to be meaningful. */
function mentions(text: string, value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= MIN_PRODUCER_MATCH_LENGTH && text.includes(trimmed);
}

export class PDFAnalyzer implements IForensicParser {
  readonly parserName = FORENSIC_PARSER_NAME;
  readonly parserVersion = FORENSIC_PARSER_VERSION;

  /**
   * Deterministic structural feature extraction over the raw PDF binary string.
   *
   * Pure function of `pdfBinary` (no I/O, no randomness, no Date): same bytes
   * always yield the same features. Kept deliberately cheap (bounded scans,
   * sampled entropy) so it can run in the hot path alongside the existing
   * Info/XMP regex pipeline. It does NOT change any verdict — callers attach
   * the result to the internal evidence bundle for offline robustness analysis.
   */
  extractStructuralFeatures(pdfBinary: string): StructuralFeatures {
    const binary = pdfBinary ?? '';
    const startxrefCount = (binary.match(/startxref/g) ?? []).length;
    const isLinearized = /\/Linearized[\s/]/.test(binary.slice(0, 4096));
    const incrementalUpdatesAboveBaseline = Math.max(0, startxrefCount - (isLinearized ? 2 : 1));
    // Standalone `xref` section markers only: the leading `(?<![A-Za-z])`
    // excludes the `xref` substring inside every `startxref` token, which the
    // previous pattern double-counted (an appended revision with a new
    // startxref then looked like a new xref table for the wrong reason).
    const xrefSectionCount = (binary.match(/(?<![A-Za-z])xref(?![A-Za-z])/g) ?? []).length;
    const hasPrevChain = /\/Prev\s+\d+/.test(binary);
    const objectCountEstimate = (binary.match(/\d+\s+\d+\s+obj\b/g) ?? []).length;
    const streamCount = (binary.match(/\bstream\r?\n/g) ?? []).length;
    const fontCountEstimate = this.extractFonts(binary).length;
    const fontDescriptorCount = (binary.match(/\/FontDescriptor/g) ?? []).length;
    const embeddedFontCount = (binary.match(/\/FontFile\d?/g) ?? []).length;
    const textBlockCount = (binary.match(/BT\b[\s\S]*?\bET\b/g) ?? []).length;
    const textOperatorCount = (binary.match(/\b(Tj|TJ|Tm|Tf)\b/g) ?? []).length;
    return {
      schemaVersion: FORENSIC_FEATURE_SCHEMA_VERSION,
      startxrefCount,
      isLinearized,
      incrementalUpdatesAboveBaseline,
      xrefSectionCount,
      hasPrevChain,
      objectCountEstimate,
      streamCount,
      streamLengthMismatchCount: this.countStreamLengthMismatches(binary),
      fontCountEstimate,
      hasUnembeddedFont: fontDescriptorCount > embeddedFontCount,
      textBlockCount,
      textOperatorCount,
      wholeFileEntropyBitsPerByte: this.sampledShannonEntropy(binary),
      fileSizeBytes: binary.length,
    };
  }

  /**
   * Sampled `/Length` integrity check: for up to 50 streams, compares the
   * declared `/Length N` preceding `stream` against the measured bytes until
   * `endstream`. A mismatch means the body was edited without updating the
   * dictionary — invisible to metadata-only checks. Bounded and deterministic.
   */
  private countStreamLengthMismatches(pdfBinary: string): number {
    let mismatches = 0;
    let checked = 0;
    let searchFrom = 0;
    try {
      while (checked < 50) {
        const streamIdx = pdfBinary.indexOf('stream', searchFrom);
        if (streamIdx === -1) break;
        // Only count real stream keywords (followed by CRLF/LF), not prose.
        const after = pdfBinary.slice(streamIdx + 6, streamIdx + 8);
        if (after[0] !== '\r' && after[0] !== '\n') {
          searchFrom = streamIdx + 6;
          continue;
        }
        const dictWindow = pdfBinary.slice(Math.max(0, streamIdx - 512), streamIdx);
        const lengthMatch = dictWindow.match(/\/Length\s+(\d+)(?![\d])/);
        const bodyStart = pdfBinary.indexOf('\n', streamIdx) + 1;
        const endIdx = pdfBinary.indexOf('endstream', bodyStart);
        if (lengthMatch && bodyStart > 0 && endIdx > bodyStart) {
          const declared = parseInt(lengthMatch[1], 10);
          // Body includes the trailing EOL before endstream per spec convention.
          const measured = endIdx - bodyStart;
          if (Number.isFinite(declared) && Math.abs(measured - declared) > 2) mismatches++;
          checked++;
        }
        // Clamp forward: a lone-\r file with no later `\n` yields
        // bodyStart 0 and an endIdx behind the cursor — without the max()
        // the cursor would regress and this loop would never terminate on
        // hostile input. Progress past streamIdx is guaranteed either way.
        searchFrom = Math.max(endIdx === -1 ? streamIdx + 6 : endIdx + 9, streamIdx + 6);
      }
    } catch {
      // Feature extraction must never throw — return best effort.
    }
    return mismatches;
  }

  /**
   * Shannon entropy over a bounded prefix (first 1MiB) so 10MB uploads stay
   * cheap. Deterministic; rounded to 2dp. Documented sampling — not a secret.
   */
  private sampledShannonEntropy(pdfBinary: string): number {
    const N = Math.min(pdfBinary.length, 1024 * 1024);
    if (N === 0) return 0;
    const freq = new Array<number>(256).fill(0);
    for (let i = 0; i < N; i++) freq[pdfBinary.charCodeAt(i) & 0xff]++;
    let entropy = 0;
    for (const count of freq) {
      if (count === 0) continue;
      const p = count / N;
      entropy -= p * Math.log2(p);
    }
    return Math.round(entropy * 100) / 100;
  }

  async extractMetadata(filePath: string): Promise<PDFMetadata> {
    try {
            // Path-traversal guard: assert filePath is inside the uploads directory
            const safePath = toConfinedFsPath(sanitizeUploadPath(filePath));
      const [buffer, stats] = await Promise.all([
          fs.promises.readFile(safePath),
          fs.promises.stat(safePath),
      ]);
      const pdfString = buffer.toString('binary');
      const fileSize = stats.size;

      logger.info(`File size: ${fileSize} bytes`);

      // ── Phase 1: Cheap synchronous checks (fast, no yield needed) ──────────
      const metadata: PDFMetadata = {
        fileSize,
        pages: this.extractPageCount(pdfString),
        format: 'application/pdf',
        fonts: [],
        fontCount: 0,
        isEncrypted: this.checkEncryption(pdfString),
        hasDigitalSignature: this.checkDigitalSignature(pdfString),
      };

      // ── Phase 2: Run all 7 metadata regex patterns in PARALLEL ────────────
      // Previously ran sequentially — each match scanned the full PDF string.
      // Promise.all() allows the event loop to interleave between microtasks,
      // preventing a single request from monopolising the thread.
      const patternEntries: Array<[string, RegExp]> = [
        ['producer',          /\/Producer\s*\(([^)]+)\)/i],
        ['creator',           /\/Creator\s*\(([^)]+)\)/i],
        ['title',             /\/Title\s*\(([^)]+)\)/i],
        ['author',            /\/Author\s*\(([^)]+)\)/i],
        ['creationDate',      /\/CreationDate\s*\(([^)]+)\)/i],
        ['modificationDate',  /\/ModDate\s*\(([^)]+)\)/i],
        ['pdfVersion',        /^%PDF-([0-9]\.[0-9])/m],
      ];

      const patternResults = await Promise.all(
        patternEntries.map(([key, pattern]) =>
          matchAsync(pdfString, pattern).then(match => ({ key, match }))
        )
      );

      for (const { key, match } of patternResults) {
        if (match) {
          metadata[key] = this.cleanPdfString(match[1]);
        }
      }
      // Snapshot the header version BEFORE XMP enhancement below can
      // overwrite `pdfVersion` with the XMP-declared value (Check 3 vs 13).
      if (metadata.pdfVersion) {
        metadata.pdfVersionHeader = metadata.pdfVersion;
      }

      // ── Phase 3: Yield before expensive font extraction ────────────────────
      // extractFonts() runs 3 separate while-loops with exec() over the entire
      // binary string. Yielding before lets the event loop handle any pending
      // I/O (webhook callbacks, health checks, etc.) before this heavy work.
      await yieldToEventLoop();
      metadata.fonts = this.extractFonts(pdfString);
      metadata.fontCount = metadata.fonts.length;

      // ── Phase 3.5: Word and character count from text streams ──────────────
      const textStats = this.extractTextStats(pdfString);
      metadata.wordCount = textStats.wordCount;
      metadata.characterCount = textStats.characterCount;

      // ── Phase 4: XMP extraction (yields before parsing) ───────────────────
      await yieldToEventLoop();
      const xmpData = this.extractXMPMetadata(pdfString);
      if (xmpData) {
        metadata.rawXmpData = xmpData;
        metadata.parsedXmp = this.parseXMPMetadata(xmpData);
        this.enhanceMetadataWithXMP(metadata, metadata.parsedXmp);
      }

      const parsedXmp = metadata.parsedXmp || {};
      const xmpHistory = this.extractXMPHistory(xmpData || '');

      metadata.xmp_tags = {
        'dc:date':          parsedXmp['dc:date']          || metadata.creationDate     || 'Not available',
        'dc:format':        parsedXmp['dc:format']        || 'application/pdf',
        'dc:language':      parsedXmp['dc:language']      || metadata.language         || 'en-GB',
        'pdf:PDFVersion':   parsedXmp['pdf:PDFVersion']   || metadata.pdfVersion       || '1.4',
        'pdf:Producer':     parsedXmp['pdf:Producer']     || metadata.producer         || 'Unknown',
        'xmp:CreateDate':   parsedXmp['xmp:CreateDate']   || metadata.creationDate     || 'Not available',
        'xmp:CreatorTool':  parsedXmp['xmp:CreatorTool']  || metadata.creator          || 'Unknown',
        'xmp:MetadataDate': parsedXmp['xmp:MetadataDate'] || metadata.modificationDate || 'Not available',
        'xmpMM:History':    xmpHistory,
      };

      // ── Phase 5: Forensic profile build (yield before) ────────────────────
      await yieldToEventLoop();
      metadata.forensic = this.buildForensicProfile(metadata, xmpHistory);

      logger.info({ fileSize, fontCount: metadata.fonts.length, xmpHistoryCount: xmpHistory.length }, 'Forensic profile built');

      return metadata;
    } catch (error) {
      logger.error({ err: error }, 'Error extracting PDF metadata:');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        fileSize: 0,
        pages: 0,
        xmp_tags: {},
        error: errorMessage,
      };
    }
  }
  
  private cleanPdfString(str: string): string {
    return str
      .replace(/\\376\\377/g, '')
      .replace(/\\000/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim();
  }
  
  private checkEncryption(pdfString: string): boolean {
    return pdfString.includes('/Encrypt');
  }
  
  private checkDigitalSignature(pdfString: string): boolean {
    return pdfString.includes('/Sig') || pdfString.includes('/ByteRange');
  }
  
  private extractFonts(pdfString: string): string[] {
    const fonts: Set<string> = new Set();
    
    const fontPatterns = [
      /\/BaseFont\s*\/([^\s\/<>\[\]]+)/g,
      /\/FontName\s*\/([^\s\/<>\[\]]+)/g,
      /\/F\d+\s*<<[^>]*\/BaseFont\s*\/([^\s\/<>\[\]]+)/g,
    ];
    
    for (const pattern of fontPatterns) {
      let match;
      while ((match = pattern.exec(pdfString)) !== null) {
        const fontName = match[1].replace(/[+#]/g, ' ').trim();
        if (fontName && fontName.length > 1) {
          fonts.add(fontName);
        }
      }
    }
    
    return Array.from(fonts);
  }
  
  private extractTextStats(pdfString: string): { wordCount: number; characterCount: number } {
    try {
      const btEtRegex = /BT\b[\s\S]*?\bET\b/g;
      let textContent = '';
      let match;
      while ((match = btEtRegex.exec(pdfString)) !== null) {
        const block = match[0];
        const strRegex = /\(([^)\\]|\\.)*\)/g;
        let strMatch;
        while ((strMatch = strRegex.exec(block)) !== null) {
          const raw = strMatch[0].slice(1, -1);
          const cleaned = raw
            .replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ')
            .replace(/\\([0-7]{3})/g, (_, oct) => {
              const code = parseInt(oct, 8);
              return code >= 32 && code < 127 ? String.fromCharCode(code) : ' ';
            })
            .replace(/\\./g, ' ');
          textContent += cleaned + ' ';
        }
      }
      const cleanText = textContent.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleanText) return { wordCount: 0, characterCount: 0 };
      const words = cleanText.split(/\s+/).filter(w => w.length > 0);
      const characterCount = cleanText.replace(/\s/g, '').length;
      return { wordCount: words.length, characterCount };
    } catch {
      return { wordCount: 0, characterCount: 0 };
    }
  }

  private extractXMPHistory(xmpData: string): XMPHistoryEntry[] {
    const history: XMPHistoryEntry[] = [];
    
    try {
      const seqMatch = xmpData.match(/<xmpMM:History>([\s\S]*?)<\/xmpMM:History>/i);
      if (seqMatch) {
        const historyBlock = seqMatch[1];
        
        const liMatches = Array.from(historyBlock.matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi));
        for (const liMatch of liMatches) {
          const entry: XMPHistoryEntry = {
            action: '',
            when: '',
            softwareAgent: '',
          };
          
          const actionMatch = liMatch[1].match(/stEvt:action[^>]*>([^<]+)</i) ||
                              liMatch[1].match(/stEvt:action="([^"]+)"/i);
          if (actionMatch) entry.action = actionMatch[1].trim();
          
          const whenMatch = liMatch[1].match(/stEvt:when[^>]*>([^<]+)</i) ||
                            liMatch[1].match(/stEvt:when="([^"]+)"/i);
          if (whenMatch) entry.when = whenMatch[1].trim();
          
          const agentMatch = liMatch[1].match(/stEvt:softwareAgent[^>]*>([^<]+)</i) ||
                             liMatch[1].match(/stEvt:softwareAgent="([^"]+)"/i);
          if (agentMatch) entry.softwareAgent = agentMatch[1].trim();
          
          const changedMatch = liMatch[1].match(/stEvt:changed[^>]*>([^<]+)</i) ||
                               liMatch[1].match(/stEvt:changed="([^"]+)"/i);
          if (changedMatch) entry.changed = changedMatch[1].trim();
          
          if (entry.action || entry.when || entry.softwareAgent) {
            history.push(entry);
          }
        }
      }
      
      const stEvtMatches = Array.from(xmpData.matchAll(/stEvt:action="([^"]+)"[^>]*stEvt:when="([^"]+)"[^>]*stEvt:softwareAgent="([^"]+)"/gi));
      for (const match of stEvtMatches) {
        const existing = history.find(h => h.when === match[2]);
        if (!existing) {
          history.push({
            action: match[1],
            when: match[2],
            softwareAgent: match[3],
          });
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error extracting XMP history:');
    }
    
    return history;
  }
  
  private buildForensicProfile(metadata: PDFMetadata, xmpHistory: XMPHistoryEntry[]): ForensicMetadata {
    const suspiciousIndicators: string[] = [];
    
    const producer = (metadata.producer || '').toLowerCase();
    const creator = (metadata.creator || '').toLowerCase();
    
    for (const suspicious of SUSPICIOUS_SOFTWARE) {
      if (producer.includes(suspicious) || creator.includes(suspicious)) {
        suspiciousIndicators.push(`Editing software detected: ${suspicious}`);
      }
    }
    
    for (const entry of xmpHistory) {
      const agent = (entry.softwareAgent || '').toLowerCase();
      for (const suspicious of SUSPICIOUS_SOFTWARE) {
        if (agent.includes(suspicious)) {
          suspiciousIndicators.push(`History shows editing with: ${entry.softwareAgent}`);
        }
      }
    }
    
    if (metadata.creationDate && metadata.modificationDate) {
      const created = this.parsePdfDate(metadata.creationDate);
      const modified = this.parsePdfDate(metadata.modificationDate);
      
      if (created && modified) {
        const diffDays = (modified.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 30) {
          suspiciousIndicators.push(`Document modified ${Math.floor(diffDays)} days after creation`);
        }
      }
    }
    
    return {
      producer: metadata.producer || 'Unknown',
      creator: metadata.creator || 'Unknown',
      creatorTool: metadata.creatorTool || metadata.creator || 'Unknown',
      created: metadata.creationDate || 'Unknown',
      modified: metadata.modificationDate || 'Unknown',
      metadataDate: metadata.metadataDate || metadata.modificationDate || 'Unknown',
      softwareAgent: this.extractSoftwareAgent(metadata),
      fontCount: metadata.fontCount || 0,
      fonts: metadata.fonts || [],
      pdfVersion: metadata.pdfVersion || 'Unknown',
      fileSize: metadata.fileSize || 0,
      pageCount: metadata.pages || 0,
      isEncrypted: metadata.isEncrypted || false,
      hasDigitalSignature: metadata.hasDigitalSignature || false,
      xmpHistory,
      suspiciousIndicators,
    };
  }
  
  private extractSoftwareAgent(metadata: PDFMetadata): string {
    if (metadata.parsedXmp?.['xmp:CreatorTool']) {
      return metadata.parsedXmp['xmp:CreatorTool'];
    }
    if (metadata.creator) return metadata.creator;
    if (metadata.producer) return metadata.producer;
    return 'Unknown';
  }
  
  private parsePdfDate(dateString: string): Date | null {
    try {
      const pdfDateMatch = dateString.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (pdfDateMatch) {
        return new Date(
          parseInt(pdfDateMatch[1]),
          parseInt(pdfDateMatch[2]) - 1,
          parseInt(pdfDateMatch[3]),
          parseInt(pdfDateMatch[4]),
          parseInt(pdfDateMatch[5]),
          parseInt(pdfDateMatch[6])
        );
      }
      
      const isoDate = new Date(dateString);
      if (!isNaN(isoDate.getTime())) {
        return isoDate;
      }
      
      return null;
    } catch {
      return null;
    }
  }
  
  private extractPageCount(pdfString: string): number {
    try {
      const countMatch = pdfString.match(/\/Count\s+(\d+)/);
      if (countMatch) {
        return parseInt(countMatch[1], 10);
      }
      const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
      return pageMatches ? pageMatches.length : 1;
    } catch {
      return 1;
    }
  }
  
  private extractXMPMetadata(pdfString: string): string | null {
    try {
      let xmpStart = pdfString.indexOf('<?xpacket begin=');
      if (xmpStart === -1) {
        xmpStart = pdfString.indexOf('<?xpacket');
      }
      
      let xmpEnd = pdfString.indexOf('<?xpacket end=');
      if (xmpEnd === -1) {
        xmpEnd = pdfString.indexOf('</x:xmpmeta>');
        if (xmpEnd !== -1) {
          xmpEnd += '</x:xmpmeta>'.length;
        }
      } else {
        xmpEnd = pdfString.indexOf('?>', xmpEnd) + 2;
      }
      
      if (xmpStart !== -1 && xmpEnd !== -1 && xmpEnd > xmpStart) {
        return pdfString.substring(xmpStart, xmpEnd);
      }
      
      const rdfMatch = pdfString.match(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/i);
      if (rdfMatch) return rdfMatch[0];
      
      return null;
    } catch {
      return null;
    }
  }
  
  private parseXMPMetadata(xmpData: string): any {
    const parsed: any = {};
    
    try {
      let cleanXmp = xmpData.replace(/<\?xpacket[^>]*\?>/g, '');
      
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseAttributeValue: true,
        parseTagValue: true,
        trimValues: true
      });
      
      parser.parse(cleanXmp);
      this.parseXMPWithRegex(xmpData, parsed);
      
    } catch {
      this.parseXMPWithRegex(xmpData, parsed);
    }
    
    return parsed;
  }
  
  /**
   * Builds the match patterns for a Dublin Core property.
   *
   * DC values are normally wrapped in an RDF container — rdf:Seq for dc:date,
   * rdf:Bag for dc:language, rdf:Alt for language-alternative text — rather than
   * written as a bare text node. Apache FOP, the generator behind genuine UK
   * Home Office CoS documents, always emits the container form, so patterns that
   * only match bare text nodes read a valid document as having no DC fields at
   * all. The container form is tried first, then the bare node, then attribute
   * shorthand.
   */
  private dcFieldPatterns(field: string): RegExp[] {
    return [
      new RegExp(String.raw`<${field}[^>]*>\s*<rdf:(?:Seq|Bag|Alt)[^>]*>\s*<rdf:li[^>]*>([^<]+)<\/rdf:li>`, 'i'),
      new RegExp(String.raw`<${field}[^>]*>([^<]+)<\/${field}>`, 'i'),
      new RegExp(`${field}="([^"]+)"`, 'i'),
    ];
  }

  private parseXMPWithRegex(xmpData: string, target: any): void {
    const patterns = {
      'dc:date': this.dcFieldPatterns('dc:date'),
      'dc:format': this.dcFieldPatterns('dc:format'),
      'dc:language': this.dcFieldPatterns('dc:language'),
      'pdf:Producer': [/<pdf:Producer[^>]*>([^<]+)<\/pdf:Producer>/i, /pdf:Producer="([^"]+)"/i],
      'pdf:PDFVersion': [/<pdf:PDFVersion[^>]*>([^<]+)<\/pdf:PDFVersion>/i, /pdf:PDFVersion="([^"]+)"/i],
      'xmp:CreateDate': [/<xmp:CreateDate[^>]*>([^<]+)<\/xmp:CreateDate>/i, /xmp:CreateDate="([^"]+)"/i],
      'xmp:ModifyDate': [/<xmp:ModifyDate[^>]*>([^<]+)<\/xmp:ModifyDate>/i, /xmp:ModifyDate="([^"]+)"/i],
      'xmp:MetadataDate': [/<xmp:MetadataDate[^>]*>([^<]+)<\/xmp:MetadataDate>/i, /xmp:MetadataDate="([^"]+)"/i],
      'xmp:CreatorTool': [/<xmp:CreatorTool[^>]*>([^<]+)<\/xmp:CreatorTool>/i, /xmp:CreatorTool="([^"]+)"/i]
    };
    
    for (const [field, regexList] of Object.entries(patterns)) {
      for (const regex of regexList) {
        const match = xmpData.match(regex);
        if (match && match[1]?.trim()) {
          target[field] = match[1].trim();
          break;
        }
      }
    }
  }
  
  private enhanceMetadataWithXMP(metadata: PDFMetadata, xmpData: any): void {
    if (xmpData['pdf:Producer'] && !metadata.producer) {
      metadata.producer = xmpData['pdf:Producer'];
    }
    if (xmpData['xmp:CreatorTool'] && !metadata.creator) {
      metadata.creator = xmpData['xmp:CreatorTool'];
      metadata.creatorTool = xmpData['xmp:CreatorTool'];
    }
    if (xmpData['xmp:CreateDate'] && !metadata.creationDate) {
      metadata.creationDate = xmpData['xmp:CreateDate'];
    }
    if (xmpData['xmp:ModifyDate'] && !metadata.modificationDate) {
      metadata.modificationDate = xmpData['xmp:ModifyDate'];
    }
    if (xmpData['xmp:MetadataDate']) {
      metadata.metadataDate = xmpData['xmp:MetadataDate'];
    }
    if (xmpData['pdf:PDFVersion']) {
      metadata.pdfVersion = xmpData['pdf:PDFVersion'];
    }
    if (xmpData['dc:language']) {
      metadata.language = xmpData['dc:language'];
    }
  }

  verifyWithRules(
    documentMetadata: PDFMetadata,
    trustedMetadata: PDFMetadata | null
  ): VerificationResult {
    const checks: VerificationCheck[] = [];
    let totalScore = 100;
    
    const docProducer = (documentMetadata.producer || '').toLowerCase();
    const docCreator = (documentMetadata.creator || '').toLowerCase();
    
    for (const suspicious of SUSPICIOUS_SOFTWARE) {
      if (docProducer.includes(suspicious) || docCreator.includes(suspicious)) {
        checks.push({
          name: 'Editing Software Check',
          passed: false,
          severity: 'critical',
          message: `Image editing software detected: ${suspicious.toUpperCase()}`,
          details: { producer: documentMetadata.producer, creator: documentMetadata.creator }
        });
        totalScore -= 50;
      }
    }
    
    if (trustedMetadata) {
      const trustedProducer = (trustedMetadata.producer || '').toLowerCase();
      const docProducerNorm = this.normalizeProducer(docProducer);
      const trustedProducerNorm = this.normalizeProducer(trustedProducer);
      
      if (docProducerNorm !== trustedProducerNorm && trustedProducerNorm !== 'unknown') {
        checks.push({
          name: 'Producer Match',
          passed: false,
          severity: 'critical',
          message: `Document Producer does not match trusted sample`,
          details: {
            documentProducer: documentMetadata.producer,
            trustedProducer: trustedMetadata.producer
          }
        });
        totalScore -= 40;
      } else if (trustedProducerNorm !== 'unknown') {
        checks.push({
          name: 'Producer Match',
          passed: true,
          severity: 'info',
          message: 'Document Producer matches trusted sample'
        });
      }
    }
    
    if (documentMetadata.creationDate && documentMetadata.modificationDate) {
      const created = this.parsePdfDate(documentMetadata.creationDate);
      const modified = this.parsePdfDate(documentMetadata.modificationDate);
      
      if (created && modified) {
        const diffHours = (modified.getTime() - created.getTime()) / (1000 * 60 * 60);
        
        if (diffHours < 0) {
          checks.push({
            name: 'Date Consistency',
            passed: false,
            severity: 'critical',
            message: 'Modification date is before creation date (impossible)',
            details: { created: documentMetadata.creationDate, modified: documentMetadata.modificationDate }
          });
          totalScore -= 50;
        } else if (diffHours > 720) {
          checks.push({
            name: 'Date Consistency',
            passed: false,
            severity: 'warning',
            message: `Document modified ${Math.floor(diffHours / 24)} days after creation`,
            details: { created: documentMetadata.creationDate, modified: documentMetadata.modificationDate }
          });
          totalScore -= 20;
        } else {
          checks.push({
            name: 'Date Consistency',
            passed: true,
            severity: 'info',
            message: 'Creation and modification dates are consistent'
          });
        }
      }
    }
    
    const xmpHistory = documentMetadata.xmp_tags?.['xmpMM:History'] || [];
    if (xmpHistory.length > 0) {
      for (const entry of xmpHistory) {
        const agent = (entry.softwareAgent || '').toLowerCase();
        for (const suspicious of SUSPICIOUS_SOFTWARE) {
          if (agent.includes(suspicious)) {
            checks.push({
              name: 'XMP History Check',
              passed: false,
              severity: 'critical',
              message: `Edit history shows use of: ${entry.softwareAgent}`,
              details: { historyEntry: entry }
            });
            totalScore -= 30;
          }
        }
      }
      
      if (xmpHistory.length > 5) {
        checks.push({
          name: 'Modification Count',
          passed: false,
          severity: 'warning',
          message: `Document has ${xmpHistory.length} recorded modifications`,
          details: { modificationCount: xmpHistory.length }
        });
        totalScore -= 10;
      }
    }
    
    let isGenuineProducer = false;
    for (const genuine of KNOWN_GENUINE_PRODUCERS) {
      if (docProducer.includes(genuine)) {
        isGenuineProducer = true;
        checks.push({
          name: 'Known Producer',
          passed: true,
          severity: 'info',
          message: `Document created with recognized software: ${documentMetadata.producer}`
        });
        break;
      }
    }
    
    if (!isGenuineProducer && documentMetadata.producer) {
      checks.push({
        name: 'Known Producer',
        passed: false,
        severity: 'warning',
        message: `Unknown document producer: ${documentMetadata.producer}`
      });
      totalScore -= 10;
    }

    // A document whose metadata could not be read is unverifiable, not authentic.
    // Absence of evidence must never score the same as evidence of authenticity,
    // so these cases carry enough weight to land on 'suspicious' for human review.
    if (documentMetadata.error) {
      checks.push({
        name: 'Metadata Extraction',
        passed: false,
        severity: 'warning',
        message: `Document metadata could not be read, so authenticity cannot be established: ${documentMetadata.error}`
      });
      totalScore -= UNVERIFIABLE_METADATA_PENALTY;
    } else if (!documentMetadata.producer) {
      checks.push({
        name: 'Known Producer',
        passed: false,
        severity: 'warning',
        message: 'Document has no Producer metadata, so authenticity cannot be established'
      });
      totalScore -= UNVERIFIABLE_METADATA_PENALTY;
    }

    const confidence = Math.max(0, Math.min(100, totalScore));
    
    let status: 'genuine' | 'suspicious' | 'fake';
    let reason: string;
    
    const criticalFailures = checks.filter(c => !c.passed && c.severity === 'critical');
    const warnings = checks.filter(c => !c.passed && c.severity === 'warning');
    
    if (criticalFailures.length > 0) {
      status = 'fake';
      reason = criticalFailures.map(c => c.message).join('; ');
    } else if (warnings.length >= 2 || confidence < 70) {
      status = 'suspicious';
      reason = warnings.length > 0 
        ? warnings.map(c => c.message).join('; ')
        : 'Multiple minor inconsistencies detected';
    } else {
      status = 'genuine';
      reason = 'Document passed all verification checks';
    }
    
    return { status, confidence, reason, checks };
  }
  
  private normalizeProducer(producer: string): string {
    const normalized = producer.toLowerCase().trim();

    // Apache FOP is the official UK Home Office COS generator — all versions are equivalent
    if (normalized.includes('apache') && normalized.includes('fop')) return 'apache-fop';
    if (normalized.includes('microsoft') || normalized.includes('word')) return 'microsoft';
    if (normalized.includes('adobe') || normalized.includes('acrobat')) return 'adobe';
    if (normalized.includes('libreoffice') || normalized.includes('openoffice')) return 'libreoffice';
    if (normalized.includes('google')) return 'google';
    if (normalized.includes('canva')) return 'canva';
    if (normalized.includes('photoshop')) return 'photoshop';
    if (normalized.includes('illustrator')) return 'illustrator';
    if (!normalized || normalized === 'unknown') return 'unknown';

    return normalized;
  }

  async analyzeAgainstTrustedPatterns(
    metadata: PDFMetadata,
    trustedPatterns: any[],
    adminContext?: {
      globalRules: Array<{ category: string; ruleText: string; priority: number }>;
      hitlKnowledge: Array<{ filename: string; result: string; confidence: number; adminFeedback: string | null; metadata: any }>;
      /**
       * Failed 17-gate check IDs for the CURRENT document (computed by the
       * caller via COSAuthenticityChecker BEFORE this call). Enables
       * check-ID signal matching; absent = matchers stay silent.
       */
      currentFailedCheckIds?: string[];
    }
  ): Promise<VerificationAnalysis> {
    let bestMatch: any = null;
    let bestScore = 0;
    
    for (const pattern of trustedPatterns) {
      const patternMetadata = pattern.metadata as PDFMetadata;
      const score = this.calculatePatternMatchScore(metadata, patternMetadata);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = pattern;
      }
    }
    
    const ruleResult = this.verifyWithRules(
      metadata,
      bestMatch?.metadata || null
    );

    // ── Admin Knowledge Injection ───────────────────────────────────────────
    // Default: display-only advisory rows (see P0). The ONLY sanctioned path
    // back to verdict relevance is check-ID signal matching: the note fires
    // with influence iff the current document fails the SAME checks that
    // failed on the confirmed fake — same anomaly, not same producer string.
    // Matched influence stays capped (-20 once) and can never fake alone:
    // no advisory row is ever critical.
    if (adminContext && (adminContext.globalRules.length > 0 || adminContext.hitlKnowledge.length > 0)) {
      const docProducer = (metadata.producer || '').toLowerCase();
      const docCreator  = (metadata.creator  || '').toLowerCase();
      const docFamily = producerFamily(metadata.producer);
      const currentFailed = adminContext.currentFailedCheckIds ?? [];
      const seenAdvisories = new Set<string>();

      // 1. Global AI rules.
      for (const rule of adminContext.globalRules) {
        // Heuristic keyword match: does the rule text mention patterns visible in this doc?
        const ruleText  = rule.ruleText.toLowerCase();
        const relevant  = mentions(ruleText, docProducer) ||
                          mentions(ruleText, docCreator)  ||
                          ruleText.includes('all documents');

        if (!relevant) continue;
        const signal = parseAdminSignal(rule.ruleText);
        if (!signal) {
          // Legacy free-text row: display-only, deduplicated by identity.
          const dedupKey = `rule:${rule.category}:${rule.ruleText.substring(0, 200)}`;
          if (seenAdvisories.has(dedupKey)) continue;
          seenAdvisories.add(dedupKey);
          ruleResult.checks.push({
            name: `Admin Note [${rule.category}]`,
            passed: false,
            severity: 'warning',
            message: `Admin note (does not affect this verdict): ${rule.ruleText.substring(0, 300)}`,
            kind: 'advisory',
          } as any);
          continue;
        }
        // Signal rule: fires with influence only on same-anomaly + same-family.
        // Otherwise silent — a rule about date-skew must not echo on clean docs.
        const overlap = signal.checkIds.filter((id) => currentFailed.includes(id));
        const familyOk = !signal.producerFamily || signal.producerFamily === docFamily;
        if (overlap.length === 0 || !familyOk) continue;
        const dedupKey = `rule-signal:${rule.category}:${overlap.slice().sort().join(',')}`;
        if (seenAdvisories.has(dedupKey)) continue;
        seenAdvisories.add(dedupKey);
        ruleResult.checks.push({
          name: `Admin Note [${rule.category}]`,
          passed: false,
          severity: 'warning',
          message: `Admin note — this document fails the same checks (${overlap.join(', ')}) as a human-confirmed fake: ${rule.ruleText.substring(0, 200)}`,
          kind: 'advisory',
          signalMatched: true,
        } as any);
      }

      // 2. HITL — exact-producer match surfaces context (display-only,
      // deduplicated by producer+reason). Influence requires the stored
      // failure signature: overlap between the old row's failed check IDs
      // (captured at flag time) and the current document's.
      for (const cas of adminContext.hitlKnowledge) {
        const caseProducer = ((cas.metadata?.producer) || '').toLowerCase().trim();
        const isSignificantMatch = caseProducer.length >= MIN_PRODUCER_MATCH_LENGTH &&
          caseProducer === docProducer.trim() &&
          this.normalizeProducer(caseProducer) !== 'unknown';
        if (!isSignificantMatch) continue;
        const reason = cas.adminFeedback || 'No reason provided';
        const dedupKey = `hitl:${caseProducer}:${reason.substring(0, 200)}`;
        if (seenAdvisories.has(dedupKey)) continue;
        seenAdvisories.add(dedupKey);
        const rowFailed = storedFailedCheckIds(cas);
        const matched = rowFailed.length > 0 && rowFailed.some((id) => currentFailed.includes(id));
        ruleResult.checks.push({
          name: 'Human Expert Note (HITL)',
          passed: false,
          severity: 'warning',
          message: matched
            ? `A human expert confirmed a document with the same producer ("${cas.metadata?.producer}") as FAKE on the same checks (${rowFailed.filter((id) => currentFailed.includes(id)).join(', ')}). Expert reason: ${reason}`
            : `A human expert previously flagged a document with the same producer ("${cas.metadata?.producer}") as FAKE. Expert reason: ${reason}. Context only — this document was judged on its own bytes.`,
          kind: 'advisory',
          ...(matched ? { signalMatched: true } : {}),
        } as any);
      }

      // Limited influence: at most one capped deduction no matter how many
      // rows matched, and matched warnings join the suspicious tally (never
      // fake — advisories are never critical). Display-only rows are excluded.
      const matchedRows = ruleResult.checks.filter((c: any) => (c as any).signalMatched);
      if (matchedRows.length > 0) {
        (ruleResult as any).confidence = Math.max(0, ((ruleResult as any).confidence ?? 100) - 20);
      }
      const criticalFails = ruleResult.checks.filter((c: any) => !c.passed && c.severity === 'critical');
      const warningFails = ruleResult.checks.filter(
        (c: any) =>
          !c.passed &&
          c.severity === 'warning' &&
          ((c as any).kind !== 'advisory' || (c as any).signalMatched === true),
      );
      if (criticalFails.length > 0) {
        (ruleResult as any).status = 'fake';
      } else if (warningFails.length >= 2 || ((ruleResult as any).confidence ?? 100) < 70) {
        (ruleResult as any).status = 'suspicious';
      }
    }
    // ─────────────────────────────────────────────────────────────────────
    
    const details = {
      metadataVerification: {
        creationDate: { 
          status: ruleResult.checks.find(c => c.name === 'Date Consistency')?.passed ? 'valid' : 'suspicious',
          score: ruleResult.checks.find(c => c.name === 'Date Consistency')?.passed ? 95 : 40
        },
        producer: { 
          status: ruleResult.checks.find(c => c.name === 'Producer Match')?.passed ? 'recognized' : 'unrecognized',
          score: ruleResult.checks.find(c => c.name === 'Producer Match')?.passed ? 98 : 30
        },
        creator: { 
          status: ruleResult.checks.find(c => c.name === 'Known Producer')?.passed ? 'authentic' : 'unknown',
          score: ruleResult.checks.find(c => c.name === 'Known Producer')?.passed ? 92 : 50
        },
      },
      patternMatching: {
        documentStructure: Math.min(98, bestScore * 100 + 10),
        formattingPatterns: Math.min(96, bestScore * 100 + 5),
        vectorSimilarity: Math.min(94, bestScore * 100),
      },
      forensicAnalysis: {
        producerMatch: ruleResult.checks.find(c => c.name === 'Producer Match')?.passed ?? false,
        dateConsistency: ruleResult.checks.find(c => c.name === 'Date Consistency')?.passed ?? true,
        editingHistory: metadata.forensic?.xmpHistory?.map(h => h.softwareAgent) || [],
        suspiciousTools: metadata.forensic?.suspiciousIndicators || [],
      }
    };

    return {
      result: ruleResult.status,
      confidence: ruleResult.confidence,
      details,
      checks: ruleResult.checks,
    };
  }

  private calculatePatternMatchScore(doc: PDFMetadata, pattern: PDFMetadata): number {
    let score = 0;
    let checks = 0;

    if (doc.producer && pattern.producer) {
      score += this.jaroWinklerSimilarity(doc.producer, pattern.producer);
      checks++;
    }

    if (doc.creator && pattern.creator) {
      score += this.jaroWinklerSimilarity(doc.creator, pattern.creator);
      checks++;
    }

    if (doc.pdfVersion && pattern.pdfVersion) {
      score += doc.pdfVersion === pattern.pdfVersion ? 1 : 0.5;
      checks++;
    }

    return checks > 0 ? score / checks : 0;
  }

  /**
   * Jaro-Winkler similarity — O(N) time complexity, O(N) space.
   *
   * REPLACES: levenshteinDistance() which was O(M×N) time AND space due to
   * 2D matrix allocation. For a single comparison this difference is small,
   * but levenshteinDistance() was called for EVERY trusted pattern (K patterns),
   * making the old per-verification cost O(K × M × N). Jaro-Winkler brings
   * this to O(K × N) — a linear reduction.
   *
   * Jaro-Winkler is particularly well-suited to our use case:
   *   - Producer/creator strings are short (10-50 chars) — ideal for char-window matching
   *   - The prefix bonus rewards strings that share a common software prefix
   *     (e.g., "Adobe Acrobat" vs "Adobe Acrobat DC") which is exactly the pattern
   *     we expect from genuine CoS metadata tools.
   */
  private jaroWinklerSimilarity(s1: string, s2: string): number {
    const a = s1.toLowerCase().trim();
    const b = s2.toLowerCase().trim();

    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
    const aMatches = new Array<boolean>(a.length).fill(false);
    const bMatches = new Array<boolean>(b.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matching chars within window
    for (let i = 0; i < a.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end   = Math.min(i + matchWindow + 1, b.length);

      for (let j = start; j < end; j++) {
        if (bMatches[j] || a[i] !== b[j]) continue;
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0.0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < a.length; i++) {
      if (!aMatches[i]) continue;
      while (!bMatches[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }

    const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

    // Winkler prefix bonus (up to 4 chars)
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
      if (a[i] === b[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }
}

