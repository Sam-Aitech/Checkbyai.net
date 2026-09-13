import helmet from "helmet";
import type { RequestHandler } from "express";

// Replit's development Preview renders the app in an iframe. Keep
// clickjacking protection strict in production without blocking Preview.
export function createSecurityHeadersMiddleware(isProduction: boolean): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isProduction
          ? ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://challenges.cloudflare.com"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com", "https://challenges.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: isProduction
          ? ["'self'", "https://api.stripe.com", "https://challenges.cloudflare.com"]
          : ["'self'", "https://api.stripe.com", "https://challenges.cloudflare.com", "ws:", "wss:"],
        frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com", "https://challenges.cloudflare.com"],
        workerSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: isProduction ? ["'none'"] : null,
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    hsts: isProduction
      ? {
          maxAge: 63072000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    xFrameOptions: isProduction ? { action: "deny" } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
}