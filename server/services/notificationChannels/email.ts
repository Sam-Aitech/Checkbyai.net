import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { buildEmail } from "../../utils/emailTemplates";
import { logger } from "../../utils/logger";
import { sendAdminAlert } from "../../utils/adminAlert";

const log = logger.child({ module: "Channel:Email" });

const FROM_EMAIL = "alerts@checkbyai.net";
const FROM_ADDRESS = `Sponsor Monitor <${FROM_EMAIL}>`;
const RETRY_DELAYS_MS = [1000, 3000];
const MAX_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let providerCache: EmailProvider[] | null = null;

interface EmailProvider {
  name: string;
  send(to: string, subject: string, html: string): Promise<SendResult>;
}

function getProviders(): EmailProvider[] {
  if (providerCache) return providerCache;

  const providers: EmailProvider[] = [];

  if (process.env.RESEND_API_KEY) {
    providers.push({
      name: "Resend",
      async send(to, subject, html) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
        });
        if (!res.ok) {
          const text = await res.text();
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

// Send via a single provider with bounded retries. Returns the first success,
// or a failure carrying the last error once attempts are exhausted.
async function sendWithProvider(
  provider: EmailProvider,
  to: string,
  subject: string,
  html: string,
): Promise<SendResult> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await provider.send(to, subject, html);
      if (result.success) {
        if (attempt > 0) log.info(`Delivered via ${provider.name} after ${attempt} retries`);
        return result;
      }
      lastError = result.error;
      log.warn({ provider: provider.name, attempt, error: result.error },
        `Email send failed via ${provider.name}, attempt ${attempt + 1}`);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      log.error({ err: lastError, provider: provider.name, attempt },
        `Email send threw via ${provider.name}`);
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await delay(RETRY_DELAYS_MS[attempt] ?? 1000);
    }
  }

  return { success: false, error: lastError };
}

export const emailChannel: NotificationChannel = {
  name: "email",

  async send(payload: ChannelPayload): Promise<SendResult> {
    const { subject, html } = buildEmail(
      payload.changeType,
      payload.organisationName,
      payload.previousValue,
      payload.newValue,
    );

    const providers = getProviders();
    if (providers.length === 0) {
      return { success: false, error: "No email providers configured (set RESEND_API_KEY or SENDGRID_API_KEY)" };
    }

    let lastError: string | undefined;
    for (const provider of providers) {
      const result = await sendWithProvider(provider, payload.recipient, subject, html);
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
  },
};
