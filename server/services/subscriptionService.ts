import { storage } from "../storage";
import { ApiError } from "../lib/apiError";
import { getWatchLimit as getWatchLimitFromTier, getTierConfig, isPaidTier, isUnlimitedWatchTier } from "../utils/tierConfig";

export class SubscriptionService {
  getWatchLimit(subscriptionStatus: string | null): number {
    return getWatchLimitFromTier(subscriptionStatus);
  }

  getTierConfig(subscriptionStatus: string | null) {
    return getTierConfig(subscriptionStatus);
  }

  hasUnlimitedAccess(user: { role?: string | null; cosCheckSubscription?: boolean | null; subscriptionStatus?: string | null; verificationLimit?: number | null }): boolean {
    if (user.role === "admin") return true;
    if (user.cosCheckSubscription) return true;
    if (isUnlimitedWatchTier(user.subscriptionStatus)) return true;
    if (user.verificationLimit === -1) return true;
    return false;
  }

  hasPaidPlan(subscriptionStatus: string | null | undefined): boolean {
    return isPaidTier(subscriptionStatus);
  }

  async requireActiveSubscription(userId: string): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) throw new ApiError(404, "User not found");

    const paid = this.hasPaidPlan(user.subscriptionStatus);
    const unlimited = this.hasUnlimitedAccess(user);

    if (!paid && !unlimited) {
      throw new ApiError(403, "Active subscription required");
    }
  }
}

export const subscriptionService = new SubscriptionService();
