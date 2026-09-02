import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { sendSMS } from "../messaging";
import { logger } from "../../utils/logger";
import { jitterDelay } from "../../utils/jitterRetry";
import { waitForBucket } from "../../utils/tokenBucket";
import { withIdempotency } from "../../utils/notifIdempotency";

const log = logger.child({ module: "Channel:SMS" });

function buildMessage(payload: ChannelPayload): string {
  const label = getLabel(payload.changeType, payload.previousValue, payload.newValue);
  return `CheckByAI: ${payload.organisationName} — ${label}. Details: ${process.env.APP_URL ?? "https://checkbyai.net"}/sponsor-monitor`;
}

function getLabel(changeType: string, prev?: string | null, next?: string | null): string {
  switch (changeType) {
    case "REMOVED_REVOKED": return "LICENCE REVOKED";
    case "NEW_LICENCE": return "New licence granted";
    case "RE_ACTIVATED": return "Licence reinstated";
    case "UPGRADED": return prev && next ? `Upgraded ${prev}→${next}` : "Upgraded";
    case "DOWNGRADED": return prev && next ? `Downgraded ${prev}→${next}` : "Downgraded";
    case "ROUTE_CHANGE": return prev && next ? `Route ${prev}→${next}` : "Route changed";
    case "NAME_CHANGE": return prev && next ? `Renamed ${prev}→${next}` : "Name changed";
    default: return `Change: ${changeType}`;
  }
}

async function sendWithRetry(payload: ChannelPayload): Promise<SendResult> {
  const message = buildMessage(payload);
  for (let attempt = 0; attempt < 3; attempt++) {
    // SMS goes through Brevo in this codebase, not Twilio — see server/services/messaging.ts.
    await waitForBucket("brevo", "global");
    try {
      const result = await sendSMS(payload.recipient, message);
      if (result.success) return result;
      const is429 = result.error?.includes("429") || result.error?.includes("rate");
      if (!is429 || attempt === 2) return result;
      log.warn({ error: result.error, attempt }, "SMS retrying");
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      if (attempt === 2) return { success: false, error: m };
      log.warn({ err: m, attempt }, "SMS threw retrying");
    }
    await new Promise((rr) => setTimeout(rr, jitterDelay(attempt, 1000, 30000)));
  }
  return { success: false, error: "SMS exhausted retries" };
}

export const smsChannel: NotificationChannel = {
  name: "sms",
  send(payload: ChannelPayload): Promise<SendResult> {
    return withIdempotency(payload, "sms", () => sendWithRetry(payload));
  },
};
