import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createWwwRedirect } from "../wwwRedirect";
import { getRedirectBaseUrl } from "../../utils/appUrl";

function app() {
  const a = express();
  a.use(createWwwRedirect(() => "https://checkbyai.net"));
  a.get("*", (_req, res) => res.send("ok"));
  return a;
}

afterEach(() => vi.unstubAllEnvs());

describe("www redirect", () => {
  it("redirects www.<canonical> to the canonical origin, keeping path and query", async () => {
    const res = await request(app()).get("/pricing?x=1").set("Host", "www.checkbyai.net");
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe("https://checkbyai.net/pricing?x=1");
  });

  it("does not redirect to an attacker-chosen host", async () => {
    const res = await request(app()).get("/").set("Host", "www.evil.example");
    expect(res.status).toBe(200);
  });

  it("cannot be turned into an open redirect through the request path", async () => {
    const res = await request(app()).get("//evil.example/x").set("Host", "www.checkbyai.net");
    expect(res.status).toBe(301);
    expect(new URL(res.headers.location).origin).toBe("https://checkbyai.net");
  });

  it("leaves non-www hosts alone", async () => {
    expect((await request(app()).get("/").set("Host", "checkbyai.net")).status).toBe(200);
  });
});

describe("getRedirectBaseUrl (Stripe return URLs)", () => {
  const req = (host: string) => ({ protocol: "http", get: (n: string) => (n === "host" ? host : undefined) });

  it("ignores the Host header in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(getRedirectBaseUrl(req("evil.example"))).toBe("https://checkbyai.net");
  });

  it("uses APP_URL when configured, whatever the Host header says", () => {
    vi.stubEnv("APP_URL", "https://staging.checkbyai.net/");
    expect(getRedirectBaseUrl(req("evil.example"))).toBe("https://staging.checkbyai.net");
  });

  it("keeps local development working outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "");
    expect(getRedirectBaseUrl(req("localhost:5000"))).toBe("http://localhost:5000");
  });

  it("rejects malformed hosts even in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "");
    expect(getRedirectBaseUrl(req("evil.example/@x"))).toBe("https://checkbyai.net");
  });
});
