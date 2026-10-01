import crypto from "node:crypto";
import { getFailedAttempts, recordFailedAttempt, resetAttempts } from "../utils/otpAttemptStore";

/**
 * Email OTP primitives shared by the user and admin flows.
 *
 *  - 6 digits from a CSPRNG over the full 000000-999999 space.
 *  - Only a keyed hash (HMAC-SHA256) is stored; the hash is bound to the normalised email and to
 *    the flow ("user" | "admin"), so a code issued for one flow or address verifies nowhere else.
 *  - Verification is constant-time and does the same work whether or not the account exists.
 *  - A per-account failed-attempt cap invalidates guessing regardless of source IP.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

export type OtpScope = "user" | "admin";

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hmacKey(): Buffer {
  const secret = process.env.OTP_HASH_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET (or OTP_HASH_SECRET) is required to hash OTP codes");
  return crypto.createHmac("sha256", secret).update("checkbyai:email-otp:v1").digest();
}

export function hashOtpCode(email: string, code: string, scope: OtpScope): string {
  return crypto
    .createHmac("sha256", hmacKey())
    .update(`${scope}:${normalizeEmail(email)}:${code}`)
    .digest("hex");
}

/** Constant-time compare that always performs the HMAC, even when nothing is stored. */
export function otpHashMatches(stored: string | null | undefined, email: string, code: string, scope: OtpScope): boolean {
  const candidate = Buffer.from(hashOtpCode(email, code, scope), "hex");
  const reference = Buffer.from(stored && /^[0-9a-f]{64}$/.test(stored) ? stored : "0".repeat(64), "hex");
  const equal = crypto.timingSafeEqual(candidate, reference);
  return equal && !!stored && /^[0-9a-f]{64}$/.test(stored);
}

function attemptKey(email: string, scope: OtpScope): string {
  return `${scope}:${normalizeEmail(email)}`;
}

/** Call when a new code is issued: the new code starts with a fresh attempt budget. */
export async function resetOtpAttempts(email: string, scope: OtpScope): Promise<void> {
  await resetAttempts(attemptKey(email, scope));
}

export interface OtpSubject {
  verificationCode?: string | null;
  codeExpiry?: Date | null;
}

/**
 * Returns true only for a correct, unexpired code within the attempt budget.
 * `subject` is undefined when the account does not exist or is not eligible; the same
 * hashing, attempt accounting and result shape apply, so callers cannot tell the cases apart.
 */
export async function checkOtp(
  email: string,
  code: string,
  scope: OtpScope,
  subject: OtpSubject | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  const key = attemptKey(email, scope);
  const locked = (await getFailedAttempts(key)) >= MAX_OTP_ATTEMPTS;
  const hashMatches = otpHashMatches(subject?.verificationCode, email, code, scope);
  const notExpired = !!subject?.codeExpiry && now <= subject.codeExpiry;
  const ok = !locked && hashMatches && notExpired;
  if (ok) {
    await resetAttempts(key);
    return true;
  }
  if (!locked) await recordFailedAttempt(key);
  return false;
}

export const GENERIC_OTP_FAILURE = "Invalid or expired verification code";
