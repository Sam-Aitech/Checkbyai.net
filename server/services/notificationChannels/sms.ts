import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { sendSMS } from "../messaging";
import { logger } from "../../utils/logger";

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

export const smsChannel: NotificationChannel = {
  name: "sms",

  async send(payload: ChannelPayload): Promise<SendResult> {
    const message = buildMessage(payload);

    try {
      const result = await sendSMS(payload.recipient, message);
      if (!result.success) {
        log.warn({ error: result.error, recipient: payload.recipient },
          "SMS send failed");
      }
      return result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error({ err: errMsg, recipient: payload.recipient },
        "SMS send threw");
      return { success: false, error: errMsg };
    }
  },
};
