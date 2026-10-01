import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  counters: new Map<string, number>(),
  expires: [] as Array<[string, number]>,
  evalCalls: 0,
}));

vi.mock("../redisClient", () => ({
  getRedis: () => ({
    incr: async (k: string) => {
      const n = (h.counters.get(k) ?? 0) + 1;
      h.counters.set(k, n);
      return n;
    },
    expire: async (k: string, s: number) => void h.expires.push([k, s]),
    get: async (k: string) => (h.counters.has(k) ? String(h.counters.get(k)) : null),
    eval: async () => {
      h.evalCalls++;
      return h.evalCalls;
    },
  }),
}));

const store = await import("../phoneOtpStore");

describe("phoneOtpStore with Redis: atomic counters", () => {
  beforeEach(() => {
    h.counters.clear();
    h.expires.length = 0;
    h.evalCalls = 0;
  });

  it("counts concurrent requests exactly, with no lost updates", async () => {
    await Promise.all(Array.from({ length: 10 }, () => store.incrementRateCount("u1", "sms")));
    expect(await store.getRateCount("u1", "sms")).toBe(10);
  });

  it("starts the window once, on the first hit only", async () => {
    await store.incrementRateCount("u1", "sms");
    await store.incrementRateCount("u1", "sms");
    expect(h.expires).toHaveLength(1);
  });

  it("increments OTP attempts through a single atomic script", async () => {
    const results = await Promise.all([1, 2, 3].map(() => store.incrementOtpAttempts("u1", "sms", "+441234567890")));
    expect(new Set(results).size).toBe(3);
    expect(h.evalCalls).toBe(3);
  });
});
