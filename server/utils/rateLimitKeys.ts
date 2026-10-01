import { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

/**
 * Canonical rate-limit keys. Every limiter derives its key through these helpers so that casing,
 * Unicode forms, plus-tags and alias spellings of the same identity land in the same bucket.
 */

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Key for an email identity (limiter use only; never used to look up or create accounts).
 * Lowercased, Unicode-normalised, whitespace-trimmed; the +tag is dropped everywhere, and dots
 * are dropped for Gmail, so alias spellings of one mailbox share a budget.
 */
export function emailRateKey(email: unknown): string {
  if (typeof email !== "string") return "";
  const normalised = email.normalize("NFKC").trim().toLowerCase();
  const at = normalised.lastIndexOf("@");
  if (at < 1) return normalised;
  let local = normalised.slice(0, at);
  let domain = normalised.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  local = local.split("+")[0];
  if (GMAIL_DOMAINS.has(domain)) local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** Client IP, with IPv6 collapsed to its /56 and a socket fallback (never one shared "unknown" bucket). */
export function clientIpKey(req: Request): string {
  const ip = req.ip || req.socket?.remoteAddress || "";
  return ip ? ipKeyGenerator(ip) : "no-ip";
}

/** Authenticated principal when present, otherwise the client IP. */
export function userOrIpKey(req: Request): string {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  return userId ? `u:${userId}` : `ip:${clientIpKey(req)}`;
}
