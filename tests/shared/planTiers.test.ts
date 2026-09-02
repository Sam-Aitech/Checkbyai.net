import { describe, expect, test } from "vitest";
import {
  ALERT_TIMING_COPY,
  ALERT_TIMING_SHORT,
  TIER_CONFIGS,
  TIER_LABELS,
  canReceiveNotifications,
  getDeliverAfter,
  getTierConfig,
  getWatchLimit,
  hasEnrichedNotifications,
  hasJobAlerts,
  isChannelAllowed,
  isPaidTier,
  isUnlimitedWatchTier,
  resolveTier,
  type PlanTier,
} from "../../shared/planTiers";

const ALL_TIERS: PlanTier[] = ["free", "starter", "pro", "unlimited", "enterprise"];

describe("resolveTier", () => {
  test.each([
    ["free", "free"],
    ["starter", "starter"],
    ["pro", "pro"],
    ["unlimited", "unlimited"],
    ["enterprise", "enterprise"],
  ])("maps status %s to tier %s", (status, expected) => {
    expect(resolveTier(status)).toBe(expected);
  });

  test("maps null to free", () => {
    expect(resolveTier(null)).toBe("free");
  });

  test("maps undefined to free", () => {
    expect(resolveTier(undefined)).toBe("free");
  });

  // Regression guard: 'past_due' is a real, persisted subscriptionStatus
  // (server/routes/billing.ts) that isn't a PlanTier key. It must still
  // resolve to a valid tier rather than throwing or returning undefined.
  test("maps an unrecognized status (e.g. 'past_due') to free without throwing", () => {
    expect(() => resolveTier("past_due")).not.toThrow();
    expect(resolveTier("past_due")).toBe("free");
  });
});

describe("TIER_CONFIGS", () => {
  test("has an entry for every PlanTier with no missing/undefined config", () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_CONFIGS[tier]).toBeDefined();
      expect(typeof TIER_CONFIGS[tier].watchLimit).toBe("number");
    }
  });

  test("is frozen so a caller cannot mutate the shared singleton", () => {
    expect(Object.isFrozen(TIER_CONFIGS)).toBe(true);
    expect(Object.isFrozen(TIER_CONFIGS.pro)).toBe(true);
    expect(Object.isFrozen(TIER_CONFIGS.pro.channels)).toBe(true);
  });

  test("mutation attempts on TIER_CONFIGS are no-ops (or throw in strict mode), never silently applied", () => {
    const before = [...TIER_CONFIGS.free.channels];
    try {
      // @ts-expect-error intentionally violating the readonly contract to prove it's enforced
      TIER_CONFIGS.free.channels.push("sms");
    } catch {
      // Object.freeze in strict mode throws on mutation attempts — also acceptable.
    }
    expect(TIER_CONFIGS.free.channels).toEqual(before);
  });

  test("free tier has no watch-limit ceiling escape and is not a paid tier", () => {
    expect(TIER_CONFIGS.free.watchLimit).toBeGreaterThan(0);
    expect(isPaidTier("free")).toBe(false);
  });

  test("unlimited and enterprise both report watchLimit -1", () => {
    expect(TIER_CONFIGS.unlimited.watchLimit).toBe(-1);
    expect(TIER_CONFIGS.enterprise.watchLimit).toBe(-1);
  });
});

describe("TIER_LABELS / ALERT_TIMING_COPY / ALERT_TIMING_SHORT", () => {
  test("every PlanTier has a label, timing copy, and short timing copy", () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_LABELS[tier]).toBeTruthy();
      expect(ALERT_TIMING_COPY[tier]).toBeTruthy();
      expect(ALERT_TIMING_SHORT[tier]).toBeTruthy();
    }
  });

  test("are frozen", () => {
    expect(Object.isFrozen(TIER_LABELS)).toBe(true);
    expect(Object.isFrozen(ALERT_TIMING_COPY)).toBe(true);
    expect(Object.isFrozen(ALERT_TIMING_SHORT)).toBe(true);
  });

  // Regression guard: this copy previously claimed pro/unlimited/enterprise
  // get alerts "instant" / "within minutes" of the ~00:30 UTC register check.
  // The automated pipeline never delivers that — it defers everything to the
  // twice-daily consolidated digest (07:00 & 19:00 UTC). The copy must not
  // reintroduce a delivery-speed promise the live cron doesn't keep.
  test("does not claim instant/sub-hour delivery for any tier", () => {
    for (const tier of ALL_TIERS) {
      expect(ALERT_TIMING_COPY[tier].toLowerCase()).not.toContain("instant");
      expect(ALERT_TIMING_COPY[tier].toLowerCase()).not.toContain("within minutes");
      expect(ALERT_TIMING_SHORT[tier].toLowerCase()).not.toContain("instant");
      expect(ALERT_TIMING_SHORT[tier].toLowerCase()).not.toContain("within minutes");
    }
  });
});

describe("getWatchLimit / getTierConfig", () => {
  test("returns the configured watch limit for each tier", () => {
    expect(getWatchLimit("free")).toBe(TIER_CONFIGS.free.watchLimit);
    expect(getWatchLimit("starter")).toBe(TIER_CONFIGS.starter.watchLimit);
    expect(getWatchLimit("pro")).toBe(TIER_CONFIGS.pro.watchLimit);
  });

  test("getTierConfig never returns undefined for any resolvable status", () => {
    for (const tier of ALL_TIERS) {
      expect(getTierConfig(tier)).toBeDefined();
    }
    expect(getTierConfig("some-unknown-status")).toBeDefined();
  });
});

describe("isChannelAllowed", () => {
  test("free tier only allows email", () => {
    expect(isChannelAllowed("free", "email")).toBe(true);
    expect(isChannelAllowed("free", "whatsapp")).toBe(false);
    expect(isChannelAllowed("free", "sms")).toBe(false);
  });

  // Regression guard: WhatsApp unlocks at Starter, not Pro — a UI copy bug
  // once told Starter subscribers they needed to upgrade to Pro for it.
  test("starter tier allows whatsapp but not sms", () => {
    expect(isChannelAllowed("starter", "whatsapp")).toBe(true);
    expect(isChannelAllowed("starter", "sms")).toBe(false);
  });

  test("pro tier allows sms", () => {
    expect(isChannelAllowed("pro", "sms")).toBe(true);
  });
});

describe("hasEnrichedNotifications / hasJobAlerts", () => {
  test("only pro, unlimited, and enterprise have enriched notifications", () => {
    expect(hasEnrichedNotifications("free")).toBe(false);
    expect(hasEnrichedNotifications("starter")).toBe(false);
    expect(hasEnrichedNotifications("pro")).toBe(true);
    expect(hasEnrichedNotifications("unlimited")).toBe(true);
    expect(hasEnrichedNotifications("enterprise")).toBe(true);
  });

  test("job alerts follow the same pro-and-above gating as enriched notifications", () => {
    for (const tier of ALL_TIERS) {
      expect(hasJobAlerts(tier)).toBe(hasEnrichedNotifications(tier));
    }
  });
});

describe("isPaidTier / isUnlimitedWatchTier", () => {
  test("isPaidTier is true for starter and above, false for free", () => {
    expect(isPaidTier("free")).toBe(false);
    expect(isPaidTier(null)).toBe(false);
    expect(isPaidTier("starter")).toBe(true);
    expect(isPaidTier("pro")).toBe(true);
    expect(isPaidTier("unlimited")).toBe(true);
    expect(isPaidTier("enterprise")).toBe(true);
  });

  test("isUnlimitedWatchTier is true only for tiers with watchLimit -1", () => {
    expect(isUnlimitedWatchTier("free")).toBe(false);
    expect(isUnlimitedWatchTier("starter")).toBe(false);
    expect(isUnlimitedWatchTier("pro")).toBe(false);
    expect(isUnlimitedWatchTier("unlimited")).toBe(true);
    expect(isUnlimitedWatchTier("enterprise")).toBe(true);
  });
});

describe("canReceiveNotifications", () => {
  test("true for every tier with at least one channel (all tiers, since free has email)", () => {
    for (const tier of ALL_TIERS) {
      expect(canReceiveNotifications(tier)).toBe(TIER_CONFIGS[tier].channels.length > 0);
    }
  });
});

describe("getDeliverAfter", () => {
  test("returns null for immediate-tier config (no artificial delay)", () => {
    expect(getDeliverAfter("pro")).toBeNull();
    expect(getDeliverAfter("unlimited")).toBeNull();
    expect(getDeliverAfter("enterprise")).toBeNull();
  });

  test("returns a same-day 18:00 UTC Date for starter", () => {
    const result = getDeliverAfter("starter");
    expect(result).not.toBeNull();
    expect(result?.getUTCHours()).toBe(18);
    expect(result?.getUTCMinutes()).toBe(0);
  });

  test("returns a next-day 08:00 UTC Date for free", () => {
    const result = getDeliverAfter("free");
    expect(result).not.toBeNull();
    expect(result?.getUTCHours()).toBe(8);
  });
});
