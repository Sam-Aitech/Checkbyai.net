/**
 * Every server route responds through server/lib/response.ts's
 * `{ success, data }` / `{ success, error, code }` envelope. Any code that
 * reads a fetch/apiRequest response body must unwrap it through this helper
 * — a hand-rolled `json?.data ?? json` fallback silently misreads the
 * envelope itself as the payload whenever `data` is falsy (0, "", false,
 * null), which is how the "every verification renders as FAKE" and
 * "Payment Successful for a failed charge" bugs happened.
 */

// Keep in sync with server/lib/response.ts's ApiErrorCode.
export type ApiErrorCode = "beta_login_required" | "cos_access_denied";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  error: string;
  code?: ApiErrorCode;
}

function isApiSuccess(json: unknown): json is ApiSuccess<unknown> {
  return (
    json !== null &&
    typeof json === "object" &&
    (json as { success?: unknown }).success === true &&
    "data" in json
  );
}

export function isApiFailure(json: unknown): json is ApiFailure {
  return (
    json !== null &&
    typeof json === "object" &&
    (json as { success?: unknown }).success === false
  );
}

/** Unwraps `{ success: true, data }` to `data`; returns the raw JSON unchanged for anything else. */
export function unwrapApiEnvelope<T>(json: unknown): T {
  if (isApiSuccess(json)) {
    return json.data as T;
  }
  return json as T;
}
