import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { buildEmail } from "../../utils/emailTemplates";
import { logger } from "../../utils/logger";
import { sendAdminAlert } from "../../utils/adminAlert";

const log = logger.child({ module: "Channel:Email" });

const FROM_ADDRESS = "Sponsor Monitor <alerts@checkbyai.net>";

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
            from: { email: FROM_ADDRESS.match(/<([^>]+)>/)?.[1] ?? "alerts@checkbyai.net" },
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
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await provider.send(payload.recipient, subject, html);
          if (result.success) {
            if (attempt > 0) {
              log.info(`Delivered via ${provider.name} after ${attempt} retries`);
            }
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

        if (attempt < 2) {
          const delays = [1000, 3000];
          await new Promise(r => setTimeout(r, delays[attempt] ?? 1000));
        }
      }
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
