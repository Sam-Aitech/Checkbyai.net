export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface NotificationChannel {
  readonly name: string;
  send(payload: ChannelPayload): Promise<SendResult>;
}

export interface ChannelPayload {
  userId: string;
  changeId?: number;
  eventType: string;
  companyName: string;
  organisationName: string;
  changeType: string;
  previousValue: string | null | undefined;
  newValue: string | null | undefined;
  snapshotDate?: string;
  recipient: string;
  subscriber?: WebPushSubscription;
}

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export type ChannelName = "email" | "whatsapp" | "sms" | "webhook" | "push" | "inApp";
