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
        const pathAndQuery = req.originalUrl.startsWith("/") ? req.originalUrl : "/";
        return res.redirect(301, `${canonical.origin}${pathAndQuery}`);
      }
    }
    next();
  };
}
