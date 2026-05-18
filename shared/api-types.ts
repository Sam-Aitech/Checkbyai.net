import type { User, TrustedPattern, VerificationResult } from "./schema";

export interface StatsResponse {
  trustedPatterns: number;
  verificationsToday: number;
  suspiciousDocs?: number;
  successRate?: number;
  totalUsers: number;
  proUsers: number;
}

export interface CheckLimitResponse {
  canVerify: boolean;
  isAnonymous: boolean;
  verificationsLeft: number | 'unlimited';
}

export interface AnalysisDocument {
  id?: number;
  filename?: string;
  result?: string;
  confidence?: number;
  metadata?: {
    xmp_tags?: Record<string, string>;
    creation_date?: string;
    format?: string;
    language?: string;
    pdf_version?: string;
    producer?: string;
    [key: string]: any;
  };
  details?: {
    [key: string]: any;
  };
  [key: string]: any;
}

export type { User, TrustedPattern, VerificationResult };
