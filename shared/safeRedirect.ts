/**
 * Post-authentication / return-URL validation shared by client and server.
 *
 * Only application-relative paths are accepted. Everything that a browser could interpret as
 * a different origin is rejected: protocol-relative URLs (//host), backslash variants (/\host),
 * control characters browsers strip (/\t/host), absolute URLs and schemes, credentials, and
 * percent-encoded forms of all of those (single or repeated encoding).
 */

const MAX_LENGTH = 2048;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f\\]/;
const PLACEHOLDER_ORIGIN = "https://app.invalid";

function looksLikeOtherOrigin(path: string): boolean {
  return FORBIDDEN_CHARS.test(path) || path.startsWith("//") || !path.startsWith("/");
}

export function safeRedirectPath(input: unknown, fallback: string | null = null): string | null {
  if (typeof input !== "string") return fallback;
  const value = input;
  if (value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (looksLikeOtherOrigin(value)) return fallback;

  // Reject encoded bypasses: decode up to three layers and re-check each one.
  let decoded = value;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return fallback; // malformed escape sequence
    }
    if (next === decoded) break;
    decoded = next;
    if (looksLikeOtherOrigin(decoded)) return fallback;
  }

  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN || url.username || url.password) return fallback;

  // Dot-segment normalisation can itself produce "//host" (e.g. "/a/..//evil"): check the result.
  const normalised = `${url.pathname}${url.search}${url.hash}`;
  if (looksLikeOtherOrigin(normalised)) return fallback;
  return normalised;
}
