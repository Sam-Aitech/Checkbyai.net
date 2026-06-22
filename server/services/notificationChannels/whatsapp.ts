import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { sendWhatsApp } from "../messaging";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "Channel:WhatsApp" });

function buildMessage(payload: ChannelPayload): string {
  const emoji = getEmoji(payload.changeType);
  return `${emoji} Sponsor Licence Update\n\n` +
    `${payload.organisationName}\n` +
    `${getLabel(payload.changeType, payload.previousValue, payload.newValue)}\n\n` +
    `Check details: ${process.env.APP_URL ?? "https://checkbyai.net"}/sponsor-monitor`;
}

function getEmoji(changeType: string): string {
  switch (changeType) {
    case "REMOVED_REVOKED": return "🚫";
    case "NEW_LICENCE": case "RE_ACTIVATED": return "✅";
    case "UPGRADED": return "⬆️";
    case "DOWNGRADED": return "⬇️";
    case "ROUTE_CHANGE": return "🔄";
    case "NAME_CHANGE": return "✏️";
    default: return "📢";
  }
}

function getLabel(changeType: string, prev?: string | null, next?: string | null): string {
  switch (changeType) {
    case "REMOVED_REVOKED": return "Sponsor licence REMOVED from register";
    case "NEW_LICENCE": return "New sponsor licence granted";
    case "RE_ACTIVATED": return "Sponsor licence reinstated";
    case "UPGRADED": return prev && next ? `Rating upgraded: ${prev} → ${next}` : "Rating upgraded";
    case "DOWNGRADED": return prev && next ? `Rating downgraded: ${prev} → ${next}` : "Rating downgraded";
    case "ROUTE_CHANGE": return prev && next ? `Route changed: ${prev} → ${next}` : "Route changed";
    case "NAME_CHANGE": return prev && next ? `Name changed: ${prev} → ${next}` : "Name changed";
    default: return `Change detected: ${changeType}`;
  }
}

export const whatsAppChannel: NotificationChannel = {
  name: "whatsapp",

  async send(payload: ChannelPayload): Promise<SendResult> {
    const message = buildMessage(payload);

    try {
      const result = await sendWhatsApp(payload.recipient, message);
      if (!result.success) {
        log.warn({ error: result.error, recipient: payload.recipient },
          "WhatsApp send failed");
      }
      return result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error({ err: errMsg, recipient: payload.recipient },
        "WhatsApp send threw");
      return { success: false, error: errMsg };
    }
  },
};
