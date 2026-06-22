import { describe, it, expect, vi, beforeEach } from "vitest";

// These are pure-logic functions exported from notificationEngine
// that don't need DB/Redis mocking for their core behavior.
// We mock tierConfig only for getEnabledChannelsForUser since it
// calls getTierConfig internally.

vi.mock("../../utils/tierConfig", () => ({
  getTierConfig: vi.fn((status: string | null) => {
    const configs: Record<string, any> = {
      free: { channels: [], webhooks: false },
      starter: { channels: ["email", "whatsapp"], webhooks: false },
      pro: { channels: ["email", "whatsapp", "sms"], webhooks: false },
      enterprise: { channels: ["email", "whatsapp", "sms"], webhooks: true },
    };
    return configs[status ?? "free"] ?? configs.free;
  }),
}));

import {
  normalizeSponsorLicenceStatus,
  mapStatusTransitionToNotifEvent,
  isChannelEventEnabled,
  getEnabledChannelsForUser,
} from "../notificationEngine";

// ── normalizeSponsorLicenceStatus ─────────────────────────────────────────────

describe("normalizeSponsorLicenceStatus", () => {
  it.each([
    ["Active", "Active"],
    ["Suspended", "Suspended"],
    ["Revoked", "Revoked"],
    ["Surrendered", "Surrendered"],
    ["REMOVED_REVOKED", "Revoked"],
    ["removed_revoked", "Revoked"],
    ["  Active  ", "Active"],
    [null, "UNKNOWN"],
    [undefined, "UNKNOWN"],
    ["", "UNKNOWN"],
    ["Gibberish", "UNKNOWN"],
  ] as const)("normalizes '%s' → '%s'", (input, expected) => {
    expect(normalizeSponsorLicenceStatus(input)).toBe(expected);
  });
});

// ── mapStatusTransitionToNotifEvent ───────────────────────────────────────────

describe("mapStatusTransitionToNotifEvent", () => {
  it("Active → Revoked → licence_revoked", () => {
    expect(mapStatusTransitionToNotifEvent("Active", "Revoked")).toBe("licence_revoked");
  });

  it("Active → Suspended → licence_revoked", () => {
    expect(mapStatusTransitionToNotifEvent("Active", "Suspended")).toBe("licence_revoked");
  });

  it("Active → Surrendered → licence_revoked", () => {
    expect(mapStatusTransitionToNotifEvent("Active", "Surrendered")).toBe("licence_revoked");
  });

  it("Suspended → Active → licence_reinstated", () => {
    expect(mapStatusTransitionToNotifEvent("Suspended", "Active")).toBe("licence_reinstated");
  });

  it("Revoked → Active → licence_reinstated", () => {
    expect(mapStatusTransitionToNotifEvent("Revoked", "Active")).toBe("licence_reinstated");
  });

  it("Surrendered → Active → licence_reinstated", () => {
    expect(mapStatusTransitionToNotifEvent("Surrendered", "Active")).toBe("licence_reinstated");
  });

  it("Active → Active → null (no transition)", () => {
    expect(mapStatusTransitionToNotifEvent("Active", "Active")).toBeNull();
  });

  it("Suspended → Suspended → null", () => {
    expect(mapStatusTransitionToNotifEvent("Suspended", "Suspended")).toBeNull();
  });

  it("null → Active → null (unknown previous)", () => {
    expect(mapStatusTransitionToNotifEvent(null, "Active")).toBeNull();
  });

  it("Active → null → null (unknown new)", () => {
    expect(mapStatusTransitionToNotifEvent("Active", null)).toBeNull();
  });

  it("REMOVED_REVOKED as previous → Active → licence_reinstated", () => {
    // REMOVED_REVOKED normalizes to Revoked
    expect(mapStatusTransitionToNotifEvent("REMOVED_REVOKED", "Active")).toBe("licence_reinstated");
  });

  it("Suspended → Revoked → licence_revoked", () => {
    expect(mapStatusTransitionToNotifEvent("Suspended", "Revoked")).toBe("licence_revoked");
  });

  it("Revoked → Suspended → null (shouldn't happen but handled)", () => {
    expect(mapStatusTransitionToNotifEvent("Revoked", "Suspended")).toBeNull();
  });
});

// ── isChannelEventEnabled ─────────────────────────────────────────────────────

describe("isChannelEventEnabled", () => {
  const eventType = "licence_revoked";

  it("returns true when prefs is null", () => {
    expect(isChannelEventEnabled(null, eventType, "email")).toBe(true);
  });

  it("returns true when event type not in prefs", () => {
    const prefs = {};
    expect(isChannelEventEnabled(prefs as any, eventType, "email")).toBe(true);
  });

  it("returns false when event is disabled", () => {
    const prefs = { licence_revoked: { enabled: false, channels: { email: true } } };
    expect(isChannelEventEnabled(prefs as any, eventType, "email")).toBe(false);
  });

  it("returns false when channel is disabled for event", () => {
    const prefs = { licence_revoked: { enabled: true, channels: { email: false } } };
    expect(isChannelEventEnabled(prefs as any, eventType, "email")).toBe(false);
  });

  it("returns true when event and channel are enabled", () => {
    const prefs = { licence_revoked: { enabled: true, channels: { email: true } } };
    expect(isChannelEventEnabled(prefs as any, eventType, "email")).toBe(true);
  });
});

// ── getEnabledChannelsForUser ────────────────────────────────────────────────

describe("getEnabledChannelsForUser", () => {
  const prefsKey = "licence_revoked";

  it("starter: returns email when user has email address configured", () => {
    const user = { subscriptionStatus: "starter", notifPrefs: null };
    const channelPrefs = { email: "user@test.com" } as any;
    const channels = getEnabledChannelsForUser(user, prefsKey, channelPrefs);
    expect(channels).toContain("email");
    expect(channels).not.toContain("whatsapp"); // no whatsapp number
    expect(channels).not.toContain("sms");       // sms not in starter
  });

  it("starter: returns email + whatsapp when both configured", () => {
    const user = { subscriptionStatus: "starter", notifPrefs: null };
    const channelPrefs = { email: "user@test.com", whatsappNumber: "+447700900000", whatsappVerified: true } as any;
    const channels = getEnabledChannelsForUser(user, prefsKey, channelPrefs);
    expect(channels).toContain("email");
    expect(channels).toContain("whatsapp");
    expect(channels).not.toContain("sms");
  });

  it("pro: returns email + whatsapp + sms when all configured", () => {
    const user = { subscriptionStatus: "pro", notifPrefs: null };
    const channelPrefs = {
      email: "user@test.com",
      whatsappNumber: "+447700900000", whatsappVerified: true,
      smsNumber: "+447700900001", smsVerified: true,
    } as any;
    const channels = getEnabledChannelsForUser(user, prefsKey, channelPrefs);
    expect(channels).toContain("email");
    expect(channels).toContain("whatsapp");
    expect(channels).toContain("sms");
  });

  it("free: returns empty (no channels in tier)", () => {
    const user = { subscriptionStatus: "free", notifPrefs: null };
    const channels = getEnabledChannelsForUser(user, prefsKey, {} as any);
    expect(channels).toEqual([]);
  });

  it("enterprise: includes webhook when HTTPS URL configured", () => {
    const user = { subscriptionStatus: "enterprise", notifPrefs: null };
    const channelPrefs = {
      webhookUrl: "https://hooks.example.com/notify",
      whatsappNumber: "+447700900000", whatsappVerified: true,
    } as any;
    const channels = getEnabledChannelsForUser(user, prefsKey, channelPrefs);
    expect(channels).toContain("webhook");
  });

  it("enterprise: webhook excluded when URL is not HTTPS", () => {
    const user = { subscriptionStatus: "enterprise", notifPrefs: null };
    const channelPrefs = {
      webhookUrl: "http://insecure.example.com",
      whatsappNumber: "+447700900000", whatsappVerified: true,
    } as any;
    const channels = getEnabledChannelsForUser(user, prefsKey, channelPrefs);
    expect(channels).not.toContain("webhook");
  });

  it("enterprise: webhook excluded when channel event disabled", () => {
    const user = {
      subscriptionStatus: "enterprise",
      notifPrefs: { licence_revoked: { enabled: true, channels: { webhook: false } } },
    } as any;
    const channelPrefs = {
      webhookUrl: "https://hooks.example.com/notify",
      whatsappNumber: "+447700900000", whatsappVerified: true,
    } as any;
    const channels = getEnabledChannelsForUser(user, prefsKey, channelPrefs);
    expect(channels).not.toContain("webhook");
  });

  it("excludes WhatsApp when not verified", () => {
    const user = { subscriptionStatus: "starter", notifPrefs: null };
    const channelPrefs = {
      email: "user@test.com",
      whatsappNumber: "+447700900000", whatsappVerified: false,
    } as any;
    const channels = getEnabledChannelsForUser(user, prefsKey, channelPrefs);
    expect(channels).toContain("email");
    expect(channels).not.toContain("whatsapp");
  });

  it("excludes SMS when not verified", () => {
    const user = { subscriptionStatus: "pro", notifPrefs: null };
    const channelPrefs = {
      email: "user@test.com",
      smsNumber: "+447700900000", smsVerified: false,
    } as any;
    const channels = getEnabledChannelsForUser(user, prefsKey, channelPrefs);
    expect(channels).toContain("email");
    expect(channels).not.toContain("sms");
  });
});
