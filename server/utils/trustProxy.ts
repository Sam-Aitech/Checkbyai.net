/**
 * Number of reverse proxies in front of the app whose X-Forwarded-For entries are trusted.
 *
 * Express derives req.ip (used by every IP-keyed rate limiter) from the right-hand end of
 * X-Forwarded-For, skipping this many trusted hops. Too low and every client collapses into the
 * proxy's address; too high and a client can spoof its own IP. Set TRUST_PROXY_HOPS to the real
 * topology (Cloudflare -> Nginx -> Node is 2). Default 1 preserves the previous behaviour.
 */
export function getTrustProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TRUST_PROXY_HOPS;
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  }
  return n;
}
