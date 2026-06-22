import { db } from "../../db";
import { notifLog } from "@shared/schema";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "NotifAudit" });

export interface NotificationLogEntry {
  id?: string;
  userId: string;
  changeId?: number | null;
  eventType: string;
  channel: string;
  companyName: string;
  success: boolean;
  providerMessageId?: string | null;
  errorDetails?: string | null;
}

export async function logNotification(entry: NotificationLogEntry): Promise<void> {
  try {
    await db.insert(notifLog).values({
      userId: entry.userId,
      changeId: entry.changeId ?? null,
      eventType: entry.eventType,
      channel: entry.channel,
      companyName: entry.companyName,
      success: entry.success,
      providerMessageId: entry.providerMessageId ?? null,
      errorDetails: entry.errorDetails ?? null,
    });
  } catch (err) {
    log.error({ err }, "[NotifAudit] Failed to write log entry");
  }
}
