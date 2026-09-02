import crypto from "node:crypto";
import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { logger } from "../../utils/logger";
import { jitterDelay, parseRetryAfter } from "../../utils/jitterRetry";
import { waitForBucket } from "../../utils/tokenBucket";
import { getRedis } from "../../utils/redisClient";

const log = logger.child({ module: "Channel:Webhook" });

const MAX_ATTEMPTS = 3;

// SSRF guard: block delivery to loopback / private / link-local / metadata hosts.
// Webhook URLs are user-supplied (enterprise), so an attacker could otherwise point
// them at internal services. HTTPS-only is already enforced by the caller.
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,            // link-local (incl. cloud metadata 169.254.169.254)
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0 – 172.31.255.255
  /^::1$/,
  /^fe80:/i,               // IPv6 link-local
  /^f[cd][0-9a-f]{2}:/i,   // IPv6 unique-local (fc00::/7)
];

function isBlockedWebhookHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase(); // strip IPv6 brackets
  return BLOCKED_HOST_PATTERNS.some((re) => re.test(host));
}

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
    headers["X-CheckByAI-Signature"] = signPayload(bodyJson, secret);
    headers["X-CheckByAI-Timestamp"] = Math.floor(Date.now() / 1000).toString();
  }
  return headers;
}

// One delivery attempt. Resolves with a SendResult; network/abort errors reject
// and are handled by the retry loop in send().
async function attemptDelivery(
  webhookUrl: string,
  bodyJson: string,
  headers: Record<string, string>,
): Promise<SendResult> {
  const host = (()=>{ try{ return new URL(webhookUrl).hostname; } catch{ return "global"; }})();
  await waitForBucket("webhook", host);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(webhookUrl, { method: "POST", headers, body: bodyJson, signal: controller.signal });
    if (res.ok) {
      const providerMessageId = res.headers.get("X-Request-Id") ?? res.headers.get("x-request-id") ?? undefined;
      return { success: true, providerMessageId };
    }
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    if (retryAfter) await new Promise(r=>setTimeout(r, retryAfter));
    return { success: false, error: `HTTP ${res.status}: ${await res.text().catch(() => "no body")}` };
  } finally {
    clearTimeout(timeout);
  }
}

export const webhookChannel: NotificationChannel = {
  name: "webhook",

  async send(payload: ChannelPayload): Promise<SendResult> {
    const webhookUrl = payload.recipient;
    if (!webhookUrl?.startsWith("https://")) return { success: false, error: "Invalid webhook URL (must be HTTPS)" };
    let parsedHost: string;
    try { parsedHost = new URL(webhookUrl).hostname; } catch { return { success: false, error: "Invalid webhook URL" }; }
    if (isBlockedWebhookHost(parsedHost)) {
      log.warn({ webhookUrl }, "Webhook delivery blocked — internal/private host");
      return { success: false, error: "Webhook URL targets a disallowed (internal/private) host" };
    }
    const snap = payload.snapshotDate || new Date().toISOString().slice(0,10);
    const key = `${payload.userId}:${payload.changeId ?? 0}:webhook:${snap}`;
    const idem = crypto.createHash("sha256").update(key).digest("hex").slice(0,32);
    const r = getRedis();
    if (r) { try{ if(await r.get(`idem:notif:${idem}`)) return { success: true, providerMessageId: `idem:${idem}` }; }catch{} }
    const bodyJson = JSON.stringify(buildBody(payload));
    const headers = buildHeaders(bodyJson);
    let lastError: string | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await attemptDelivery(webhookUrl, bodyJson, headers);
        if (result.success) { if(r) try{ await r.set(`idem:notif:${idem}`,"1","EX",86400); }catch{} return result; }
        lastError = result.error;
        log.warn({ webhookUrl, attempt, error: lastError }, "Webhook delivery failed");
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        log.error({ err: lastError, webhookUrl, attempt }, "Webhook delivery threw");
      }
      if (attempt < MAX_ATTEMPTS - 1) await new Promise(rr => setTimeout(rr, jitterDelay(attempt, 1000, 30000)));
    }
    return { success: false, error: `Webhook delivery failed after ${MAX_ATTEMPTS} attempts: ${lastError}` };
  },
};
