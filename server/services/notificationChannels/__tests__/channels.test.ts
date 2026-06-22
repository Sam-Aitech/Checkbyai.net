import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChannelPayload } from "../types";

function useInstantTimers() {
  vi.useFakeTimers();
  vi.stubGlobal("setTimeout", (fn: Function, _ms: number) => {
    fn();
    return 0;
  });
}

// ── Audit ─────────────────────────────────────────────────────────────────────

describe("logNotification (audit)", () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it("inserts a notification log entry", async () => {
    const insertFn = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    vi.doMock("../../../db", () => ({ db: { insert: insertFn } }));

    const { logNotification } = await import("../audit");
    await logNotification({
      userId: "user-1", changeId: 42, eventType: "licence_revoked",
      channel: "email", companyName: "Acme Ltd", success: true, providerMessageId: "msg-abc",
    });

    expect(insertFn).toHaveBeenCalled();
  });

  it("handles insert errors gracefully", async () => {
    const insertFn = vi.fn().mockImplementation(() => { throw new Error("DB down"); });
    vi.doMock("../../../db", () => ({ db: { insert: insertFn } }));

    const { logNotification } = await import("../audit");
    await expect(logNotification({
      userId: "user-1", changeId: 1, eventType: "test",
      channel: "email", companyName: "Acme", success: true,
    })).resolves.toBeUndefined();
  });
});

// ── Email channel ──────────────────────────────────────────────────────────────

describe("emailChannel", () => {
  const payload: ChannelPayload = {
    userId: "user-1", changeId: 1, eventType: "licence_revoked",
    companyName: "Acme Ltd", organisationName: "Acme Ltd",
    changeType: "REMOVED_REVOKED", previousValue: "Active", newValue: "Revoked",
    recipient: "user@test.com",
  };
  const mockBuildEmail = vi.fn().mockReturnValue({ subject: "Test", html: "<p>test</p>" });

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.doMock("../../../utils/emailTemplates", () => ({ buildEmail: mockBuildEmail }));
  });

  it("sends via Resend successfully", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "resend-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { emailChannel } = await import("../email");
    const result = await emailChannel.send(payload);
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe("resend-1");
  });

  it("falls back to SendGrid when Resend fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("SENDGRID_API_KEY", "sg_test");
    useInstantTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "err" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "err" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "err" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "sg-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { emailChannel, clearProviderCache } = await import("../email");
    clearProviderCache();
    const result = await emailChannel.send(payload);
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe("sg-1");
  });

  it("returns failure when all providers exhausted", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("SENDGRID_API_KEY", "sg_test");
    useInstantTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "Bad Gateway" });
    vi.stubGlobal("fetch", fetchMock);

    const { emailChannel, clearProviderCache } = await import("../email");
    clearProviderCache();
    const result = await emailChannel.send(payload);
    expect(result.success).toBe(false);
    expect(result.error).toContain("All providers exhausted");
  });

  it("returns failure when no providers configured", async () => {
    const { emailChannel, clearProviderCache } = await import("../email");
    clearProviderCache();
    const result = await emailChannel.send(payload);
    expect(result.success).toBe(false);
    expect(result.error).toContain("No email providers configured");
  });
});

// ── WhatsApp channel ───────────────────────────────────────────────────────────

describe("whatsAppChannel", () => {
  const payload: ChannelPayload = {
    userId: "user-1", changeId: 1, eventType: "licence_revoked",
    companyName: "Acme Ltd", organisationName: "Acme Ltd",
    changeType: "REMOVED_REVOKED", previousValue: null, newValue: null,
    recipient: "+447700900000",
  };

  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it("sends successfully", async () => {
    vi.doMock("../../messaging", () => ({
      sendWhatsApp: vi.fn().mockResolvedValue({ success: true, providerMessageId: "twilio-sid" }),
    }));
    const { whatsAppChannel } = await import("../whatsapp");
    expect((await whatsAppChannel.send(payload)).success).toBe(true);
  });

  it("returns failure on API error", async () => {
    vi.doMock("../../messaging", () => ({
      sendWhatsApp: vi.fn().mockResolvedValue({ success: false, error: "Twilio error" }),
    }));
    const { whatsAppChannel } = await import("../whatsapp");
    const r = await whatsAppChannel.send(payload);
    expect(r.success).toBe(false);
    expect(r.error).toBe("Twilio error");
  });

  it("handles thrown exceptions", async () => {
    vi.doMock("../../messaging", () => ({
      sendWhatsApp: vi.fn().mockRejectedValue(new Error("Network error")),
    }));
    const { whatsAppChannel } = await import("../whatsapp");
    expect((await whatsAppChannel.send(payload)).error).toBe("Network error");
  });
});

// ── SMS channel ────────────────────────────────────────────────────────────────

describe("smsChannel", () => {
  const payload: ChannelPayload = {
    userId: "user-1", changeId: 1, eventType: "licence_revoked",
    companyName: "Acme Ltd", organisationName: "Acme Ltd",
    changeType: "REMOVED_REVOKED", previousValue: null, newValue: null,
    recipient: "+447700900000",
  };

  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it("sends successfully", async () => {
    vi.doMock("../../messaging", () => ({
      sendSMS: vi.fn().mockResolvedValue({ success: true, providerMessageId: "brevo-1" }),
    }));
    const { smsChannel } = await import("../sms");
    expect((await smsChannel.send(payload)).success).toBe(true);
  });

  it("returns failure on API error", async () => {
    vi.doMock("../../messaging", () => ({
      sendSMS: vi.fn().mockResolvedValue({ success: false, error: "Brevo error" }),
    }));
    const { smsChannel } = await import("../sms");
    expect((await smsChannel.send(payload)).error).toBe("Brevo error");
  });

  it("handles thrown exceptions", async () => {
    vi.doMock("../../messaging", () => ({
      sendSMS: vi.fn().mockRejectedValue(new Error("Timeout")),
    }));
    const { smsChannel } = await import("../sms");
    expect((await smsChannel.send(payload)).error).toBe("Timeout");
  });
});

// ── Webhook channel ────────────────────────────────────────────────────────────

describe("webhookChannel", () => {
  const payload: ChannelPayload = {
    userId: "user-1", changeId: 1, eventType: "licence_revoked",
    companyName: "Acme Ltd", organisationName: "Acme Ltd",
    changeType: "REMOVED_REVOKED", previousValue: null, newValue: null,
    recipient: "https://hooks.example.com/sponsor",
  };

  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("sends webhook with HMAC signature", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, headers: { get: (h: string) => (h === "X-Request-Id" ? "req-1" : null) },
    });
    vi.stubGlobal("fetch", fetchMock);

    const { webhookChannel } = await import("../webhook");
    const result = await webhookChannel.send(payload);
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe("req-1");
    const args = fetchMock.mock.calls[0][1];
    expect(args.headers["X-CheckByAI-Signature"]).toBeDefined();
    expect(args.headers["X-CheckByAI-Timestamp"]).toBeDefined();
  });

  it("rejects non-HTTPS URLs", async () => {
    const { webhookChannel } = await import("../webhook");
    const result = await webhookChannel.send({ ...payload, recipient: "http://insecure.example.com" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTPS");
  });

  it("retries on HTTP errors up to max attempts", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "test-secret");
    useInstantTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 502, headers: { get: () => null },
      text: async () => "Bad Gateway",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { webhookChannel } = await import("../webhook");
    const result = await webhookChannel.send(payload);
    expect(result.success).toBe(false);
    // 1 initial attempt + 2 quick retries (RETRY_DELAYS_MS has 2 entries)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("blocks delivery to private/internal hosts (SSRF guard)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { webhookChannel } = await import("../webhook");
    const result = await webhookChannel.send({ ...payload, recipient: "https://169.254.169.254/latest/meta-data" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("internal/private");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles network errors gracefully", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "test-secret");
    useInstantTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const { webhookChannel } = await import("../webhook");
    const result = await webhookChannel.send(payload);
    expect(result.success).toBe(false);
    expect(result.error).toContain("fetch failed");
  });

  it("sends without signature when no WEBHOOK_SECRET", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => null } });
    vi.stubGlobal("fetch", fetchMock);

    const { webhookChannel } = await import("../webhook");
    const result = await webhookChannel.send(payload);
    expect(result.success).toBe(true);
    const args = fetchMock.mock.calls[0][1];
    expect(args.headers["X-CheckByAI-Signature"]).toBeUndefined();
  });
});

// ── Registry ───────────────────────────────────────────────────────────────────

describe("channel registry", () => {
  beforeEach(() => { vi.resetModules(); });

  it("registers all default channels", async () => {
    const { registerDefaultChannels, getAvailableChannels, getChannel } = await import("../registry");
    registerDefaultChannels();
    const available = getAvailableChannels();
    expect(available).toContain("email");
    expect(available).toContain("whatsapp");
    expect(available).toContain("sms");
    expect(available).toContain("webhook");
    expect(available).toContain("push");
    expect(getChannel("email")).toBeDefined();
    expect(getChannel("push")).toBeDefined();
  });

  it("skips duplicate registration", async () => {
    const { registerDefaultChannels, registerChannel, getChannel } = await import("../registry");
    registerDefaultChannels();
    const before = getChannel("email");
    registerChannel(before!);
    expect(getChannel("email")).toBe(before);
  });

  it("returns undefined for unknown channel", async () => {
    const { getChannel } = await import("../registry");
    expect(getChannel("push" as any)).toBeUndefined();
  });
});
