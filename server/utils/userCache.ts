// Short-TTL in-process cache for session deserialization.
//
// passport.deserializeUser runs on EVERY request that carries a session
// cookie, and previously hit the DB (storage.getUser) each time — the single
// hottest authenticated read in the app. A 15s TTL collapses N requests/s
// into ~1 query/user/15s.
//
// Freshness is enforced, not assumed: every write to the users table calls
// invalidateUserCache(userId) — repository mutators do it automatically (see
// userRepository.ts) and direct db.update(users) call sites do it explicitly.
// Restriction, soft-delete, role, subscription and credit changes therefore
// take effect on the next request from this pod. The TTL is only the bound for
// writes made by OTHER pods (or out-of-band SQL), which this cache cannot see.
//
// Unknown/deleted users are negatively cached for a much shorter window
// (NEGATIVE_TTL_MS): long enough to stop cookie spam becoming a DB oracle,
// short enough that a just-created user is not locked out.
//
// Single-flight: concurrent misses for the same user share one DB query. An
// invalidation that lands while a fetch is in flight discards that fetch's
// result (it may predate the write) and later callers start a fresh fetch.
// Deliberately in-process (not Redis): this is per-pod request coalescing.

import type { User } from "@shared/schema";

type FetchUser = (userId: string) => Promise<User | undefined>;

interface CacheEntry {
  expiresAt: number;
  value: User | false;
}

const TTL_MS = 15_000;
const NEGATIVE_TTL_MS = 2_000;
const MAX_ENTRIES = 5_000;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<User | false>>();
// Bumped on invalidation so an in-flight fetch can tell its result is stale.
const generations = new Map<string, number>();
let clearEpoch = 0;

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

  const startGeneration = generations.get(userId) ?? 0;
  const startEpoch = clearEpoch;

  const promise: Promise<User | false> = (async (): Promise<User | false> => {
    const user = (await Promise.resolve().then(() => fetchUser(userId))) ?? false;
    const invalidatedDuringFetch =
      (generations.get(userId) ?? 0) !== startGeneration || clearEpoch !== startEpoch;
    if (invalidatedDuringFetch) return user;
    // Re-insert to refresh recency for the LRU-ish eviction below.
    cache.delete(userId);
    if (cache.size >= MAX_ENTRIES) {
      // Maps iterate in insertion order → first key is the oldest entry.
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    const ttl = user === false ? NEGATIVE_TTL_MS : TTL_MS;
    cache.set(userId, { expiresAt: Date.now() + ttl, value: user });
    return user;
  })().finally(() => {
    // Only clear our own entry: an invalidation may have replaced it.
    if (inflight.get(userId) === promise) inflight.delete(userId);
  });

  inflight.set(userId, promise);
  return promise;
}

export function invalidateUserCache(userId?: string): void {
  if (userId) {
    if (generations.size >= MAX_ENTRIES) generations.clear();
    generations.set(userId, (generations.get(userId) ?? 0) + 1);
    cache.delete(userId);
    inflight.delete(userId);
    return;
  }
  clearEpoch++;
  generations.clear();
  cache.clear();
  inflight.clear();
}

export function getUserCacheSize(): number {
  return cache.size;
}
