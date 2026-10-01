import crypto from "node:crypto";
import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { logger } from "../../utils/logger";
import { jitterDelay, parseRetryAfter } from "../../utils/jitterRetry";
import { waitForBucket } from "../../utils/tokenBucket";
import { withIdempotency } from "../../utils/notifIdempotency";
import { OutboundBlockedError, safeOutboundRequest } from "../../security/outboundPolicy";

const log = logger.child({ module: "Channel:Webhook" });

const MAX_ATTEMPTS = 3;

// Retry-After from a customer endpoint is untrusted: never stall a worker longer than this.
const MAX_RETRY_AFTER_MS = 30_000;

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function buildBody(payload: ChannelPayload): object {
  return {
    event: "sponsor.change",
    timestamp: new Date().toISOString(),
    data: {
      companyName: payload.organisationName,
      changeType: payload.changeType,
      previousValue: payload.previousValue,
      newValue: payload.newValue,
      snapshotDate: payload.snapshotDate,
      eventType: payload.eventType,
    },
  };
}

function buildHeaders(bodyJson: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "CheckByAI-Webhook/1.0",
  };
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const ts = Math.floor(Date.now() / 1000).toString();
    headers["X-CheckByAI-Signature"] = signPayload(bodyJson, secret);
    headers["X-CheckByAI-Timestamp"] = ts;
    // Replay-resistant: the timestamp is covered by this signature (legacy header kept for receivers).
    headers["X-CheckByAI-Signature-V2"] = signPayload(`${ts}.${bodyJson}`, secret);
  }
  return headers;
}

// One delivery attempt. Resolves with a SendResult; network errors reject and are handled
// by the retry loop in sendWithRetry(). OutboundBlockedError is never retried.
async function attemptDelivery(
  webhookUrl: string,
  bodyJson: string,
  headers: Record<string, string>,
): Promise<SendResult> {
  const host = (() => { try { return new URL(webhookUrl).hostname; } catch { return "global"; } })();
  await waitForBucket("webhook", host);
  // Policy re-validates scheme/port/DNS on every attempt and pins the connection to the validated IP.
  const res = await safeOutboundRequest(
    webhookUrl,
    { method: "POST", headers, body: bodyJson },
    { maxRedirects: 0, totalTimeoutMs: 10_000, maxResponseBytes: 4 * 1024 },
  );
  if (res.status >= 200 && res.status < 300) {
    const rid = res.headers["x-request-id"];
    return { success: true, providerMessageId: Array.isArray(rid) ? rid[0] : rid };
  }
  const retryAfterHeader = res.headers["retry-after"];
  const retryAfter = parseRetryAfter(Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : (retryAfterHeader ?? null));
  if (retryAfter) await new Promise((r) => setTimeout(r, Math.min(retryAfter, MAX_RETRY_AFTER_MS)));
  // Response bodies from customer endpoints are deliberately not propagated into logs/notif_log.
  return { success: false, error: `HTTP ${res.status}` };
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return "invalid"; }
}

async function sendWithRetry(payload: ChannelPayload, webhookUrl: string): Promise<SendResult> {
  const bodyJson = JSON.stringify(buildBody(payload));
  const headers = buildHeaders(bodyJson);
  let lastError: string | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await attemptDelivery(webhookUrl, bodyJson, headers);
      if (result.success) return result;
      lastError = result.error;
      log.warn({ host: hostOf(webhookUrl), attempt, error: lastError }, "Webhook delivery failed");
    } catch (err: unknown) {
      if (err instanceof OutboundBlockedError) {
        // Policy rejection is deterministic for this destination: do not retry.
        return { success: false, error: "Webhook URL targets a disallowed (internal/private) host" };
      }
      lastError = err instanceof Error ? err.message : String(err);
      log.error({ err: lastError, host: hostOf(webhookUrl), attempt }, "Webhook delivery threw");
    }
    if (attempt < MAX_ATTEMPTS - 1) await new Promise(rr => setTimeout(rr, jitterDelay(attempt, 1000, 30000)));
  }
  return { success: false, error: `Webhook delivery failed after ${MAX_ATTEMPTS} attempts: ${lastError}` };
}

export const webhookChannel: NotificationChannel = {
  name: "webhook",

  send(payload: ChannelPayload): Promise<SendResult> {
    const webhookUrl = payload.recipient;
    if (!webhookUrl?.startsWith("https://")) return Promise.resolve({ success: false, error: "Invalid webhook URL (must be HTTPS)" });
    // Full SSRF validation (scheme, port, credentials, DNS A/AAAA, IP classes) happens inside
    // safeOutboundRequest on every attempt. Validation precedes the idempotency claim's
    // side effects only for the cheap scheme check above.
    return withIdempotency(payload, "webhook", () => sendWithRetry(payload, webhookUrl));
  },
};
