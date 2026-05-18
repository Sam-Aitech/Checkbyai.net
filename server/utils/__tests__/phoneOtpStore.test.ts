import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../redisClient", () => ({
  getRedis: () => null,
}));

describe("phoneOtpStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires in-memory OTP entries after the configured TTL", async () => {
    const store = await import("../phoneOtpStore");

    await store.setOtp("user-1", "sms", "+441234567890", "123456");
    expect(await store.getOtp("user-1", "sms", "+441234567890")).toMatchObject({
      code: "123456",
      attempts: 0,
    });

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(await store.getOtp("user-1", "sms", "+441234567890")).toBeNull();
  });

  it("expires and resets in-memory rate counters after the configured TTL", async () => {
    const store = await import("../phoneOtpStore");

    await store.incrementRateCount("user-1", "sms");
    await store.incrementRateCount("user-1", "sms");
    expect(await store.getRateCount("user-1", "sms")).toBe(2);

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(await store.getRateCount("user-1", "sms")).toBe(0);

    await store.incrementRateCount("user-1", "sms");
    expect(await store.getRateCount("user-1", "sms")).toBe(1);
  });
});
