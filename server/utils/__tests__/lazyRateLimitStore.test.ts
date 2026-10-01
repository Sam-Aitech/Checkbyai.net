import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  redis: null as any,
  redisIncrement: vi.fn(),
  constructed: 0,
}));

vi.mock("../redisClient", () => ({ getRedis: () => h.redis }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("rate-limit-redis", () => ({
  RedisStore: class {
    constructor() {
      h.constructed++;
    }
    init() {}
    increment(key: string) {
      return h.redisIncrement(key);
    }
    decrement() {}
    resetKey() {}
  },
}));

const { makeLazyRateLimitStore } = await import("../redisRateLimitStore");

describe("makeLazyRateLimitStore", () => {
  beforeEach(() => {
    h.redis = null;
    h.constructed = 0;
    h.redisIncrement.mockReset();
  });

  it("counts in-process while Redis is not yet connected, as limiters are built before initRedisCache()", async () => {
    const store = makeLazyRateLimitStore("rl:test:");
    store.init!({ windowMs: 60_000 } as any);
    expect((await store.increment("k")).totalHits).toBe(1);
    expect((await store.increment("k")).totalHits).toBe(2);
    expect(h.constructed).toBe(0);
  });

  it("switches to Redis as soon as the client appears, without rebuilding the limiter", async () => {
    const store = makeLazyRateLimitStore("rl:test:");
    store.init!({ windowMs: 60_000 } as any);
    await store.increment("k");
    h.redis = { call: vi.fn() };
    h.redisIncrement.mockResolvedValue({ totalHits: 41, resetTime: new Date() });
    expect((await store.increment("k")).totalHits).toBe(41);
    expect(h.constructed).toBe(1);
    await store.increment("k");
    expect(h.constructed).toBe(1); // store is reused for the same client
  });

  it("degrades to the in-process counter, rather than erroring or failing open, when Redis calls fail", async () => {
    const store = makeLazyRateLimitStore("rl:test:");
    store.init!({ windowMs: 60_000 } as any);
    h.redis = { call: vi.fn() };
    h.redisIncrement.mockRejectedValue(new Error("ECONNRESET"));
    expect((await store.increment("k")).totalHits).toBe(1);
    expect((await store.increment("k")).totalHits).toBe(2);
  });
});
