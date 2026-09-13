import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createSecurityHeadersMiddleware } from "../../securityHeaders";

function makeApp(isProduction: boolean) {
  const app = express();
  app.use(createSecurityHeadersMiddleware(isProduction));
  app.get("/", (_req, res) => res.send("ok"));
  return app;
}

describe("security headers", () => {
  it("keeps development responses embeddable in Replit Preview", async () => {
    const response = await request(makeApp(false)).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["x-frame-options"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).not.toContain("frame-ancestors 'none'");
  });

  it("retains anti-framing protections in production", async () => {
    const response = await request(makeApp(true)).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});