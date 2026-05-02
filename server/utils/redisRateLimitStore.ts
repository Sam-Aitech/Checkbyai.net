/**
 * redisRateLimitStore.ts
 *
 * Returns a rate-limit-redis RedisStore backed by the shared IORedis client,
 * or `undefined` when Redis is unavailable so express-rate-limit falls back
 * to its in-process memory store automatically.
 *
 * Usage:
 *   import { makeRateLimitStore } from "../utils/redisRateLimitStore";
 *   rateLimit({ store: makeRateLimitStore("prefix:"), ... })
 */
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "./redisClient";

/**
 * Creates a RedisStore for express-rate-limit using the shared Redis client.
 *
 * @param prefix  Key prefix to namespace this limiter in Redis
 *                (e.g. "rl:search:", "rl:auth:"). Each limiter MUST use a
 *                distinct prefix to prevent counter collisions.
 * @returns       A RedisStore instance, or undefined if Redis is unavailable.
 *                express-rate-limit uses its in-process MemoryStore when store
 *                is undefined — providing graceful degradation.
 */
export function makeRateLimitStore(prefix: string): RedisStore | undefined {
  const client = getRedis();
  if (!client) return undefined;

  return new RedisStore({
    // rate-limit-redis v4 sends Redis commands via this async wrapper.
    // Cast args to [string, ...string[]] to satisfy the IORedis call() overload.
    sendCommand: (...args: string[]) =>
      client.call(args[0], ...(args.slice(1) as string[])) as Promise<number>,
    prefix,
  });
}
