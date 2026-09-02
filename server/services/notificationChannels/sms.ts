import crypto from "node:crypto";
import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { sendSMS } from "../messaging";
import { logger } from "../../utils/logger";
import { jitterDelay } from "../../utils/jitterRetry";
import { waitForBucket } from "../../utils/tokenBucket";
import { getRedis } from "../../utils/redisClient";

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
    const snap = payload.snapshotDate || new Date().toISOString().slice(0,10);
    const key = `${payload.userId}:${payload.changeId ?? 0}:sms:${snap}`;
    const idem = crypto.createHash("sha256").update(key).digest("hex").slice(0,32);
    const r = getRedis(); if(r){ try{ if(await r.get(`idem:notif:${idem}`)) return { success: true, providerMessageId: `idem:${idem}` }; }catch{} }
    const message = buildMessage(payload);
    for(let attempt=0; attempt<3; attempt++){
      await waitForBucket("brevo", "global");
      try{
        const result = await sendSMS(payload.recipient, message);
        if(result.success){ if(r) try{ await r.set(`idem:notif:${idem}`,"1","EX",86400);}catch{} return result; }
        const is429 = result.error?.includes("429") || result.error?.includes("rate");
        if(!is429 || attempt===2) return result;
        log.warn({ error: result.error, attempt }, "SMS retrying");
      }catch(err:unknown){ const m=err instanceof Error?err.message:String(err); if(attempt===2) return { success:false, error:m }; log.warn({ err:m, attempt }, "SMS threw retrying"); }
      await new Promise(rr=>setTimeout(rr, jitterDelay(attempt,1000,30000)));
    }
    return { success:false, error:"SMS exhausted retries" };
  },
};
