export type PlanTier = "free" | "starter" | "pro" | "unlimited" | "enterprise";

export interface TierConfig {
  watchLimit: number; // -1 = unlimited
  channels: ("email" | "sms" | "whatsapp")[];
  alertTiming: "next-morning" | "same-day" | "immediate";
  apiAccess: boolean;
  weeklyReports: boolean;
  csvUpload: boolean;
  webhooks: boolean;
}

export const TIER_CONFIGS: Record<PlanTier, TierConfig> = {
  free: {
    watchLimit: 1,
    channels: ["email"],
    alertTiming: "next-morning",
    apiAccess: false,
    weeklyReports: false,
    csvUpload: false,
    webhooks: false,
  },
  starter: {
    watchLimit: 5,
    channels: ["email", "whatsapp"],
    alertTiming: "same-day",
    apiAccess: false,
    weeklyReports: false,
    csvUpload: false,
    webhooks: false,
  },
  pro: {
    watchLimit: 20,
    channels: ["email", "whatsapp", "sms"],
    alertTiming: "immediate",
    apiAccess: false,
    weeklyReports: false,
    csvUpload: false,
    webhooks: false,
  },
  unlimited: {
    watchLimit: -1,
    channels: ["email", "whatsapp", "sms"],
    alertTiming: "immediate",
    apiAccess: true,
    weeklyReports: true,
    csvUpload: false,
    webhooks: false,
  },
  enterprise: {
    watchLimit: -1,
    channels: ["email", "whatsapp", "sms"],
    alertTiming: "immediate",
    apiAccess: true,
    weeklyReports: true,
    csvUpload: true,
    webhooks: true,
  },
};

const STATUS_TO_TIER: Record<string, PlanTier> = {
  free: "free",
  starter: "starter",
  pro: "pro",
  unlimited: "unlimited",
  enterprise: "enterprise",
};

export function getTierConfig(subscriptionStatus: string | null | undefined): TierConfig {
  const status = subscriptionStatus || "free";
  const tier = STATUS_TO_TIER[status] || "free";
  return TIER_CONFIGS[tier];
}

export function resolveTier(subscriptionStatus: string | null | undefined): PlanTier {
  const status = subscriptionStatus || "free";
  return STATUS_TO_TIER[status] || "free";
}

export function getWatchLimit(subscriptionStatus: string | null | undefined): number {
  return getTierConfig(subscriptionStatus).watchLimit;
}

export function isChannelAllowed(subscriptionStatus: string | null | undefined, channel: "email" | "sms" | "whatsapp"): boolean {
  return getTierConfig(subscriptionStatus).channels.includes(channel);
}

export function getDeliverAfter(subscriptionStatus: string | null | undefined): Date | null {
  const config = getTierConfig(subscriptionStatus);

  if (config.alertTiming === "immediate") {
    return null;
  }

  const now = new Date();

  if (config.alertTiming === "next-morning") {
    const tomorrow8am = new Date(now);
    tomorrow8am.setUTCDate(tomorrow8am.getUTCDate() + 1);
    tomorrow8am.setUTCHours(8, 0, 0, 0);
    return tomorrow8am;
  }

  if (config.alertTiming === "same-day") {
    const today6pm = new Date(now);
    today6pm.setUTCHours(18, 0, 0, 0);
    if (now >= today6pm) {
      today6pm.setUTCDate(today6pm.getUTCDate() + 1);
    }
    return today6pm;
  }

  return null;
}
