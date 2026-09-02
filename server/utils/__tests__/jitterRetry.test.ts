import { describe, it, expect, vi, afterEach } from "vitest";
import { jitterDelay, parseRetryAfter } from "../jitterRetry";

describe("jitterDelay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("grows exponentially with attempt number", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(jitterDelay(0, 1000, 30000)).toBe(1000);
    expect(jitterDelay(1, 1000, 30000)).toBe(2000);
    expect(jitterDelay(2, 1000, 30000)).toBe(4000);
  });

  it("adds up to 1000ms of jitter on top of the exponential base", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(jitterDelay(0, 1000, 30000)).toBe(1500);
  });

  it("never exceeds the cap even at a high attempt number", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(jitterDelay(10, 1000, 30000)).toBe(30000);
  });

  it("respects a custom base and cap", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(jitterDelay(0, 500, 2000)).toBe(500);
    expect(jitterDelay(5, 500, 2000)).toBe(2000);
  });
});

describe("parseRetryAfter", () => {
  it("returns null for a null header", () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it("returns null for an empty header", () => {
    expect(parseRetryAfter("")).toBeNull();
  });

  it("parses a numeric-seconds header into milliseconds", () => {
    expect(parseRetryAfter("5")).toBe(5000);
  });

  it("parses an HTTP-date header into a millisecond delay from now", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const result = parseRetryAfter(future);
    expect(result).not.toBeNull();
    // Allow some slack for test execution time.
    expect(result!).toBeGreaterThan(8000);
    expect(result!).toBeLessThanOrEqual(10000);
  });

  it("clamps a past HTTP-date to 0, not negative", () => {
    const past = new Date(Date.now() - 10_000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
  });

  it("returns null for a header that is neither a number nor a valid date", () => {
    expect(parseRetryAfter("not-a-valid-header")).toBeNull();
  });
});
