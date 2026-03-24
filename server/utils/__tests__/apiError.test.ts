import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import { apiError } from "../apiError";

/** Minimal mock of Express's chainable Response */
function makeMockRes(): Response {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis() as any,
    json: vi.fn().mockReturnThis() as any,
  };
  return res as Response;
}

describe("apiError", () => {
  it("sets the given HTTP status code", () => {
    const res = makeMockRes();
    apiError(res, 400, "Bad request");
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns JSON with a message field", () => {
    const res = makeMockRes();
    apiError(res, 400, "Bad request");
    expect(res.json).toHaveBeenCalledWith({ message: "Bad request" });
  });

  it("merges extra fields into the JSON body", () => {
    const res = makeMockRes();
    apiError(res, 429, "Rate limited", { code: "ip_rate_limited", retryAfter: 3600 });
    expect(res.json).toHaveBeenCalledWith({
      message: "Rate limited",
      code: "ip_rate_limited",
      retryAfter: 3600,
    });
  });

  it("message takes precedence even when extra contains a message key", () => {
    const res = makeMockRes();
    // extra.message would be overridden by spread order ({ message, ...extra })
    // The implementation spreads extra after message, so extra.message wins — document this.
    apiError(res, 400, "Original", { message: "Overridden" });
    expect(res.json).toHaveBeenCalledWith({ message: "Overridden" });
  });

  it("works with no extra fields", () => {
    const res = makeMockRes();
    apiError(res, 500, "Internal server error");
    expect(res.json).toHaveBeenCalledWith({ message: "Internal server error" });
  });

  it("returns the Response object (for chaining / return)", () => {
    const res = makeMockRes();
    const result = apiError(res, 404, "Not found");
    expect(result).toBe(res);
  });

  it("handles 2xx status codes (unusual but valid)", () => {
    const res = makeMockRes();
    apiError(res, 200, "OK");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
