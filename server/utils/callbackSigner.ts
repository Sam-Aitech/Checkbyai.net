import crypto from "crypto";
import { isSafeOutboundUrl } from "../security/outboundPolicy";

const SIGNATURE_PREFIX = "sha256=";

export function signPayload(payload: string, secret: string): string {
  const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${SIGNATURE_PREFIX}${digest}`;
}

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature.startsWith(SIGNATURE_PREFIX)) return false;

  const expected = signPayload(payload, secret);
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(signature, "utf8");

  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Replay-resistant variant: signs `${timestamp}.${payload}`. Sent in addition to the
 * legacy body-only signature so existing receivers keep working.
 */
export function signPayloadWithTimestamp(payload: string, secret: string, timestampSeconds: number): string {
  return signPayload(`${timestampSeconds}.${payload}`, secret);
}

/**
 * Backwards-compatible wrapper. All validation (scheme, port, credentials, DNS
 * A/AAAA classification) lives in server/security/outboundPolicy.ts.
 */
export async function isSafeCallbackUrl(rawUrl: string): Promise<boolean> {
  return isSafeOutboundUrl(rawUrl);
}
