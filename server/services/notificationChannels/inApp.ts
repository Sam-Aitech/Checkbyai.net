import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { emitToUser } from "../socketGateway";

export const inAppChannel: NotificationChannel = {
  name: "inApp" as const,

  async send(payload: ChannelPayload): Promise<SendResult> {
    try {
      emitToUser(payload.userId, "notification", {
        id: payload.changeId,
        eventType: payload.eventType,
        companyName: payload.companyName,
        changeType: payload.changeType,
        previousValue: payload.previousValue,
        newValue: payload.newValue,
        detectedAt: new Date().toISOString(),
      });
      return { success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errMsg };
    }
  },
};
