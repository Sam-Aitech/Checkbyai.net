import type { Response } from "express";

/**
 * Known machine-readable error codes clients branch on. Keep in sync with
 * client/src/lib/apiEnvelope.ts's ApiErrorCode re-export — a code used here
 * that isn't in the client union (or vice versa) is a compile error on
 * whichever side is stale, instead of a silently-dead client branch.
 */
export type ApiErrorCode = "beta_login_required" | "cos_access_denied";

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
  code?: ApiErrorCode;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function success<T>(res: Response, data: T, status = 200) {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(status).json(body);
}

export function fail(
  res: Response,
  error: string,
  status = 400,
  code?: ApiErrorCode,
) {
  const body: ApiFailure = { success: false, error, ...(code ? { code } : {}) };
  return res.status(status).json(body);
}
