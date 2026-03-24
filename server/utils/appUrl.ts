/**
 * Returns the public-facing application origin (no trailing slash).
 * Reads from APP_URL env, defaults to https://checkbyai.net.
 */
export function getAppUrl(): string {
  return (process.env.APP_URL || "https://checkbyai.net").replace(/\/+$/, "");
}
