import { describe, it, expect } from "vitest";
import {
  resolveTier,
  getTierConfig,
  getWatchLimit,
  isChannelAllowed,
  canReceiveNotifications,
  hasEnrichedNotifications,
  hasJobAlerts,
  getDeliverAfter,
} from "../tierConfig";

// ── resolveTier ────────────────────────────────────────────────────────────────

describe("resolveTier", () => {
  it("defaults to free when null", () => {
    expect(resolveTier(null)).toBe("free");
  });

  it("defaults to free when undefined", () => {
    expect(resolveTier(undefined)).toBe("free");
  });

  it("defaults to free for unknown status string", () => {
    expect(resolveTier("expired")).toBe("free");
    expect(resolveTier("cancelled")).toBe("free");
  });

  it.each([
    ["free", "free"],
    ["starter", "starter"],
    ["pro", "pro"],
    ["unlimited", "unlimited"],
    ["enterprise", "enterprise"],
  ] as const)("resolves '%s' → '%s'", (input, expected) => {
    expect(resolveTier(input)).toBe(expected);
  });
});

// ── getWatchLimit ──────────────────────────────────────────────────────────────

describe("getWatchLimit", () => {
  it("free → 1", () => expect(getWatchLimit("free")).toBe(1));
  it("starter → 2", () => expect(getWatchLimit("starter")).toBe(2));
  it("pro → 5", () => expect(getWatchLimit("pro")).toBe(5));
  it("unlimited → -1 (no limit)", () => expect(getWatchLimit("unlimited")).toBe(-1));
  it("enterprise → -1 (no limit)", () => expect(getWatchLimit("enterprise")).toBe(-1));
  it("null → free limit (1)", () => expect(getWatchLimit(null)).toBe(1));
});

// ── isChannelAllowed ───────────────────────────────────────────────────────────

describe("isChannelAllowed", () => {
  it("free: no channels allowed", () => {
    expect(isChannelAllowed("free", "email")).toBe(false);
    expect(isChannelAllowed("free", "sms")).toBe(false);
    expect(isChannelAllowed("free", "whatsapp")).toBe(false);
  });

  it("starter: email and whatsapp allowed, sms blocked", () => {
    expect(isChannelAllowed("starter", "email")).toBe(true);
    expect(isChannelAllowed("starter", "whatsapp")).toBe(true);
    expect(isChannelAllowed("starter", "sms")).toBe(false);
  });

  it("pro: all channels allowed", () => {
    expect(isChannelAllowed("pro", "email")).toBe(true);
    expect(isChannelAllowed("pro", "sms")).toBe(true);
    expect(isChannelAllowed("pro", "whatsapp")).toBe(true);
  });

  it("unlimited: all channels allowed", () => {
    expect(isChannelAllowed("unlimited", "email")).toBe(true);
    expect(isChannelAllowed("unlimited", "sms")).toBe(true);
    expect(isChannelAllowed("unlimited", "whatsapp")).toBe(true);
  });
});

// ── canReceiveNotifications ────────────────────────────────────────────────────

describe("canReceiveNotifications", () => {
  it("free → false", () => expect(canReceiveNotifications("free")).toBe(false));
  it("null → false (treated as free)", () => expect(canReceiveNotifications(null)).toBe(false));
  it("starter → true", () => expect(canReceiveNotifications("starter")).toBe(true));
  it("pro → true", () => expect(canReceiveNotifications("pro")).toBe(true));
});

// ── hasEnrichedNotifications ───────────────────────────────────────────────────

describe("hasEnrichedNotifications", () => {
  it("free → false", () => expect(hasEnrichedNotifications("free")).toBe(false));
  it("starter → false", () => expect(hasEnrichedNotifications("starter")).toBe(false));
  it("pro → true", () => expect(hasEnrichedNotifications("pro")).toBe(true));
  it("unlimited → true", () => expect(hasEnrichedNotifications("unlimited")).toBe(true));
  it("enterprise → true", () => expect(hasEnrichedNotifications("enterprise")).toBe(true));
});

// ── hasJobAlerts ───────────────────────────────────────────────────────────────

describe("hasJobAlerts", () => {
  it("free → false", () => expect(hasJobAlerts("free")).toBe(false));
  it("starter → false", () => expect(hasJobAlerts("starter")).toBe(false));
  it("pro → true", () => expect(hasJobAlerts("pro")).toBe(true));
  it("unlimited → true", () => expect(hasJobAlerts("unlimited")).toBe(true));
});

// ── getTierConfig ──────────────────────────────────────────────────────────────

describe("getTierConfig", () => {
  it("returns the correct config object for each tier", () => {
    const free = getTierConfig("free");
    expect(free.watchLimit).toBe(1);
    expect(free.channels).toHaveLength(0);
    expect(free.apiAccess).toBe(false);

    const enterprise = getTierConfig("enterprise");
    expect(enterprise.watchLimit).toBe(-1);
    expect(enterprise.apiAccess).toBe(true);
    expect(enterprise.webhooks).toBe(true);
    expect(enterprise.csvUpload).toBe(true);
  });

  it("unknown status falls back to free config", () => {
    const config = getTierConfig("expired");
    expect(config.watchLimit).toBe(1);
    expect(config.channels).toHaveLength(0);
  });
});

// ── getDeliverAfter ────────────────────────────────────────────────────────────

describe("getDeliverAfter", () => {
  it("immediate tier (pro) returns null", () => {
    expect(getDeliverAfter("pro")).toBeNull();
  });

  it("immediate tier (unlimited) returns null", () => {
    expect(getDeliverAfter("unlimited")).toBeNull();
  });

  it("next-morning tier (free) returns tomorrow at 08:00 UTC", () => {
    const result = getDeliverAfter("free");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getUTCHours()).toBe(8);
    expect(result!.getUTCMinutes()).toBe(0);
    expect(result!.getUTCSeconds()).toBe(0);
    // Must be in the future
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });

  it("same-day tier (starter) returns a future Date at 18:00 UTC (or next day)", () => {
    const result = getDeliverAfter("starter");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getUTCHours()).toBe(18);
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });
});
