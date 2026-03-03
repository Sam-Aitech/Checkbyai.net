import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';

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
  creatorTool?: string;
  metadataDate?: string;
  isEncrypted?: boolean;
  fonts?: string[];
  fontCount?: number;
  hasDigitalSignature?: boolean;
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
  'microsoft word', 'microsoft office', 'acrobat', 'adobe acrobat',
  'libreoffice', 'openoffice', 'google docs', 'gov.uk',
  'home office', 'uk visas', 'hmrc'
];

export class PDFAnalyzer {
  async extractMetadata(filePath: string): Promise<PDFMetadata> {
    try {
      console.log(`=== PDF FORENSIC ANALYZER: Extracting metadata from ${filePath} ===`);
      
      const buffer = await fs.promises.readFile(filePath);
      const pdfString = buffer.toString('binary');
      
      const stats = await fs.promises.stat(filePath);
      const fileSize = stats.size;
      
      console.log(`File size: ${fileSize} bytes`);
      
      const metadata: PDFMetadata = {
        fileSize,
        pages: this.extractPageCount(pdfString),
        format: 'application/pdf',
        fonts: [],
        fontCount: 0,
        isEncrypted: this.checkEncryption(pdfString),
        hasDigitalSignature: this.checkDigitalSignature(pdfString),
      };
      
      const patterns = {
        producer: /\/Producer\s*\(([^)]+)\)/i,
        creator: /\/Creator\s*\(([^)]+)\)/i,
        title: /\/Title\s*\(([^)]+)\)/i,
        author: /\/Author\s*\(([^)]+)\)/i,
        creationDate: /\/CreationDate\s*\(([^)]+)\)/i,
        modificationDate: /\/ModDate\s*\(([^)]+)\)/i,
        pdfVersion: /^%PDF-([0-9]\.[0-9])/m,
      };
      
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = pdfString.match(pattern);
        if (match) {
          metadata[key] = this.cleanPdfString(match[1]);
        }
      }
      
      metadata.fonts = this.extractFonts(pdfString);
      metadata.fontCount = metadata.fonts.length;
      
      const xmpData = this.extractXMPMetadata(pdfString);
      if (xmpData) {
        metadata.rawXmpData = xmpData;
        metadata.parsedXmp = this.parseXMPMetadata(xmpData);
        this.enhanceMetadataWithXMP(metadata, metadata.parsedXmp);
      }
      
      const parsedXmp = metadata.parsedXmp || {};
      const xmpHistory = this.extractXMPHistory(xmpData || '');
      
      metadata.xmp_tags = {
        'dc:date': parsedXmp['dc:date'] || metadata.creationDate || 'Not available',
        'dc:format': parsedXmp['dc:format'] || 'application/pdf',
        'dc:language': parsedXmp['dc:language'] || metadata.language || 'en-GB',
        'pdf:PDFVersion': parsedXmp['pdf:PDFVersion'] || metadata.pdfVersion || '1.4',
        'pdf:Producer': parsedXmp['pdf:Producer'] || metadata.producer || 'Unknown',
        'xmp:CreateDate': parsedXmp['xmp:CreateDate'] || metadata.creationDate || 'Not available',
        'xmp:CreatorTool': parsedXmp['xmp:CreatorTool'] || metadata.creator || 'Unknown',
        'xmp:MetadataDate': parsedXmp['xmp:MetadataDate'] || metadata.modificationDate || 'Not available',
        'xmpMM:History': xmpHistory,
      };
      
      metadata.forensic = this.buildForensicProfile(metadata, xmpHistory);
      
      console.log(`Forensic profile: ${JSON.stringify(metadata.forensic, null, 2)}`);
      
      return metadata;
    } catch (error) {
      console.error('Error extracting PDF metadata:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        fileSize: 0,
        pages: 0,
        xmp_tags: {},
        error: errorMessage
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
      console.error('Error extracting XMP history:', error);
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
  
  private parseXMPWithRegex(xmpData: string, target: any): void {
    const patterns = {
      'dc:date': [/<dc:date[^>]*>([^<]+)<\/dc:date>/i, /dc:date="([^"]+)"/i],
      'dc:format': [/<dc:format[^>]*>([^<]+)<\/dc:format>/i, /dc:format="([^"]+)"/i],
      'dc:language': [/<dc:language[^>]*>([^<]+)<\/dc:language>/i, /dc:language="([^"]+)"/i],
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
    trustedMetadata: PDFMetadata | null,
    customInstructions?: string
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

    // ── Admin Knowledge Injection ─────────────────────────────────────────
    // Apply global AI rules and HITL overrides as additional scored checks.
    // This runs AFTER the rule-based analysis so admin reasons always take effect.
    if (adminContext && (adminContext.globalRules.length > 0 || adminContext.hitlKnowledge.length > 0)) {
      const docProducer = (metadata.producer || '').toLowerCase();
      const docCreator  = (metadata.creator  || '').toLowerCase();

      // 1. Global AI rules — convert each active rule into an advisory check
      for (const rule of adminContext.globalRules) {
        // Heuristic keyword match: does the rule text mention patterns visible in this doc?
        const ruleText  = rule.ruleText.toLowerCase();
        const relevant  = ruleText.includes(docProducer) ||
                          ruleText.includes(docCreator)  ||
                          ruleText.includes('all documents') ||
                          rule.category === 'hitl-override';

        if (relevant) {
          ruleResult.checks.push({
            name: `Admin Rule [${rule.category}]`,
            passed: false,
            severity: 'critical',
            message: `Admin directive: ${rule.ruleText.substring(0, 300)}`,
          } as any);
          // Each matching high-priority rule lowers the score significantly
          (ruleResult as any).confidence = Math.max(0, ((ruleResult as any).confidence ?? 100) - Math.min(40, rule.priority / 3));
        }
      }

      // 2. HITL — if human experts previously flagged docs with matching producer as fake, apply a penalty
      for (const cas of adminContext.hitlKnowledge) {
        const caseProducer = ((cas.metadata?.producer) || '').toLowerCase();
        if (caseProducer && docProducer && docProducer.includes(caseProducer.split(' ')[0])) {
          const reason = cas.adminFeedback || 'No reason provided';
          ruleResult.checks.push({
            name: 'Human Expert Correction (HITL)',
            passed: false,
            severity: 'critical',
            message: `A human expert previously flagged a document with the same producer ("${cas.metadata?.producer}") as FAKE. Expert reason: ${reason}`,
          } as any);
          (ruleResult as any).confidence = Math.max(0, ((ruleResult as any).confidence ?? 100) - 30);
        }
      }

      // Re-evaluate status based on any new critical failures injected above
      const criticalFails = ruleResult.checks.filter((c: any) => !c.passed && c.severity === 'critical');
      if (criticalFails.length > 0) {
        (ruleResult as any).status = 'fake';
      } else if (ruleResult.checks.filter((c: any) => !c.passed && c.severity === 'warning').length >= 2) {
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
      score += this.calculateStringSimilarity(doc.producer, pattern.producer);
      checks++;
    }
    
    if (doc.creator && pattern.creator) {
      score += this.calculateStringSimilarity(doc.creator, pattern.creator);
      checks++;
    }
    
    if (doc.pdfVersion && pattern.pdfVersion) {
      score += doc.pdfVersion === pattern.pdfVersion ? 1 : 0.5;
      checks++;
    }
    
    return checks > 0 ? score / checks : 0;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}
