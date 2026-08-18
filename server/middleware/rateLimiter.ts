import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { makeRateLimitStore } from "../utils/redisRateLimitStore";

// All limiters use Redis-backed stores when Redis is available (shared across pods).
// express-rate-limit falls back to in-process MemoryStore automatically.

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore("rl:auth:"),
  message: { message: "Too many requests, please try again later." },
  skipSuccessfulRequests: false,
});

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore("rl:otp:"),
  message: { message: "Too many requests, please try again later." },
  skipSuccessfulRequests: false,
});

/**
 * Caps OTP requests per target email address, independent of the requester's IP.
 * otpLimiter alone only bounds requests from a single IP; without this, an
 * attacker distributed across IPs (or behind a shared NAT/proxy) can send an
 * unlimited number of OTP emails to one victim address. Keyed on the email in
 * the request body rather than the caller's IP.
 */
export const otpEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore("rl:otp-email:"),
  message: { message: "Too many verification codes requested for this email. Please try again later." },
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email || ipKeyGenerator(req.ip ?? "unknown");
  },
});

export const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore("rl:verify:"),
  message: { message: "Too many verification requests. Please try again in an hour." },
  skipSuccessfulRequests: false,
});

// Per-user + per-fingerprint: max 1 enrich request every 5 minutes for the same sponsor.
// Prevents a single Pro user from hammering the queue with duplicate priority-10 upserts.
export const enrichLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore("rl:enrich:"),
  message: { message: "Enrichment already queued for this sponsor. Please wait 5 minutes before requesting again." },
  keyGenerator: (req: any) => `enrich:${req.user?.id ?? ipKeyGenerator(req.ip ?? "")}:${req.params?.fingerprint ?? ""}`,
  skipSuccessfulRequests: false,
});

// Sensitive control-plane trigger endpoint limiter.
export const opsTriggerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore("rl:ops-trigger:"),
  message: { message: "Too many orchestration trigger requests. Please try again later." },
  keyGenerator: (req: any) => `ops-trigger:${req.user?.id ?? ipKeyGenerator(req.ip ?? "")}`,
  skipSuccessfulRequests: false,
});
