/**
 * Standardized React Query staleTime values.
 *
 * Rules of thumb:
 *  - FREQUENT  (30s):  user-specific mutable state (watches, preferences)
 *  - NORMAL    (1min):  user uploads / verifications in progress
 *  - INFREQUENT (5min):  batch-processed data (sponsor changes, intelligence)
 *  - STATIC    (1hr):  public reference data (sponsor details, revoked lists)
 *
 *  Use these constants instead of hard-coded numbers so every page stays consistent.
 */

export const STALE_TIMES = {
  /** 30 000 ms – watches, notification prefs, support tickets */
  FREQUENT:   30_000,

  /** 60 000 ms – verifications, directory listing */
  NORMAL:     60_000,

  /** 300 000 ms – sponsor changes, intelligence reports */
  INFREQUENT: 300_000,

  /** 3 600 000 ms – sponsor details, revoked lists, digest */
  STATIC:      3_600_000,
} as const;

export type StaleKey = keyof typeof STALE_TIMES;
