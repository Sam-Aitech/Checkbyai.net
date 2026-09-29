// Short-TTL in-process cache for session deserialization.
//
// passport.deserializeUser runs on EVERY request that carries a session
// cookie, and previously hit the DB (storage.getUser) each time — the single
// hottest authenticated read in the app. A 15s TTL collapses N requests/s
// into ~1 query/user/15s while keeping staleness bounded:
//
//   - Role never changes at runtime (no UPDATE users SET role call sites),
//     so the security-sensitive field cannot go stale in practice.
//   - Profile fields (name, avatar) may lag by up to 15s after a profile
//     update — invisible in the UI (the mutating request itself still sees
//     fresh data from the response payload).
//   - Deleted/unknown users are negatively cached too (same TTL), which
//     stops unauthenticated cookie spam from becoming a DB oracle.
//
// Single-flight: concurrent misses for the same user share one DB query.
// Deliberately in-process (not Redis): this is per-pod request coalescing;
// cross-pod freshness is exactly what the short TTL already provides.

import type { User } from "@shared/schema";

type FetchUser = (userId: string) => Promise<User | undefined>;

interface CacheEntry {
  expiresAt: number;
  value: User | false;
}

const TTL_MS = 15_000;
const MAX_ENTRIES = 5_000;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<User | false>>();

export async function getCachedUser(
  userId: string,
  fetchUser: FetchUser,
): Promise<User | false> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const pending = inflight.get(userId);
  if (pending) return pending;

  const promise = (async (): Promise<User | false> => {
    try {
      const user = (await fetchUser(userId)) ?? false;
      // Re-insert to refresh recency for the LRU-ish eviction below.
      cache.delete(userId);
      if (cache.size >= MAX_ENTRIES) {
        // Maps iterate in insertion order → first key is the oldest entry.
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(userId, { expiresAt: Date.now() + TTL_MS, value: user });
      return user;
    } finally {
      inflight.delete(userId);
    }
  })();

  inflight.set(userId, promise);
  return promise;
}

export function invalidateUserCache(userId?: string): void {
  if (userId) {
    cache.delete(userId);
  } else {
    cache.clear();
  }
}

export function getUserCacheSize(): number {
  return cache.size;
}
