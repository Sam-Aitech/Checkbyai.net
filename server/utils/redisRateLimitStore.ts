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
import { MemoryStore, type IncrementResponse, type Options, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "./redisClient";
import { logger } from "./logger";

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

/**
 * Store that resolves Redis LAZILY, per call.
 *
 * makeRateLimitStore() decides once, when it is called. Limiters are constructed at module
 * import time, before initRedisCache() has connected, so every limiter built that way ran on a
 * per-process MemoryStore for the whole life of the process (limits were per pod, not shared).
 * This store uses Redis as soon as the client exists, and degrades to memory (rather than
 * failing open or erroring requests) if a Redis call fails.
 */
class LazyRateLimitStore implements Store {
  readonly prefix: string;
  private readonly memory = new MemoryStore();
  private redisStore: RedisStore | undefined;
  private redisClient: unknown;
  private options: Options | undefined;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  get localKeys(): boolean {
    return !getRedis();
  }

  init(options: Options): void {
    this.options = options;
    this.memory.init(options);
  }

  private resolve(): Store {
    const client = getRedis();
    if (!client) return this.memory;
    if (!this.redisStore || this.redisClient !== client) {
      this.redisStore = new RedisStore({
        sendCommand: (...args: string[]) =>
          client.call(args[0], ...(args.slice(1) as string[])) as Promise<number>,
        prefix: this.prefix,
      });
      this.redisClient = client;
      if (this.options) void this.redisStore.init?.(this.options);
    }
    return this.redisStore;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const store = this.resolve();
    if (store === this.memory) return this.memory.increment(key);
    try {
      return await store.increment(key);
    } catch (err) {
      logger.warn({ err, prefix: this.prefix }, "[RateLimit] Redis store failed; using in-process counter");
      return this.memory.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const store = this.resolve();
    try {
      await store.decrement(key);
    } catch {
      this.memory.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    const store = this.resolve();
    try {
      await store.resetKey(key);
    } catch {
      this.memory.resetKey(key);
    }
  }
}

export function makeLazyRateLimitStore(prefix: string): Store {
  return new LazyRateLimitStore(prefix);
}
