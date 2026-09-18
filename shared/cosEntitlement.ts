export type CosAccessSource =
  | "restricted"
  | "admin"
  | "cos_subscription"
  | "admin_limit"
  | "admin_approval"
  | "plan"
  | "credits"
  | "none";

export type CosConsumptionSource = "unlimited" | "credits" | "custom_limit" | "daily" | "none";

export interface CosEntitlementUser {
  role?: string | null;
  subscriptionStatus?: string | null;
  credits?: number | null;
  dailyVerificationsUsed?: number | null;
  lastVerificationDate?: string | null;
  verificationLimit?: number | null;
  totalVerificationsUsed?: number | null;
  isRestricted?: boolean | null;
  cosCheckApproved?: boolean | null;
  cosCheckSubscription?: boolean | null;
}

export interface CosEntitlement {
  subscriptionStatus: string;
  credits: number;
  hasAccess: boolean;
  canVerify: boolean;
  isUnlimited: boolean;
  remaining: number | null;
  accessSource: CosAccessSource;
  consumptionSource: CosConsumptionSource;
}

function safeCount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
}

export function hasPaidCosAccess(user: CosEntitlementUser): boolean {
  if (user.isRestricted === true) return false;

  return (
    user.cosCheckSubscription === true ||
    safeCount(user.credits) > 0 ||
    user.subscriptionStatus === "unlimited" ||
    user.subscriptionStatus === "enterprise"
  );
}

export function normalizeDailyVerificationLimit(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return parsed === -1 || (Number.isInteger(parsed) && parsed > 0) ? parsed : 1;
}

export function resolveCosEntitlement(
  user: CosEntitlementUser,
  defaultDailyLimit: string | number | null | undefined = 1,
  today = new Date().toISOString().split("T")[0],
): CosEntitlement {
  const subscriptionStatus = user.subscriptionStatus || "free";
  const credits = safeCount(user.credits);

  if (user.isRestricted === true) {
    return {
      subscriptionStatus,
      credits,
      hasAccess: false,
      canVerify: false,
      isUnlimited: false,
      remaining: 0,
      accessSource: "restricted",
      consumptionSource: "none",
    };
  }

  const isAdmin = user.role === "admin";
  const hasCosSubscription = user.cosCheckSubscription === true;
  const hasUnlimitedPlan = subscriptionStatus === "unlimited" || subscriptionStatus === "enterprise";
  const hasUnlimitedOverride = user.verificationLimit === -1;
  const hasCustomLimit = typeof user.verificationLimit === "number" && user.verificationLimit > 0;

  const accessSource: CosAccessSource = isAdmin
    ? "admin"
    : hasCosSubscription
      ? "cos_subscription"
      : hasUnlimitedOverride || hasCustomLimit
        ? "admin_limit"
        : hasUnlimitedPlan
          ? "plan"
          : credits > 0
            ? "credits"
            : "none";

  const hasAccess = accessSource !== "none";
  if (!hasAccess) {
    return {
      subscriptionStatus,
      credits,
      hasAccess: false,
      canVerify: false,
      isUnlimited: false,
      remaining: 0,
      accessSource,
      consumptionSource: "none",
    };
  }

  const dailyLimit = normalizeDailyVerificationLimit(defaultDailyLimit);
  const isUnlimited =
    isAdmin ||
    hasCosSubscription ||
    hasUnlimitedPlan ||
    hasUnlimitedOverride ||
    (!hasCustomLimit && dailyLimit === -1);

  if (isUnlimited) {
    return {
      subscriptionStatus,
      credits,
      hasAccess: true,
      canVerify: true,
      isUnlimited: true,
      remaining: null,
      accessSource,
      consumptionSource: "unlimited",
    };
  }

  const allowanceRemaining = hasCustomLimit
    ? Math.max(0, Math.floor(user.verificationLimit as number) - safeCount(user.totalVerificationsUsed))
    : Math.max(
        0,
        dailyLimit -
          (user.lastVerificationDate === today ? safeCount(user.dailyVerificationsUsed) : 0),
      );
  const remaining = credits + allowanceRemaining;

  return {
    subscriptionStatus,
    credits,
    hasAccess: true,
    canVerify: remaining > 0,
    isUnlimited: false,
    remaining,
    accessSource,
    consumptionSource:
      credits > 0
        ? "credits"
        : allowanceRemaining > 0
          ? hasCustomLimit
            ? "custom_limit"
            : "daily"
          : "none",
  };
}