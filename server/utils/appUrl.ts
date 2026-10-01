/**
 * Returns the public-facing application origin (no trailing slash).
 * Reads from APP_URL env, defaults to https://checkbyai.net.
 */
export function getAppUrl(): string {
  return (process.env.APP_URL || "https://checkbyai.net").replace(/\/+$/, "");
}

/**
 * Base URL for redirects that leave the app and come back (Stripe success/cancel/return URLs).
 *
 * Never derived from the client-controlled Host or Origin headers in production: APP_URL, or the
 * canonical origin. Outside production (local dev, preview deployments) the request host is used
 * so those environments keep working.
 */
export function getRedirectBaseUrl(req: { protocol: string; get(name: string): string | undefined }): string {
  if (process.env.APP_URL || process.env.NODE_ENV === "production") return getAppUrl();
  const host = req.get("host");
  if (!host) return getAppUrl();
  // Accept only a bare host[:port]: parsing must round-trip exactly (no userinfo, path, query or fragment).
  try {
    const parsed = new URL(`http://${host}`);
    if (parsed.host === host.toLowerCase() && !parsed.username && parsed.pathname === "/") {
      return `${req.protocol}://${parsed.host}`;
    }
  } catch {
    // fall through to the canonical origin
  }
  return getAppUrl();
}
