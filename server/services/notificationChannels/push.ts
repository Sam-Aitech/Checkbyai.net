import type { NotificationChannel, ChannelPayload, SendResult } from "./types";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "Channel:Push" });

export const pushChannel: NotificationChannel = {
  name: "push",

  async send(payload: ChannelPayload): Promise<SendResult> {
    const webPushLib = await importWebPush();
    if (!webPushLib) {
      return { success: false, error: "web-push not configured" };
    }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublicKey || !vapidPrivateKey) {
      return { success: false, error: "VAPID keys not configured" };
    }

    const subscription = payload.subscriber;
    if (!subscription?.endpoint) {
      return { success: false, error: "No push subscription in payload" };
    }

    const title = getTitle(payload.changeType, payload.organisationName);
    const body = getBody(payload.changeType, payload.previousValue, payload.newValue);

    try {
      await webPushLib.sendNotification(
        subscription as any,
        JSON.stringify({ title, body, tag: `sponsor-${payload.changeId}`, url: "/sponsor-monitor" }),
        {
          vapidDetails: {
            subject: `mailto:${process.env.ADMIN_EMAIL ?? "admin@checkbyai.net"}`,
            publicKey: vapidPublicKey,
            privateKey: vapidPrivateKey,
          },
          TTL: 86400,
        },
      );
      return { success: true };
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (err.statusCode === 410 || err.statusCode === 404) {
        log.warn({ endpoint: subscription.endpoint, statusCode: err.statusCode },
          "Push subscription expired or unsubscribed — should be removed");
      }
      log.error({ err: errMsg }, "Web Push send failed");
      return { success: false, error: errMsg };
    }
  },
};

function getTitle(changeType: string, companyName: string): string {
  switch (changeType) {
    case "REMOVED_REVOKED": return `🚫 ${companyName} licence revoked`;
    case "NEW_LICENCE": return `✅ ${companyName} added as sponsor`;
    case "RE_ACTIVATED": return `✅ ${companyName} reinstated`;
    case "UPGRADED": return `⬆️ ${companyName} upgraded`;
    case "DOWNGRADED": return `⬇️ ${companyName} downgraded`;
    case "ROUTE_CHANGE": return `🔄 ${companyName} route changed`;
    case "NAME_CHANGE": return `✏️ ${companyName} renamed`;
    default: return `📢 ${companyName} changed`;
  }
}

function getBody(changeType: string, prev?: string | null, next?: string | null): string {
  switch (changeType) {
    case "REMOVED_REVOKED": return "Sponsor licence has been removed from the register.";
    case "NEW_LICENCE": return "New sponsor licence granted.";
    case "RE_ACTIVATED": return "Sponsor licence has been reinstated.";
    case "UPGRADED": return prev && next ? `Rating upgraded from ${prev} to ${next}.` : "Rating upgraded.";
    case "DOWNGRADED": return prev && next ? `Rating downgraded from ${prev} to ${next}.` : "Rating downgraded.";
    case "ROUTE_CHANGE": return prev && next ? `Route changed from ${prev} to ${next}.` : "Route changed.";
    case "NAME_CHANGE": return prev && next ? `Name changed from ${prev} to ${next}.` : "Name changed.";
    default: return "A change was detected.";
  }
}

async function importWebPush(): Promise<any> {
  try {
    return await import("web-push");
  } catch {
    return null;
  }
}
