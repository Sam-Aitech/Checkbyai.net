import { describe, it, expect, vi, beforeEach } from "vitest";

let mockRedisClient: { eval: ReturnType<typeof vi.fn> } | null = null;

vi.mock("../redisClient", () => ({
  getRedis: () => mockRedisClient,
}));

const { acquire, BUCKETS } = await import("../tokenBucket");

describe("BUCKETS", () => {
  it("has the documented per-provider rates", () => {
    expect(BUCKETS.resend).toEqual({ refillPerSecond: 2, capacity: 10 });
    expect(BUCKETS.twilio).toEqual({ refillPerSecond: 1, capacity: 1 });
    expect(BUCKETS.brevo).toEqual({ refillPerSecond: 10, capacity: 20 });
    expect(BUCKETS.webhook).toEqual({ refillPerSecond: 5, capacity: 10 });
  });
});

describe("acquire", () => {
  beforeEach(() => {
    mockRedisClient = { eval: vi.fn() };
  });

  it("allows the request when Redis is unavailable — fails open, not closed", async () => {
    mockRedisClient = null;
    const result = await acquire("resend");
    expect(result).toEqual({ allowed: true });
  });

  it("allows when the Lua script returns 1 (token granted)", async () => {
    mockRedisClient!.eval.mockResolvedValue(1);
    const result = await acquire("resend");
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBeUndefined();
  });

  it("passes the bucket's configured capacity and refill rate to the Lua script", async () => {
    mockRedisClient!.eval.mockResolvedValue(1);
    await acquire("twilio", "+15551234567", 1);
    const call = mockRedisClient!.eval.mock.calls[0];
    // eval(script, numkeys, key, capacity, refillPerSecond, now, tokens)
    expect(call[2]).toBe("bucket:twilio:+15551234567");
    expect(call[3]).toBe(BUCKETS.twilio.capacity);
    expect(call[4]).toBe(BUCKETS.twilio.refillPerSecond);
  });

  it("denies with a computed retryAfterMs when the script returns a wait-seconds number", async () => {
    mockRedisClient!.eval.mockResolvedValue(2.5);
    const result = await acquire("brevo");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(2500);
  });

  it("fails open (allows) if the Lua eval throws", async () => {
    mockRedisClient!.eval.mockRejectedValue(new Error("NOSCRIPT"));
    const result = await acquire("webhook");
    expect(result).toEqual({ allowed: true });
  });
});
