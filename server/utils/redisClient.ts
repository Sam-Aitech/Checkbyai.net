import IORedis from "ioredis";

let _redis: IORedis | null = null;

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
    console.log("[RedisCache] Connected and ready.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[RedisCache] Unavailable (${msg}) — search/stats caching disabled.`);
    client.disconnect();
  }
}

/** Retrieves a cached JSON value. Returns null on cache-miss or error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!_redis) return null;
  try {
    const raw = await _redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Stores a value as JSON with a TTL in seconds. Silent no-op on error. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
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
export async function cacheFlushPattern(pattern: string): Promise<number> {
  if (!_redis) return 0;
  try {
    let cursor = "0";
    let deleted = 0;
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
    return 0;
  }
}
