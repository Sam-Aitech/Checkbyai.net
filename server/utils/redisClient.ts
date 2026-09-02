import IORedis from "ioredis";
import { logger } from "../utils/logger";

let _redis: IORedis | null = null;

const LRU_MAX_ENTRIES = 5_000;
const LRU_MAX_BYTES = 50 * 1024 * 1024;
const LRU_TTL_MS = 300_000;

/**
 * Known internal cache-key glob prefixes. Restricting cacheFlushPattern to
 * this closed set (rather than a bare `string`) makes "must never be
 * user-controlled input" an enforced invariant instead of just a convention.
 */
export type CachePatternPrefix = "watches:*" | "sponsors:*";

type LruEntry = { value: unknown; expiresAt: number; bytes: number };
const lruStore = new Map<string, LruEntry>();
let lruBytes = 0;

function lruGet<T>(key: string): T | null {
  const e = lruStore.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    lruBytes -= e.bytes;
    lruStore.delete(key);
    return null;
  }
  lruStore.delete(key);
  lruStore.set(key, e);
  return e.value as T;
}

/**
 * @param ttlMs How long this LRU entry stays fresh. Defaults to (and is
 * capped at) LRU_TTL_MS. Callers that know the real cache TTL (cacheSet)
 * must pass it explicitly — without this, every entry lived for the full
 * 5 minutes regardless of the caller's actual TTL, so on every normal Redis
 * key expiry (not just an outage) reads could silently fall through to this
 * LRU and serve data up to 5 minutes stale, worst for the 60s-TTL endpoints
 * that exist specifically to reflect near-real-time changes.
 */
function lruSet(key: string, value: unknown, ttlMs: number = LRU_TTL_MS): void {
  const bytes = JSON.stringify(value)?.length ?? 0;
  if (bytes > LRU_MAX_BYTES) return;
  const existing = lruStore.get(key);
  if (existing) {
    lruBytes -= existing.bytes;
    lruStore.delete(key);
  }
  while ((lruStore.size >= LRU_MAX_ENTRIES || lruBytes + bytes > LRU_MAX_BYTES) && lruStore.size > 0) {
    const oldest = lruStore.keys().next().value as string;
    const ev = lruStore.get(oldest)!;
    lruBytes -= ev.bytes;
    lruStore.delete(oldest);
  }
  lruStore.set(key, { value, bytes, expiresAt: Date.now() + Math.min(ttlMs, LRU_TTL_MS) });
}

function lruFlushPattern(pattern: CachePatternPrefix): number {
  // pattern is one of a small closed set of internal cache-key globs (see
  // CachePatternPrefix) — never user input — so building a RegExp from it
  // carries no ReDoS/injection risk despite the pattern not being a literal
  // at this call site.
  // eslint-disable-next-line security/detect-non-literal-regexp
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, String.raw`\$&`).replace(/\*/g, ".*") + "$");
  let n = 0;
  for (const k of lruStore.keys()) {
    if (re.test(k)) {
      const e = lruStore.get(k)!;
      lruBytes -= e.bytes;
      lruStore.delete(k);
      n++;
    }
  }
  return n;
}

export function getLruStats() {
  return { entries: lruStore.size, bytes: lruBytes };
}

/** Returns the shared Redis client, or null when Redis is unavailable. */
export function getRedis(): IORedis | null {
  return _redis;
}

/**
 * Initializes the shared Redis cache client at server startup.
 *
 * Gracefully degrades: if Redis is unreachable the server runs normally —
 * all cache helpers return null/no-op and the in-process fallbacks take over.
 * Called once from server/index.ts alongside initJobQueue().
 */
export async function initRedisCache(): Promise<void> {
  const client = new IORedis({
    host:                 process.env.REDIS_HOST     || "127.0.0.1",
    port:                 parseInt(process.env.REDIS_PORT || "6379"),
    password:             process.env.REDIS_PASSWORD,
    connectTimeout:       3_000,
    maxRetriesPerRequest: 1,
    enableReadyCheck:     false,
  });

  try {
    await client.ping();
    _redis = client;
    logger.info("[RedisCache] Connected and ready.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[RedisCache] Unavailable (${msg}) — search/stats caching disabled.`);
    client.disconnect();
  }
}

/** Retrieves a cached JSON value. Returns null on cache-miss or error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (_redis) {
    try {
      const raw = await _redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        lruSet(key, parsed);
        return parsed;
      }
    } catch {
      // fall through to LRU
    }
  }
  return lruGet<T>(key);
}

/** Stores a value as JSON with a TTL in seconds. Silent no-op on error. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  lruSet(key, value, ttlSeconds * 1000);
  if (!_redis) return;
  try {
    await _redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Non-fatal — live without cache on Redis errors
  }
}

/**
 * Deletes all keys matching a glob pattern using non-blocking SCAN.
 * Returns the number of keys deleted.
 * Uses SCAN (cursor-based) instead of KEYS to avoid blocking large instances.
 */
export async function cacheFlushPattern(pattern: CachePatternPrefix): Promise<number> {
  let deleted = lruFlushPattern(pattern);
  if (!_redis) return deleted;
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await _redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        await _redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");
    return deleted;
  } catch {
    return deleted;
  }
}

/**
 * Centralized cache flusher for all sponsor-related endpoints and jobs.
 * Deletes specific high-traffic sponsor keys directly first, then performs pattern-based flush.
 */
export async function flushSponsorCaches(): Promise<void> {
  if (_redis) {
    const specificKeys = [
      "sponsors:recently-revoked",
      "sponsors:nightly-stats",
      "sponsors:latest-change",
      "sponsors:changes",
      "sponsors:daily-digest:current:v2",
    ];
    try {
      await _redis.del(...specificKeys);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[RedisCache] Failed to delete specific sponsor keys: ${msg}`);
    }
  }
  for (const k of ["sponsors:recently-revoked","sponsors:nightly-stats","sponsors:latest-change","sponsors:changes","sponsors:daily-digest:current:v2"]) {
    lruStore.delete(k);
  }
  await cacheFlushPattern("sponsors:*");
}
