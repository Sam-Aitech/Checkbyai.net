import { randomInt } from "node:crypto";

export function jitterDelay(attempt: number, baseMs = 1000, capMs = 30000): number {
  const exp = baseMs * Math.pow(2, attempt);
  // Retry-delay jitter doesn't need cryptographic randomness, but
  // crypto.randomInt (vs. Math.random) sidesteps static analysis tools
  // flagging pseudorandom-generator usage as a security hotspot needing
  // manual review, for no real cost here.
  const jitter = randomInt(1000);
  return Math.min(capMs, exp + jitter);
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number.parseInt(header, 10);
  if (!Number.isNaN(secs)) return secs * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}
