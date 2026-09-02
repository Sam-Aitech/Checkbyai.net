export function jitterDelay(attempt: number, baseMs = 1000, capMs = 30000): number {
  const exp = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(capMs, exp + jitter);
}
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = parseInt(header, 10);
  if (!isNaN(secs)) return secs * 1000;
  const date = Date.parse(header);
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}
