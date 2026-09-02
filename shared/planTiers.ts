// Canonical plan-tier configuration, shared between client and server so
// entitlements and alert-timing copy can never drift between the two.

export type PlanTier = "free" | "starter" | "pro" | "unlimited" | "enterprise";

export type NotificationChannel = "email" | "sms" | "whatsapp" | "inApp";

export interface TierConfig {
  watchLimit: number; // -1 = unlimited
  channels: readonly NotificationChannel[];
  alertTiming: "next-morning" | "same-day" | "immediate";
  apiAccess: boolean;
  weeklyReports: boolean;
  csvUpload: boolean;
  webhooks: boolean;
  enrichedNotifications: boolean; // Company Intelligence block in email (Pro only)
  jobAlerts: boolean;             // Job opening alert digest (Pro only)
}

// Object.freeze is shallow, so a plain `Object.freeze({...})` around the
// whole map would still let `TIER_CONFIGS.pro.channels.push(...)` through —
// each tier's config object (and its channels array) must be frozen
// individually too. This helper does both, so no importer — client or
// server — can mutate the canonical singleton at runtime and silently
// corrupt entitlements for every subsequent call in the process.
function freezeTier<T extends TierConfig>(config: T): Readonly<T> {
  return Object.freeze({ ...config, channels: Object.freeze(config.channels) });
}

export const TIER_CONFIGS: Readonly<Record<PlanTier, TierConfig>> = Object.freeze({
  free: freezeTier({
    watchLimit: 1,
    channels: ["email"],             // Free = email alerts only, no SMS/WhatsApp
    alertTiming: "next-morning",
    apiAccess: false,
    weeklyReports: false,
    csvUpload: false,
    webhooks: false,
    enrichedNotifications: false,
    jobAlerts: false,
  }),
  starter: freezeTier({
    watchLimit: 2,
    channels: ["email", "whatsapp", "inApp"],
    alertTiming: "same-day",
    apiAccess: false,
    weeklyReports: false,
    csvUpload: false,
    webhooks: false,
    enrichedNotifications: false,    // Starter = basic alert, no enrichment
    jobAlerts: false,
  }),
  pro: freezeTier({
    watchLimit: 5,
    channels: ["email", "whatsapp", "sms", "inApp"],
    alertTiming: "immediate",
    apiAccess: false,
    weeklyReports: false,
    csvUpload: false,
    webhooks: false,
    enrichedNotifications: true,     // Pro = enriched notification + job alerts
    jobAlerts: true,
  }),
  unlimited: freezeTier({
    watchLimit: -1,
    channels: ["email", "whatsapp", "sms", "inApp"],
    alertTiming: "immediate",
    apiAccess: true,
    weeklyReports: true,
    csvUpload: false,
    webhooks: false,
    enrichedNotifications: true,
    jobAlerts: true,
  }),
  enterprise: freezeTier({
    watchLimit: -1,
    channels: ["email", "whatsapp", "sms", "inApp"],
    alertTiming: "immediate",
    apiAccess: true,
    weeklyReports: true,
    csvUpload: true,
    webhooks: true,
    enrichedNotifications: true,
    jobAlerts: true,
  }),
});

const STATUS_TO_TIER: Record<string, PlanTier> = {
  free: "free",
  starter: "starter",
  pro: "pro",
  unlimited: "unlimited",
  enterprise: "enterprise",
};

/** Human-readable label for a tier, for badges/UI (e.g. "Starter", "Pro"). */
export const TIER_LABELS: Readonly<Record<PlanTier, string>> = Object.freeze({
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  unlimited: "Unlimited",
  enterprise: "Enterprise",
});

/**
 * Standardized alert-timing copy, matching the real production schedule:
 * the register-diff cron runs at ~00:30 UTC on weekdays
 * (server/utils/sponsorMonitorJob.ts), and staged changes go out via the
 * consolidated digest job (server/services/consolidatedNotificationEngine.ts),
 * which runs twice daily at 07:00 and 19:00 UTC
 * (server/utils/scheduler.ts's CONSOLIDATED_NOTIFICATIONS cron) for
 * Pro/Unlimited/Enterprise subscribers; Starter subscribers get a same-day
 * digest at 18:00 UTC; Free has no automated alerts.
 *
 * There is a separate per-change "immediate" dispatch path
 * (server/utils/notificationDispatcher.ts's notifyAffectedUsers, honoring
 * TierConfig.alertTiming/getDeliverAfter below) but it is only invoked from
 * an admin manual-replay route today — the automated nightly pipeline never
 * calls it, so no tier actually gets sub-hour delivery from the live cron.
 * Do not describe any tier as "instant" or "within minutes" here until that
 * path is wired into the automated job; the copy below intentionally
 * describes the digest schedule, not the aspirational one.
 */
export const ALERT_TIMING_COPY: Readonly<Record<PlanTier, string>> = Object.freeze({
  free: "Not included on the free plan — check manually anytime",
  starter: "Same-day digest at 18:00 UTC",
  pro: "Twice-daily digest at 07:00 and 19:00 UTC",
  unlimited: "Twice-daily digest at 07:00 and 19:00 UTC",
  enterprise: "Twice-daily digest at 07:00 and 19:00 UTC",
});

/** Short badge/marketing form of the same timing facts, for compact UI. */
export const ALERT_TIMING_SHORT: Readonly<Record<PlanTier, string>> = Object.freeze({
  free: "No alerts",
  starter: "Same-day alerts (18:00 UTC)",
  pro: "Twice-daily alerts",
  unlimited: "Twice-daily alerts",
  enterprise: "Twice-daily alerts",
});

/**
 * `null`/`undefined` (logged out, or a user row with no status yet) is the
 * normal "free" case and isn't logged. Any other string that isn't a key of
 * STATUS_TO_TIER — e.g. the real, persisted 'past_due' status — is an actual
 * anomaly: it silently downgrades that user to free tier, so it's worth a
 * signal instead of disappearing into the same fallback unremarked.
 */
export function resolveTier(subscriptionStatus: string | null | undefined): PlanTier {
  if (subscriptionStatus == null) return "free";
  const tier = STATUS_TO_TIER[subscriptionStatus];
  if (tier === undefined) {
    console.warn(`[planTiers] Unrecognized subscriptionStatus "${subscriptionStatus}" — resolving to "free". Add it to STATUS_TO_TIER if this is a real status.`);
    return "free";
  }
  return tier;
}

export function getTierConfig(subscriptionStatus: string | null | undefined): TierConfig {
  return TIER_CONFIGS[resolveTier(subscriptionStatus)];
}

export function getWatchLimit(subscriptionStatus: string | null | undefined): number {
  return getTierConfig(subscriptionStatus).watchLimit;
}

export function isChannelAllowed(subscriptionStatus: string | null | undefined, channel: NotificationChannel): boolean {
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

/** True for any paid tier (starter and above). */
export function isPaidTier(subscriptionStatus: string | null | undefined): boolean {
  return resolveTier(subscriptionStatus) !== "free";
}

/**
 * True for a tier with no watch-count ceiling (currently unlimited/enterprise).
 * Derived from watchLimit rather than tier name, so a status check against
 * this stays correct even if a tier's watchLimit changes without its name
 * changing.
 */
export function isUnlimitedWatchTier(subscriptionStatus: string | null | undefined): boolean {
  return getWatchLimit(subscriptionStatus) === -1;
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
