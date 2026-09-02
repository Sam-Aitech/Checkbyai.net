import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock state ─────────────────────────────────────────────────────────
let mockRedisClient: { set: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> } | null = null;

vi.mock("../redisClient", () => ({
  getRedis: () => mockRedisClient,
}));

const { buildIdempotencyKey, claimIdempotency, releaseIdempotency } = await import("../notifIdempotency");

describe("buildIdempotencyKey", () => {
  it("is deterministic for the same inputs", () => {
    const a = buildIdempotencyKey("user1", 42, "email", "2026-01-01");
    const b = buildIdempotencyKey("user1", 42, "email", "2026-01-01");
    expect(a).toBe(b);
  });

  it("differs when any input differs", () => {
    const base = buildIdempotencyKey("user1", 42, "email", "2026-01-01");
    expect(buildIdempotencyKey("user2", 42, "email", "2026-01-01")).not.toBe(base);
    expect(buildIdempotencyKey("user1", 43, "email", "2026-01-01")).not.toBe(base);
    expect(buildIdempotencyKey("user1", 42, "sms", "2026-01-01")).not.toBe(base);
    expect(buildIdempotencyKey("user1", 42, "email", "2026-01-02")).not.toBe(base);
  });
});

describe("claimIdempotency", () => {
  beforeEach(() => {
    mockRedisClient = { set: vi.fn(), del: vi.fn() };
  });

  it("returns true (allow send) when Redis is unavailable — fails open, not closed", async () => {
    mockRedisClient = null;
    await expect(claimIdempotency("some-key")).resolves.toBe(true);
  });

  it("claims via SET NX and returns true when the key was not already set", async () => {
    mockRedisClient!.set.mockResolvedValue("OK");
    const result = await claimIdempotency("some-key", 3600);
    expect(result).toBe(true);
    expect(mockRedisClient!.set).toHaveBeenCalledWith("idem:notif:some-key", "1", "EX", 3600, "NX");
  });

  // Regression guard: this is the whole point of the fix — a single atomic
  // round trip, not a separate GET-then-SET that leaves a race window where
  // two concurrent callers can both "win" the check.
  it("returns false when another caller already holds the claim (SET NX returns null)", async () => {
    mockRedisClient!.set.mockResolvedValue(null);
    const result = await claimIdempotency("some-key");
    expect(result).toBe(false);
  });

  it("fails open (returns true) if Redis throws", async () => {
    mockRedisClient!.set.mockRejectedValue(new Error("connection lost"));
    await expect(claimIdempotency("some-key")).resolves.toBe(true);
  });
});

describe("releaseIdempotency", () => {
  beforeEach(() => {
    mockRedisClient = { set: vi.fn(), del: vi.fn() };
  });

  it("deletes the claim key so a legitimate retry is not blocked", async () => {
    mockRedisClient!.del.mockResolvedValue(1);
    await releaseIdempotency("some-key");
    expect(mockRedisClient!.del).toHaveBeenCalledWith("idem:notif:some-key");
  });

  it("is a no-op (does not throw) when Redis is unavailable", async () => {
    mockRedisClient = null;
    await expect(releaseIdempotency("some-key")).resolves.toBeUndefined();
  });

  it("swallows a Redis error rather than throwing — the claim just expires on its TTL", async () => {
    mockRedisClient!.del.mockRejectedValue(new Error("connection lost"));
    await expect(releaseIdempotency("some-key")).resolves.toBeUndefined();
  });
});
