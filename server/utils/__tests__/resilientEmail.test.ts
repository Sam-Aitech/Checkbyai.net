import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock is hoisted by Vitest — this runs before any imports below
vi.mock("../adminAlert", () => ({
  sendAdminAlert: vi.fn().mockResolvedValue(undefined),
}));

import { sendEmailReliably } from "../resilientEmail";
import { sendAdminAlert } from "../adminAlert";

const PAYLOAD = {
  from: "alerts@checkbyai.net",
  to: ["user@example.com"],
  subject: "Test Subject",
  html: "<p>Test</p>",
};

describe("sendEmailReliably", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.RESEND_API_KEY = "re_test_key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RESEND_API_KEY;
  });

  it("returns false without calling fetch when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await sendEmailReliably(PAYLOAD, "[Test]");

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns true immediately on first successful response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("", { status: 200 }),
    );

    const resultPromise = sendEmailReliably(PAYLOAD, "[Test]");
    await vi.runAllTimersAsync();

    expect(await resultPromise).toBe(true);
  });

  it("retries after a 5xx error and returns true on second attempt", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("gateway error", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const resultPromise = sendEmailReliably(PAYLOAD, "[Test]");
    await vi.runAllTimersAsync();

    expect(await resultPromise).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("makes exactly 3 attempts (initial + 2 retries) before giving up", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("bad", { status: 500 }));

    const resultPromise = sendEmailReliably(PAYLOAD, "[Test]");
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("returns false when all 3 attempts fail", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("down", { status: 503 }));

    const resultPromise = sendEmailReliably(PAYLOAD, "[Test]");
    await vi.runAllTimersAsync();

    expect(await resultPromise).toBe(false);
  });

  it("calls sendAdminAlert when all retries are exhausted", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("down", { status: 503 }));

    const resultPromise = sendEmailReliably(PAYLOAD, "[Test]");
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(sendAdminAlert).toHaveBeenCalledWith(
      expect.stringContaining("Test Subject"),
      expect.stringContaining("[Test]"),
    );
  });

  it("retries on network errors (fetch throws)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const resultPromise = sendEmailReliably(PAYLOAD, "[Test]");
    await vi.runAllTimersAsync();

    expect(await resultPromise).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT call sendAdminAlert when email succeeds", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    const resultPromise = sendEmailReliably(PAYLOAD, "[Test]");
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(sendAdminAlert).not.toHaveBeenCalled();
  });
});
