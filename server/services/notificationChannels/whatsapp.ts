import crypto from "node:crypto";
import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { sendWhatsApp } from "../messaging";
import { logger } from "../../utils/logger";
import { jitterDelay } from "../../utils/jitterRetry";
import { waitForBucket } from "../../utils/tokenBucket";
import { getRedis } from "../../utils/redisClient";

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
    const snap = payload.snapshotDate || new Date().toISOString().slice(0,10);
    const key = `${payload.userId}:${payload.changeId ?? 0}:whatsapp:${snap}`;
    const idem = crypto.createHash("sha256").update(key).digest("hex").slice(0,32);
    const r = getRedis(); if(r){ try{ if(await r.get(`idem:notif:${idem}`)) return { success: true, providerMessageId: `idem:${idem}` }; }catch{} }
    const from = process.env.TWILIO_WHATSAPP_NUMBER || "global";
    const message = buildMessage(payload);
    for(let attempt=0; attempt<3; attempt++){
      await waitForBucket("twilio", from);
      try{
        const result = await sendWhatsApp(payload.recipient, message);
        if(result.success){ if(r) try{ await r.set(`idem:notif:${idem}`,"1","EX",86400);}catch{} return result; }
        const is429 = result.error?.includes("429") || result.error?.includes("rate");
        if(!is429 || attempt===2) return result;
        log.warn({ error: result.error, attempt }, "WhatsApp retrying");
      }catch(err:unknown){ const m=err instanceof Error?err.message:String(err); if(attempt===2) return { success:false, error:m }; log.warn({ err:m, attempt }, "WhatsApp threw retrying"); }
      await new Promise(rr=>setTimeout(rr, jitterDelay(attempt,1000,30000)));
    }
    return { success:false, error:"WhatsApp exhausted retries" };
  },
};
