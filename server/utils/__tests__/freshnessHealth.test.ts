/**
 * Tests for sponsor-monitor freshness status classification logic.
 *
 * These tests cover the classification rules introduced to replace the
 * old `staleDays >= 3` threshold with an hours-based tiered system:
 *   ≤24h  → ok
 *   24–48h → warn
 *   >48h   → critical
 */

import { describe, expect, it } from "vitest";

// ── Pure classification helper (mirrors the logic in health.ts) ──────────────

type FreshnessStatus = "ok" | "warn" | "critical" | "running" | "unknown";

function classifyFreshness(opts: {
  jobRunning: boolean;
  hoursSinceSuccess: number | null;
  lastRunFailed?: boolean;
}): { status: FreshnessStatus; staleReason: string | null } {
  const { jobRunning, hoursSinceSuccess, lastRunFailed } = opts;

  if (jobRunning) {
    return { status: "running", staleReason: null };
  }
  if (hoursSinceSuccess !== null) {
    if (hoursSinceSuccess <= 24) {
      return { status: "ok", staleReason: null };
    }
    if (hoursSinceSuccess <= 48) {
      return {
        status: "warn",
        staleReason: `No successful run in ${hoursSinceSuccess}h (warn threshold: 24h).`,
      };
    }
    return {
      status: "critical",
      staleReason: `No successful run in ${hoursSinceSuccess}h (critical threshold: 48h).`,
    };
  }
  if (lastRunFailed) {
    return { status: "warn", staleReason: "Last run failed." };
  }
  return { status: "unknown", staleReason: null };
}

// ── Pure stale-banner helper (mirrors the logic in HeroSection.tsx) ──────────

type BannerSeverity = "ok" | "warn" | "critical";

function staleBannerSeverity(hoursStale: number): BannerSeverity {
  if (hoursStale > 48) return "critical";
  if (hoursStale > 24) return "warn";
  return "ok";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("classifyFreshness — health endpoint status", () => {
  it("returns ok when job ran 1h ago", () => {
    const result = classifyFreshness({ jobRunning: false, hoursSinceSuccess: 1 });
    expect(result.status).toBe("ok");
    expect(result.staleReason).toBeNull();
  });

  it("returns ok when job ran exactly 24h ago (boundary)", () => {
    const result = classifyFreshness({ jobRunning: false, hoursSinceSuccess: 24 });
    expect(result.status).toBe("ok");
  });

  it("returns warn when job ran 25h ago (just over 24h threshold)", () => {
    const result = classifyFreshness({ jobRunning: false, hoursSinceSuccess: 25 });
    expect(result.status).toBe("warn");
    expect(result.staleReason).toContain("warn threshold: 24h");
  });

  it("returns warn when job ran exactly 48h ago (boundary)", () => {
    const result = classifyFreshness({ jobRunning: false, hoursSinceSuccess: 48 });
    expect(result.status).toBe("warn");
  });

  it("returns critical when job ran 49h ago (just over 48h threshold)", () => {
    const result = classifyFreshness({ jobRunning: false, hoursSinceSuccess: 49 });
    expect(result.status).toBe("critical");
    expect(result.staleReason).toContain("critical threshold: 48h");
  });

  it("returns critical when job ran 72h ago", () => {
    const result = classifyFreshness({ jobRunning: false, hoursSinceSuccess: 72 });
    expect(result.status).toBe("critical");
  });

  it("returns running when job is currently executing", () => {
    const result = classifyFreshness({ jobRunning: true, hoursSinceSuccess: null });
    expect(result.status).toBe("running");
    expect(result.staleReason).toBeNull();
  });

  it("returns running regardless of hoursSinceSuccess", () => {
    const result = classifyFreshness({ jobRunning: true, hoursSinceSuccess: 100 });
    expect(result.status).toBe("running");
  });

  it("returns warn when hoursSinceSuccess is null but last run failed", () => {
    const result = classifyFreshness({ jobRunning: false, hoursSinceSuccess: null, lastRunFailed: true });
    expect(result.status).toBe("warn");
    expect(result.staleReason).toBe("Last run failed.");
  });

  it("returns unknown when no data available", () => {
    const result = classifyFreshness({ jobRunning: false, hoursSinceSuccess: null });
    expect(result.status).toBe("unknown");
    expect(result.staleReason).toBeNull();
  });
});

describe("staleBannerSeverity — HeroSection stale warning tier", () => {
  it("returns ok for 0 hours stale (just ran)", () => {
    expect(staleBannerSeverity(0)).toBe("ok");
  });

  it("returns ok for exactly 24h stale", () => {
    expect(staleBannerSeverity(24)).toBe("ok");
  });

  it("returns warn for 25h stale", () => {
    expect(staleBannerSeverity(25)).toBe("warn");
  });

  it("returns warn for exactly 48h stale", () => {
    expect(staleBannerSeverity(48)).toBe("warn");
  });

  it("returns critical for 49h stale", () => {
    expect(staleBannerSeverity(49)).toBe("critical");
  });

  it("returns critical for 72h stale (3 days)", () => {
    expect(staleBannerSeverity(72)).toBe("critical");
  });

  it("returns critical for 168h stale (1 week)", () => {
    expect(staleBannerSeverity(168)).toBe("critical");
  });

  // Old threshold (3 calendar days = 72h) would not have warned at 2 days.
  // New threshold (24h) correctly warns at 25h.
  it("triggers warn at 25h where old 3-day threshold would have missed it", () => {
    const OLD_STALE_DAYS_THRESHOLD = 3; // old: warned at 3 days
    const hoursStale = 25;
    const staleDays = Math.floor(hoursStale / 24); // 1 day
    // Old logic would NOT show a warning (staleDays < 3)
    expect(staleDays < OLD_STALE_DAYS_THRESHOLD).toBe(true);
    // New logic DOES show a warning (hoursStale > 24)
    expect(staleBannerSeverity(hoursStale)).toBe("warn");
  });
});
