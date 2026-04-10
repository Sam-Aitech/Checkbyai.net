import stringSimilarity from "string-similarity";
import { generateFingerprint, normalizeName } from "./sponsorListFetcher";

export interface CompanyRecord {
  organisationName: string;
  townCity: string | null;
  route: string | null;
  fingerprint: string;
  typeRating?: string | null;
}

/**
 * Configuration for fuzzy matching
 */
export interface FuzzyMatchConfig {
  /** Threshold for considering two names as a match (0.0-1.0) */
  nameThreshold: number;
  /** Require exact town match */
  requireExactTown: boolean;
  /** Require exact route match */
  requireExactRoute: boolean;
}

/**
 * Default configuration for company reconciliation
 * Prioritizes avoiding false positives over catching all renames
 */
export const DEFAULT_FUZZY_CONFIG: FuzzyMatchConfig = {
  nameThreshold: 0.88, // High threshold to avoid false merges
  requireExactTown: true,
  requireExactRoute: true,
};

/**
 * Normalize a string for comparison by removing company suffixes and extra whitespace
 */
function normalizeForComparison(str: string): string {
  return normalizeName(str);
}

/**
 * Check if two company records are a fuzzy match indicating they represent
 * the same entity despite minor name/formatting differences
 */
export function areCompaniesFuzzyMatch(
  prev: CompanyRecord,
  curr: CompanyRecord,
  config: FuzzyMatchConfig = DEFAULT_FUZZY_CONFIG
): boolean {
  // Early exit if fingerprint already matches (exact match)
  if (prev.fingerprint === curr.fingerprint) {
    return true;
  }

  // If we require exact town match and they differ, not a match
  if (config.requireExactTown && prev.townCity !== curr.townCity) {
    return false;
  }

  // If we require exact route match and they differ, not a match
  if (config.requireExactRoute && prev.route !== curr.route) {
    return false;
  }

  // Compare normalized names using string similarity
  const prevNameNormalized = normalizeForComparison(prev.organisationName);
  const currNameNormalized = normalizeForComparison(curr.organisationName);

  const similarity = stringSimilarity.compareTwoStrings(
    prevNameNormalized,
    currNameNormalized
  );

  return similarity >= config.nameThreshold;
}

/**
 * Find the best fuzzy match for a company among a list of candidates
 * Returns the matched record and similarity score, or null if no good match
 */
export function findBestFuzzyMatch(
  target: CompanyRecord,
  candidates: CompanyRecord[],
  config: FuzzyMatchConfig = DEFAULT_FUZZY_CONFIG
): { match: CompanyRecord; similarity: number } | null {
  let bestMatch: CompanyRecord | null = null;
  let bestSimilarity = 0;

  for (const candidate of candidates) {
    // Skip if already an exact fingerprint match (would be handled elsewhere)
    if (target.fingerprint === candidate.fingerprint) {
      continue;
    }

    // Apply same constraints as areCompaniesFuzzyMatch
    if (
      config.requireExactTown &&
      target.townCity !== candidate.townCity
    ) {
      continue;
    }

    if (
      config.requireExactRoute &&
      target.route !== candidate.route
    ) {
      continue;
    }

    const similarity = stringSimilarity.compareTwoStrings(
      normalizeForComparison(target.organisationName),
      normalizeForComparison(candidate.organisationName)
    );

    if (similarity > bestSimilarity && similarity >= config.nameThreshold) {
      bestSimilarity = similarity;
      bestMatch = candidate;
    }
  }

  return bestMatch ? { match: bestMatch, similarity: bestSimilarity } : null;
}

/**
 * Reconcile additions and deletions by finding likely renames/relocations
 * Returns updated lists where matched pairs have been removed
 */
export function reconcileAdditionsDeletions(
  additions: CompanyRecord[],
  deletions: CompanyRecord[],
  config: FuzzyMatchConfig = DEFAULT_FUZZY_CONFIG
): {
  additions: CompanyRecord[];
  deletions: CompanyRecord[];
  matches: Array<{ previous: CompanyRecord; current: CompanyRecord; similarity: number }>;
} {
  const matches: Array<{ previous: CompanyRecord; current: CompanyRecord; similarity: number }> = [];
  const unresolvedAdditions: CompanyRecord[] = [...additions];
  const unresolvedDeletions: CompanyRecord[] = [...deletions];

  // For each addition, try to find a matching deletion
  for (const addition of additions) {
    const matchResult = findBestFuzzyMatch(addition, unresolvedDeletions, config);

    if (matchResult) {
      // Found a match - remove from both lists and record the match
      const { match: deletion, similarity } = matchResult;
      
      matches.push({
        previous: deletion,
        current: addition,
        similarity
      });

      // Remove from unresolved lists
      const additionIndex = unresolvedAdditions.indexOf(addition);
      if (additionIndex !== -1) {
        unresolvedAdditions.splice(additionIndex, 1);
      }

      const deletionIndex = unresolvedDeletions.indexOf(deletion);
      if (deletionIndex !== -1) {
        unresolvedDeletions.splice(deletionIndex, 1);
      }
    }
    // If no match found, addition stays in unresolvedAdditions
  }

  return {
    additions: unresolvedAdditions,
    deletions: unresolvedDeletions,
    matches
  };
}