/**
 * otpEmailLimiter.test.ts
 *
 * Regression coverage for the security-audit finding that OTP requests were
 * only rate-limited per IP (otpLimiter), so a caller distributed across many
 * IPs — or behind a shared NAT/proxy — could send an unbounded number of OTP
 * emails to one target address. otpEmailLimiter closes that gap by keying on
 * the target email in the request body instead of the caller's IP.
 */
import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";

import { otpEmailLimiter } from "../rateLimiter";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post("/api/auth/email/send-otp", otpEmailLimiter, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("otpEmailLimiter", () => {
  it("allows requests for a given email up to the limit", async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/email/send-otp")
        .send({ email: "victim@example.com" });
      expect(res.status).toBe(200);
    }
  });

  it("blocks further requests for the same email once the limit is exceeded", async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/email/send-otp").send({ email: "victim2@example.com" });
    }
    const res = await request(app)
      .post("/api/auth/email/send-otp")
      .send({ email: "victim2@example.com" });
    expect(res.status).toBe(429);
  });

  it("tracks different emails independently, even from the same IP", async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/email/send-otp").send({ email: "exhausted@example.com" });
    }
    // Same caller (same in-process request agent / IP), different target email.
    const res = await request(app)
      .post("/api/auth/email/send-otp")
      .send({ email: "fresh@example.com" });
    expect(res.status).toBe(200);
  });

  it("is case-insensitive on the email so Victim@x and victim@x share one bucket", async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/email/send-otp").send({ email: "Casing@Example.com" });
    }
    const res = await request(app)
      .post("/api/auth/email/send-otp")
      .send({ email: "casing@example.com" });
    expect(res.status).toBe(429);
  });

  it("falls back to an IP-keyed bucket when no email is present", async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/auth/email/send-otp").send({});
      expect(res.status).toBe(200);
    }
    const res = await request(app).post("/api/auth/email/send-otp").send({});
    expect(res.status).toBe(429);
  });
});
