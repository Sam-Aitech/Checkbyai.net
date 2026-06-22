import type { NotificationChannel, ChannelName } from "./types";
import { emailChannel } from "./email";
import { whatsAppChannel } from "./whatsapp";
import { smsChannel } from "./sms";
import { webhookChannel } from "./webhook";
import { pushChannel } from "./push";
import { inAppChannel } from "./inApp";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "ChannelRegistry" });

const channels: Map<ChannelName, NotificationChannel> = new Map();

export function registerDefaultChannels(): void {
  registerChannel(emailChannel);
  registerChannel(whatsAppChannel);
  registerChannel(smsChannel);
  registerChannel(webhookChannel);
  registerChannel(pushChannel);
  registerChannel(inAppChannel);
  log.info(`Registered ${channels.size} notification channels: ${[...channels.keys()].join(", ")}`);
}

export function registerChannel(channel: NotificationChannel): void {
  if (channels.has(channel.name as ChannelName)) {
    log.warn({ channel: channel.name }, "Channel already registered — skipping duplicate");
    return;
  }
  channels.set(channel.name as ChannelName, channel);
}

export function getChannel(name: ChannelName): NotificationChannel | undefined {
  return channels.get(name);
}

export function getAvailableChannels(): ChannelName[] {
  return [...channels.keys()];
}
