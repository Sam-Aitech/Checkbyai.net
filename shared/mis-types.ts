export type COSVerdict = 'GENUINE' | 'EDITED';

export interface COSCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface COSXmpTags {
  'dc:date': string | null;
  'dc:format': string | null;
  'dc:language': string | null;
  'pdf:PDFVersion': string | null;
  'pdf:Producer': string | null;
  'xmp:CreateDate': string | null;
  'xmp:CreatorTool': string | null;
  'xmp:MetadataDate': string | null;
}

export interface COSPdfProperties {
  author: string | null;
  title: string | null;
  subject: string | null;
  keywords: string | null;
  creationDate: string | null;
  creator: string | null;
  producer: string | null;
  modDate: string | null;
}

export interface COSDocStats {
  characters: number;
  words: number;
  pages: number;
  fileSizeBytes: number;
}

export interface COSForensic {
  incrementalUpdates: number;
  infoXmpConsistency: 'MATCH' | 'MISMATCH' | 'XMP_ABSENT';
  toolFingerprint: string;
  suspiciousIndicators: string[];
}

export interface COSCheckResult {
  verdict: COSVerdict;
  reason: string | null;
  checks: COSCheck[];
  xmpTags: COSXmpTags;
  pdfProperties: COSPdfProperties;
  docStats: COSDocStats;
  forensic: COSForensic;
}
