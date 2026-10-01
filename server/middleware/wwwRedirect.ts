import type { RequestHandler } from "express";
import { getAppUrl } from "../utils/appUrl";

/**
 * Redirects www.<canonical host> to the canonical origin. The target is always built from the
 * configured canonical origin (never from a Host header), and any other Host value is left alone.
 */
export function createWwwRedirect(getBase: () => string = getAppUrl): RequestHandler {
  return (req, res, next) => {
    const host = req.headers.host?.toLowerCase();
    if (host?.startsWith("www.")) {
      const canonical = new URL(getBase());
      if (host.slice(4) === canonical.host.toLowerCase()) {
        // Parse the request path against the canonical origin and refuse anything that does not stay
        // on it (e.g. "//evil.example/x" resolves to another host). Only pathname + search are carried over.
        const requested = new URL(req.originalUrl, canonical.origin);
        const target = new URL(canonical.origin);
        if (requested.origin === canonical.origin) {
          target.pathname = requested.pathname;
          target.search = requested.search;
        }
        return res.redirect(301, target.toString());
      }
    }
    next();
  };
}
