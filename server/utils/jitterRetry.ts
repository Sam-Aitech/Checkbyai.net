export function jitterDelay(attempt: number, baseMs = 1000, capMs = 30000): number {
  const exp = baseMs * Math.pow(2, attempt);
  // Math.random() is fine here — this jitters a retry delay, not a security
  // token or secret, so cryptographic randomness isn't needed.
  const jitter = Math.random() * 1000;
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
