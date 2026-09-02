// Re-exports the canonical tier configuration from shared/planTiers.ts so
// client and server can never drift on entitlements or alert-timing copy.
export {
  type PlanTier,
  type TierConfig,
  TIER_CONFIGS,
  TIER_LABELS,
  ALERT_TIMING_COPY,
  ALERT_TIMING_SHORT,
  resolveTier,
  getTierConfig,
  getWatchLimit,
  isChannelAllowed,
  hasEnrichedNotifications,
  hasJobAlerts,
  canReceiveNotifications,
  isPaidTier,
  getDeliverAfter,
} from "@shared/planTiers";
