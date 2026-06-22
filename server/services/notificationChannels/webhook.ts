import crypto from "crypto";
import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "Channel:Webhook" });

const RETRY_DELAYS_MS = [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000];

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

export const webhookChannel: NotificationChannel = {
  name: "webhook",

  async send(payload: ChannelPayload): Promise<SendResult> {
    const webhookUrl = payload.recipient;
    if (!webhookUrl || !webhookUrl.startsWith("https://")) {
      return { success: false, error: "Invalid webhook URL (must be HTTPS)" };
    }

    const body = buildBody(payload);
    const bodyJson = JSON.stringify(body);
    const secret = process.env.WEBHOOK_SECRET;
    const signature = secret ? signPayload(bodyJson, secret) : undefined;

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "CheckByAI-Webhook/1.0",
        };
        if (signature) {
          headers["X-CheckByAI-Signature"] = signature;
          headers["X-CheckByAI-Timestamp"] = Math.floor(Date.now() / 1000).toString();
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: bodyJson,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const providerMessageId = res.headers.get("X-Request-Id") ?? res.headers.get("x-request-id") ?? undefined;
          return { success: true, providerMessageId };
        }

        lastError = `HTTP ${res.status}: ${await res.text().catch(() => "no body")}`;
        log.warn({ webhookUrl, attempt, status: res.status, error: lastError },
          "Webhook delivery failed");
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        log.error({ err: lastError, webhookUrl, attempt },
          "Webhook delivery threw");
      }

      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }

    return { success: false, error: `Webhook delivery failed after ${RETRY_DELAYS_MS.length + 1} attempts: ${lastError}` };
  },
};
