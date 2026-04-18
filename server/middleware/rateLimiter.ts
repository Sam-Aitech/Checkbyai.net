import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
  skipSuccessfulRequests: false,
});

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
  skipSuccessfulRequests: false,
});

export const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
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
  message: { message: "Enrichment already queued for this sponsor. Please wait 5 minutes before requesting again." },
  keyGenerator: (req: any) => `enrich:${req.user?.id ?? req.ip}:${req.params?.fingerprint ?? ""}`,
  skipSuccessfulRequests: false,
});

// Sensitive control-plane trigger endpoint limiter.
export const opsTriggerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many orchestration trigger requests. Please try again later." },
  keyGenerator: (req: any) => `ops-trigger:${req.user?.id ?? req.ip}`,
  skipSuccessfulRequests: false,
});
