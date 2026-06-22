export type PlanTier = "free" | "starter" | "pro" | "unlimited" | "enterprise";

export interface TierConfig {
  watchLimit: number; // -1 = unlimited
  channels: ("email" | "sms" | "whatsapp" | "inApp")[];
  alertTiming: "next-morning" | "same-day" | "immediate";
  apiAccess: boolean;
  weeklyReports: boolean;
  csvUpload: boolean;
  webhooks: boolean;
  enrichedNotifications: boolean; // Company Intelligence block in email (Pro only)
  jobAlerts: boolean;             // Job opening alert digest (Pro only)
}

export const TIER_CONFIGS: Record<PlanTier, TierConfig> = {
  free: {
    watchLimit: 1,
    channels: [],                    // Free = NO notifications
    alertTiming: "next-morning",
    apiAccess: false,
    weeklyReports: false,
    csvUpload: false,
    webhooks: false,
    enrichedNotifications: false,
    jobAlerts: false,
  },
  starter: {
    watchLimit: 2,
    channels: ["email", "whatsapp", "inApp"],
    alertTiming: "same-day",
    apiAccess: false,
    weeklyReports: false,
    csvUpload: false,
    webhooks: false,
    enrichedNotifications: false,    // Starter = basic alert, no enrichment
    jobAlerts: false,
  },
  pro: {
    watchLimit: 5,
    channels: ["email", "whatsapp", "sms", "inApp"],
    alertTiming: "immediate",
    apiAccess: false,
    weeklyReports: false,
    csvUpload: false,
    webhooks: false,
    enrichedNotifications: true,     // Pro = enriched notification + job alerts
    jobAlerts: true,
  },
  unlimited: {
    watchLimit: -1,
    channels: ["email", "whatsapp", "sms", "inApp"],
    alertTiming: "immediate",
    apiAccess: true,
    weeklyReports: true,
    csvUpload: false,
    webhooks: false,
    enrichedNotifications: true,
    jobAlerts: true,
  },
  enterprise: {
    watchLimit: -1,
    channels: ["email", "whatsapp", "sms", "inApp"],
    alertTiming: "immediate",
    apiAccess: true,
    weeklyReports: true,
    csvUpload: true,
    webhooks: true,
    enrichedNotifications: true,
    jobAlerts: true,
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

export function isChannelAllowed(subscriptionStatus: string | null | undefined, channel: "email" | "sms" | "whatsapp" | "inApp"): boolean {
  return getTierConfig(subscriptionStatus).channels.includes(channel);
}

/** Returns true if this user should receive enriched company intelligence in notifications. */
export function hasEnrichedNotifications(subscriptionStatus: string | null | undefined): boolean {
  return getTierConfig(subscriptionStatus).enrichedNotifications;
}

/** Returns true if this user is eligible for job opening alert digests. */
export function hasJobAlerts(subscriptionStatus: string | null | undefined): boolean {
  return getTierConfig(subscriptionStatus).jobAlerts;
}

/** Returns true if user is on a paid plan that can receive any notifications at all. */
export function canReceiveNotifications(subscriptionStatus: string | null | undefined): boolean {
  return getTierConfig(subscriptionStatus).channels.length > 0;
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
