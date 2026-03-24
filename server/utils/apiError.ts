import type { Response } from "express";

/**
 * Standardised API error response.
 * Shape: { message: string, code?: string, ...extra }
 *
 * Usage:
 *   return apiError(res, 400, "Valid email required");
 *   return apiError(res, 429, "Rate limit exceeded", { code: "ip_rate_limited", retryAfter: 3600 });
 */
export function apiError(
  res: Response,
  status: number,
  message: string,
  extra?: Record<string, unknown>,
): Response {
  return res.status(status).json({ message, ...extra });
}
