import rateLimit, { type Options, type RateLimitRequestHandler, type Store } from "express-rate-limit";
import type { Request } from "express";
import { makeLazyRateLimitStore } from "../utils/redisRateLimitStore";
import { clientIpKey, emailRateKey, userOrIpKey } from "../utils/rateLimitKeys";

/**
 * Central limiter factory. Every limiter gets:
 *  - a Redis-backed store resolved lazily (shared across pods once Redis is up, in-process before),
 *  - a distinct key prefix,
 *  - the standard RateLimit-* headers and a uniform { message } 429 body,
 *  - a canonical key (see utils/rateLimitKeys.ts), so casing / alias spellings share one bucket.
 *
 * `store` is injectable so tests can drive the limiter deterministically.
 */
export interface LimiterConfig {
  /** Redis key prefix; MUST be unique per limiter. */
  prefix: string;
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
  store?: Store;
  skip?: Options["skip"];
}

export function createLimiter(config: LimiterConfig): RateLimitRequestHandler {
  return rateLimit({
    windowMs: config.windowMs,
    limit: config.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: config.store ?? makeLazyRateLimitStore(config.prefix),
    message: { message: config.message },
    keyGenerator: config.keyGenerator ?? ((req) => clientIpKey(req)),
    skip: config.skip,
    skipSuccessfulRequests: false,
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// ── Authentication ───────────────────────────────────────────────────────────

export const authLimiter = createLimiter({
  prefix: "rl:auth:",
  windowMs: 15 * MINUTE,
  max: 10,
  message: "Too many requests, please try again later.",
});

/** Per-account cap on password attempts, independent of source IP (credential stuffing). */
export const authAccountLimiter = createLimiter({
  prefix: "rl:auth-account:",
  windowMs: 15 * MINUTE,
  max: 20,
  message: "Too many attempts for this account. Please try again later.",
  keyGenerator: (req) => emailRateKey(req.body?.email) || clientIpKey(req),
});

export const otpLimiter = createLimiter({
  prefix: "rl:otp:",
  windowMs: 15 * MINUTE,
  max: 5,
  message: "Too many requests, please try again later.",
});

/**
 * Caps OTP requests per target email address, independent of the requester's IP.
 * otpLimiter alone only bounds requests from a single IP; without this, an
 * attacker distributed across IPs (or behind a shared NAT/proxy) can send an
 * unlimited number of OTP emails to one victim address. Keyed on the canonical
 * email (case, Unicode form, +tag and Gmail dots collapsed).
 */
export const otpEmailLimiter = createLimiter({
  prefix: "rl:otp-email:",
  windowMs: 15 * MINUTE,
  max: 5,
  message: "Too many verification codes requested for this email. Please try again later.",
  keyGenerator: (req) => emailRateKey(req.body?.email) || clientIpKey(req),
});

/**
 * Outer bound on verification guesses per account across all source IPs. (The per-code attempt
 * cap in services/emailOtp.ts is the primary control; this bounds raw request volume.)
 */
export const otpVerifyEmailLimiter = createLimiter({
  prefix: "rl:otp-verify-email:",
  windowMs: 15 * MINUTE,
  max: 20,
  message: "Too many verification attempts for this email. Please try again later.",
  keyGenerator: (req) => emailRateKey(req.body?.email) || clientIpKey(req),
});

// Admin OTP has its own buckets so admin and user flows can neither starve nor mask each other.
export const adminOtpLimiter = createLimiter({
  prefix: "rl:admin-otp:",
  windowMs: 15 * MINUTE,
  max: 5,
  message: "Too many requests, please try again later.",
});

export const adminOtpEmailLimiter = createLimiter({
  prefix: "rl:admin-otp-email:",
  windowMs: 15 * MINUTE,
  max: 5,
  message: "Too many verification codes requested for this email. Please try again later.",
  keyGenerator: (req) => emailRateKey(req.body?.email) || clientIpKey(req),
});

/** Phone/WhatsApp number verification (SMS cost abuse): per user, and per IP for unauthenticated spread. */
export const phoneOtpLimiter = createLimiter({
  prefix: "rl:phone-otp:",
  windowMs: 15 * MINUTE,
  max: 10,
  message: "Too many phone verification requests. Please try again later.",
  keyGenerator: userOrIpKey,
});

// ── Verification / uploads ───────────────────────────────────────────────────

export const verifyLimiter = createLimiter({
  prefix: "rl:verify:",
  windowMs: HOUR,
  max: 10,
  message: "Too many verification requests. Please try again in an hour.",
});

export const paidSubmitLimiter = createLimiter({
  prefix: "rl:paid-submit:",
  windowMs: HOUR,
  max: 20,
  message: "Too many submissions. Please try again later.",
  keyGenerator: userOrIpKey,
});

// ── Payments ─────────────────────────────────────────────────────────────────

/** Stripe-backed endpoints (checkout creation, portal, key/sign, verify): per user, falling back to IP. */
export const checkoutLimiter = createLimiter({
  prefix: "rl:checkout:",
  windowMs: 15 * MINUTE,
  max: 30,
  message: "Too many payment requests. Please try again later.",
  keyGenerator: userOrIpKey,
});

export const paidCheckoutLimiter = createLimiter({
  prefix: "rl:paid-checkout:",
  windowMs: 15 * MINUTE,
  max: 10,
  message: "Too many checkout requests. Please try again later.",
  keyGenerator: userOrIpKey,
});

// ── Webhook configuration ────────────────────────────────────────────────────

/** Saving notification preferences triggers outbound DNS/URL validation for the webhook URL. */
export const notificationPrefsLimiter = createLimiter({
  prefix: "rl:notif-prefs:",
  windowMs: 15 * MINUTE,
  max: 20,
  message: "Too many preference updates. Please try again later.",
  keyGenerator: userOrIpKey,
});

// ── Reads / exports ──────────────────────────────────────────────────────────

export const receiptVerifyLimiter = createLimiter({
  prefix: "rl:receipt-verify:",
  windowMs: 15 * MINUTE,
  max: 60,
  message: "Too many receipt checks. Please try again later.",
});

export const csvExportLimiter = createLimiter({
  prefix: "rl:csv-export:",
  windowMs: HOUR,
  max: 5,
  message: "Too many CSV downloads. Please wait before downloading again.",
});

export const feedbackLimiter = createLimiter({
  prefix: "rl:feedback:",
  windowMs: 15 * MINUTE,
  max: 3,
  message: "Too many feedback submissions. Please try again later.",
});

export const stripeKeyLimiter = createLimiter({
  prefix: "rl:stripe-key:",
  windowMs: MINUTE,
  max: 10,
  message: "Too many requests. Please try again later.",
});

// ── Per-user / per-resource ──────────────────────────────────────────────────

// Per-user + per-fingerprint: max 1 enrich request every 5 minutes for the same sponsor.
// Prevents a single Pro user from hammering the queue with duplicate priority-10 upserts.
export const enrichLimiter = createLimiter({
  prefix: "rl:enrich:",
  windowMs: 5 * MINUTE,
  max: 1,
  message: "Enrichment already queued for this sponsor. Please wait 5 minutes before requesting again.",
  keyGenerator: (req) =>
    `enrich:${userOrIpKey(req)}:${String(req.params?.fingerprint ?? "").normalize("NFKC").trim().toLowerCase()}`,
});

// Sensitive control-plane trigger endpoint limiter.
export const opsTriggerLimiter = createLimiter({
  prefix: "rl:ops-trigger:",
  windowMs: 15 * MINUTE,
  max: 5,
  message: "Too many orchestration trigger requests. Please try again later.",
  keyGenerator: (req) => `ops-trigger:${userOrIpKey(req)}`,
});
