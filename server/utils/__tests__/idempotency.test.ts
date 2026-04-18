import { describe, expect, it, vi } from "vitest";
import { InMemoryIdempotencyGuard, isUuidV4 } from "../idempotency";

describe("isUuidV4", () => {
  it("validates UUID v4 strings", () => {
    expect(isUuidV4("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuidV4("550e8400-e29b-11d4-a716-446655440000")).toBe(false);
    expect(isUuidV4("not-a-uuid")).toBe(false);
  });
});

describe("InMemoryIdempotencyGuard", () => {
  it("returns replay=true for repeated key inside TTL", () => {
    const guard = new InMemoryIdempotencyGuard(60_000);
    const first = guard.registerOrGetReplay("jobA", "k1", "trigger-1");
    const second = guard.registerOrGetReplay("jobA", "k1", "trigger-2");

    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(second.triggerId).toBe("trigger-1");
  });

  it("expires keys after TTL", () => {
    vi.useFakeTimers();
    const guard = new InMemoryIdempotencyGuard(1_000);

    const first = guard.registerOrGetReplay("jobA", "k1", "trigger-1");
    vi.advanceTimersByTime(1_100);
    const second = guard.registerOrGetReplay("jobA", "k1", "trigger-2");

    expect(first.replay).toBe(false);
    expect(second.replay).toBe(false);
    expect(second.triggerId).toBe("trigger-2");
    vi.useRealTimers();
  });
});
