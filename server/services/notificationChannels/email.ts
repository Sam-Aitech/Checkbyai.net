import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { buildEmail } from "../../utils/emailTemplates";
import { logger } from "../../utils/logger";
import { sendAdminAlert } from "../../utils/adminAlert";
import { jitterDelay, parseRetryAfter } from "../../utils/jitterRetry";
import { waitForBucket } from "../../utils/tokenBucket";
import { buildIdempotencyKey, withIdempotency } from "../../utils/notifIdempotency";

const log = logger.child({ module: "Channel:Email" });

const FROM_EMAIL = "alerts@checkbyai.net";
const FROM_ADDRESS = `Sponsor Monitor <${FROM_EMAIL}>`;
const MAX_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Deterministic and cheap to recompute — withIdempotency() builds its own
// copy of this same key for the claim/release dance; this local copy is
// only for the Resend Idempotency-Key HTTP header, which no other channel
// needs.
function idempotencyKeyFor(payload: ChannelPayload): string | null {
  if (!payload.changeId || !payload.userId) return null;
  const snap = payload.snapshotDate || new Date().toISOString().slice(0, 10);
  return buildIdempotencyKey(payload.userId, payload.changeId, "email", snap);
}

let providerCache: EmailProvider[] | null = null;

interface EmailProvider {
  name: string;
  send(to: string, subject: string, html: string, idempotencyKey?: string): Promise<SendResult>;
}

function getProviders(): EmailProvider[] {
  if (providerCache) return providerCache;

  const providers: EmailProvider[] = [];

  if (process.env.RESEND_API_KEY) {
    providers.push({
      name: "Resend",
      async send(to, subject, html, idempotencyKey?: string) {
        await waitForBucket("resend", "global");
        const headers: Record<string,string> = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` };
        if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
        const res = await fetch("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }) });
        if (!res.ok) {
          const text = await res.text();
          const ra = parseRetryAfter(res.headers.get("retry-after"));
          if (ra) await delay(ra);
          return { success: false, error: `Resend ${res.status}: ${text}` };
        }
        const data: any = await res.json();
        return { success: true, providerMessageId: data.id };
      },
    });
  }

  if (process.env.SENDGRID_API_KEY) {
    providers.push({
      name: "SendGrid",
      async send(to, subject, html) {
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: FROM_EMAIL },
            subject,
            content: [{ type: "text/html", value: html }],
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          return { success: false, error: `SendGrid ${res.status}: ${text}` };
        }
        const data: any = await res.json();
        return { success: true, providerMessageId: data?.id ?? data?.message_id };
      },
    });
  }

  providerCache = providers;
  return providers;
}

export function clearProviderCache(): void {
  providerCache = null;
}

async function sendWithProvider(
  provider: EmailProvider,
  to: string,
  subject: string,
  html: string,
  idempotencyKey?: string,
): Promise<SendResult> {
  let lastError: string | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await provider.send(to, subject, html, idempotencyKey);
      if (result.success) {
        if (attempt > 0) log.info(`Delivered via ${provider.name} after ${attempt} retries`);
        return result;
      }
      lastError = result.error;
      log.warn({ provider: provider.name, attempt, error: result.error }, `Email send failed via ${provider.name}, attempt ${attempt + 1}`);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      log.error({ err: lastError, provider: provider.name, attempt }, `Email send threw via ${provider.name}`);
    }
    if (attempt < MAX_ATTEMPTS - 1) await delay(jitterDelay(attempt, 1000, 30000));
  }
  return { success: false, error: lastError };
}

async function sendViaAllProviders(payload: ChannelPayload): Promise<SendResult> {
  const idem = idempotencyKeyFor(payload);
  const { subject, html } = buildEmail(payload.changeType, payload.organisationName, payload.previousValue, payload.newValue);
  const providers = getProviders();
  if (providers.length === 0) {
    return { success: false, error: "No email providers configured (set RESEND_API_KEY or SENDGRID_API_KEY)" };
  }
  let lastError: string | undefined;
  for (const provider of providers) {
    const result = await sendWithProvider(provider, payload.recipient, subject, html, idem ?? undefined);
    if (result.success) return result;
    lastError = result.error;
  }

  sendAdminAlert(
    "ALERT: All email providers exhausted",
    `<p>Failed to deliver notification to ${payload.recipient} after all providers and retries.</p>
     <p><strong>Event:</strong> ${payload.eventType} — ${payload.companyName}</p>
     <p><strong>Last error:</strong> ${lastError ?? "Unknown"}</p>`,
  ).catch(() => {});

  return { success: false, error: `All providers exhausted: ${lastError ?? "Unknown"}` };
}

export const emailChannel: NotificationChannel = {
  name: "email",
  send(payload: ChannelPayload): Promise<SendResult> {
    return withIdempotency(payload, "email", () => sendViaAllProviders(payload));
  },
};
