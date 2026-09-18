import { logger } from "../utils/logger";

export type ForensicContextSource =
  | "global_ai_rules"
  | "trusted_patterns"
  | "human_expert_corrections";

export interface ForensicContextWarning {
  source: ForensicContextSource;
  error: unknown;
}

interface ForensicContextLoaders<TGlobalRule, TTrustedPattern, THitlKnowledge> {
  globalRules: () => Promise<TGlobalRule[]>;
  trustedPatterns: () => Promise<TTrustedPattern[]>;
  hitlKnowledge: () => Promise<THitlKnowledge[]>;
}

interface ForensicContext<TGlobalRule, TTrustedPattern, THitlKnowledge> {
  globalRules: TGlobalRule[];
  trustedPatterns: TTrustedPattern[];
  hitlKnowledge: THitlKnowledge[];
  warnings: ForensicContextSource[];
}

async function loadOptionalContext<T>(
  source: ForensicContextSource,
  verificationId: number,
  loader: () => Promise<T[]>,
  onWarning: (warning: ForensicContextWarning) => void,
): Promise<T[]> {
  try {
    return await loader();
  } catch (error) {
    onWarning({ source, error });
    logger.warn(
      { err: error, verificationId, contextSource: source },
      "Optional AI forensic context unavailable; continuing without it",
    );
    return [];
  }
}

export async function loadAdminForensicContext<
  TGlobalRule,
  TTrustedPattern,
  THitlKnowledge,
>(
  verificationId: number,
  loaders: ForensicContextLoaders<
    TGlobalRule,
    TTrustedPattern,
    THitlKnowledge
  >,
  onWarning: (warning: ForensicContextWarning) => void = () => undefined,
): Promise<
  ForensicContext<TGlobalRule, TTrustedPattern, THitlKnowledge>
> {
  const warnings: ForensicContextSource[] = [];
  const recordWarning = (warning: ForensicContextWarning) => {
    warnings.push(warning.source);
    onWarning(warning);
  };

  const [globalRules, trustedPatterns, hitlKnowledge] = await Promise.all([
    loadOptionalContext(
      "global_ai_rules",
      verificationId,
      loaders.globalRules,
      recordWarning,
    ),
    loadOptionalContext(
      "trusted_patterns",
      verificationId,
      loaders.trustedPatterns,
      recordWarning,
    ),
    loadOptionalContext(
      "human_expert_corrections",
      verificationId,
      loaders.hitlKnowledge,
      recordWarning,
    ),
  ]);

  return {
    globalRules,
    trustedPatterns,
    hitlKnowledge,
    warnings,
  };
}

export function formatForensicSseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}