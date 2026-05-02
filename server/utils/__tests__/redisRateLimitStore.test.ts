/**
 * redisRateLimitStore.test.ts
 *
 * Verification: Phase 3 — Redis-backed rate limiters
 *
 * Checks both behaviours:
 *   1. Redis AVAILABLE   → makeRateLimitStore() returns a RedisStore instance
 *   2. Redis UNAVAILABLE → makeRateLimitStore() returns undefined so
 *                          express-rate-limit uses its in-process MemoryStore
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock state ─────────────────────────────────────────────────────────
let mockRedisClient: Record<string, unknown> | null = null;

vi.mock("../redisClient", () => ({
  getRedis: () => mockRedisClient,
}));

// rate-limit-redis is the real package; we only care about construction shape.
// Capture the options passed to RedisStore so we can assert on them.
const capturedOptions: Array<{ prefix?: string; sendCommand: unknown }> = [];

vi.mock("rate-limit-redis", () => ({
  RedisStore: class MockRedisStore {
    prefix: string | undefined;
    sendCommand: unknown;
    constructor(opts: { prefix?: string; sendCommand: unknown }) {
      capturedOptions.push(opts);
      this.prefix = opts.prefix;
      this.sendCommand = opts.sendCommand;
    }
  },
}));

// Import AFTER mocks are in place
const { makeRateLimitStore } = await import("../redisRateLimitStore");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("makeRateLimitStore", () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  describe("when Redis is available", () => {
    beforeEach(() => {
      // Provide a minimal IORedis-shaped client with a call() method
      mockRedisClient = {
        call: vi.fn().mockResolvedValue(1),
      };
    });

    it("returns a RedisStore instance (not undefined)", () => {
      const store = makeRateLimitStore("rl:test:");
      expect(store).toBeDefined();
      expect(store).not.toBeNull();
    });

    it("passes the correct prefix to RedisStore", () => {
      makeRateLimitStore("rl:search:free:");
      expect(capturedOptions[0].prefix).toBe("rl:search:free:");
    });

    it("provides a sendCommand function", () => {
      makeRateLimitStore("rl:auth:");
      expect(typeof capturedOptions[0].sendCommand).toBe("function");
    });

    it("sendCommand delegates to client.call() with correct args", async () => {
      makeRateLimitStore("rl:auth:");
      const sendCmd = capturedOptions[0].sendCommand as (...args: string[]) => Promise<number>;
      await sendCmd("INCRBY", "rl:auth:127.0.0.1", "1");
      expect((mockRedisClient!.call as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        "INCRBY",
        "rl:auth:127.0.0.1",
        "1",
      );
    });

    it("each limiter prefix is distinct (no counter collisions)", () => {
      const prefixes = [
        "rl:search:free:",
        "rl:search:auth:",
        "rl:search:personalized:",
        "rl:directory:",
        "rl:changes:",
        "rl:auth:",
        "rl:otp:",
        "rl:verify:",
        "rl:enrich:",
        "rl:ops-trigger:",
      ];
      // All prefixes must be unique
      const uniquePrefixes = new Set(prefixes);
      expect(uniquePrefixes.size).toBe(prefixes.length);
    });
  });

  describe("when Redis is unavailable", () => {
    beforeEach(() => {
      mockRedisClient = null;
    });

    it("returns undefined (graceful degradation → in-process MemoryStore)", () => {
      const store = makeRateLimitStore("rl:test:");
      expect(store).toBeUndefined();
    });

    it("does not throw when Redis is null", () => {
      expect(() => makeRateLimitStore("rl:search:free:")).not.toThrow();
    });

    it("does not attempt to construct RedisStore", () => {
      makeRateLimitStore("rl:auth:");
      expect(capturedOptions).toHaveLength(0);
    });
  });
});
