/**
 * useAccountSummary — composes existing endpoints only (no new backend calls).
 * Derives protection status, first-run flag, past-due state, CoS entitlement,
 * and watch usage for the pro-dashboard pages.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { STALE_TIMES } from "@/lib/queryDefaults";
import { getWatchLimit, hasJobAlerts, type PlanTier } from "@shared/planTiers";

export interface WatchEntry {
  id: number;
  organisationName: string;
  townCity: string | null;
  fingerprint: string | null;
  isActive: boolean;
  createdAt: string;
  currentStatus: { listed: boolean; typeRating: string | null; route: string | null; status?: string };
  recentChanges: SponsorChange[];
}

export interface SponsorChange {
  id: number;
  organisationName: string;
  changeType: string;
  previousValue: string | null;
  newValue: string | null;
  detectedAt: string;
  snapshotDate: string;
}

interface CreditsResponse {
  credits: number;
  subscriptionStatus: string;
  isUnlimited: boolean;
}

export type ProtectionStatus = "empty" | "clear" | "attention" | "critical";

const REVOKED_STATUSES = new Set(["REMOVED_REVOKED", "NOT_LISTED"]);

export function useAccountSummary() {
  const { user, isLoading: authLoading, isAuthenticated, tier, isPastDue } = useAuth();

  const watchesQuery = useQuery<WatchEntry[]>({
    queryKey: ["/api/watches"],
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.FREQUENT,
    retry: false,
  });

  const changesQuery = useQuery<{ changes: SponsorChange[]; totalCount: number }>({
    queryKey: ["/api/sponsor-changes"],
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.INFREQUENT,
    retry: false,
  });

  const creditsQuery = useQuery<CreditsResponse>({
    queryKey: ["/api/credits"],
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.NORMAL,
    retry: false,
  });

  const watches = watchesQuery.data ?? [];
  const watchedNames = new Set(watches.map((w) => (w.organisationName ?? "").toLowerCase()));
  const myChanges = (changesQuery.data?.changes ?? []).filter(
    (c) => c.organisationName && watchedNames.has(c.organisationName.toLowerCase()),
  );

  const hasCurrentlyRevoked = watches.some((w) => REVOKED_STATUSES.has(w.currentStatus?.status || ""));
  const hasUnresolvedChange = myChanges.length > 0;

  let protectionStatus: ProtectionStatus;
  if (watches.length === 0) {
    protectionStatus = "empty";
  } else if (hasCurrentlyRevoked) {
    protectionStatus = "critical";
  } else if (hasUnresolvedChange || isPastDue) {
    protectionStatus = "attention";
  } else {
    protectionStatus = "clear";
  }

  const isFirstRun = watches.length === 0;
  const watchLimit = getWatchLimit(user?.subscriptionStatus);
  const watchCount = watches.length;
  const atCapacity = watchLimit !== -1 && watchCount >= watchLimit;

  // Same signal, and same INVARIANT, as the server-side COS gate in
  // server/routes/verification.ts — must never be used for Alert-Pass
  // tier/feature gating, only to mirror the server's COS-access truth here.
  const hasCosAccess =
    user?.role === "admin" ||
    user?.cosCheckSubscription === true ||
    user?.cosCheckApproved === true ||
    (user?.credits ?? 0) > 0;

  const jobAlertsEligible = hasJobAlerts(user?.subscriptionStatus);

  const isLoading = authLoading || (isAuthenticated && (watchesQuery.isLoading || changesQuery.isLoading));
  const isError = !authLoading && isAuthenticated && (watchesQuery.isError || changesQuery.isError);

  return {
    user,
    tier: tier as PlanTier,
    isAuthenticated,
    isPastDue,
    isLoading,
    isError,
    watches,
    myChanges,
    protectionStatus,
    isFirstRun,
    watchCount,
    watchLimit,
    atCapacity,
    hasCosAccess,
    jobAlertsEligible,
    credits: creditsQuery.data?.credits ?? user?.credits ?? 0,
    refetchWatches: watchesQuery.refetch,
    refetchChanges: changesQuery.refetch,
  };
}
