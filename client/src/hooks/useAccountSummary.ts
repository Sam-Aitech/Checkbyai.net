import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { resolveTier, TIER_CONFIGS, TIER_LABELS, getWatchLimit } from "@shared/planTiers";

export type ProtectionStatus = "empty" | "clear" | "attention" | "critical";

interface WatchEntry {
  id: number;
  organisationName: string;
  currentStatus?: { status?: string } | null;
}

interface SponsorChange {
  id: number;
  organisationName: string;
  detectedAt: string;
}

export function useAccountSummary() {
  const { user, isLoading: authLoading, isAuthenticated, isPro, tier } = useAuth();
  const status = user?.subscriptionStatus ?? "free";

  const watchesQ = useQuery<WatchEntry[]>({
    queryKey: ["/api/watches"],
    enabled: isAuthenticated,
    retry: false,
  });
  const changesQ = useQuery<{ changes: SponsorChange[] }>({
    queryKey: ["/api/sponsor-changes"],
    enabled: isAuthenticated,
    retry: false,
  });
  const creditsQ = useQuery<{ credits: number; isUnlimited: boolean }>({
    queryKey: ["/api/credits"],
    enabled: isAuthenticated,
    retry: false,
  });

  const watches = watchesQ.data ?? [];
  const watchedNames = new Set(watches.map((w) => (w.organisationName ?? "").toLowerCase()));
  const myChanges = (changesQ.data?.changes ?? []).filter(
    (c) => c.organisationName && watchedNames.has(c.organisationName.toLowerCase()),
  );
  const unresolved = myChanges.filter(
    (c) => Date.now() - new Date(c.detectedAt).getTime() < 7 * 86_400_000,
  );
  const revokedN = watches.filter(
    (w) => w.currentStatus?.status === "REMOVED_REVOKED" || w.currentStatus?.status === "NOT_LISTED",
  ).length;

  const protection: ProtectionStatus =
    watches.length === 0 ? "empty" : revokedN > 0 ? "critical" : unresolved.length > 0 ? "attention" : "clear";
  const lastCheckedAt = myChanges.length > 0 ? myChanges.map((c) => +new Date(c.detectedAt)).sort((a, b) => b - a)[0] : undefined;

  const resolvedTier = resolveTier(status);
  const limit = getWatchLimit(status);

  return {
    isLoading: authLoading || watchesQ.isLoading || changesQ.isLoading,
    isAuthenticated,
    isPro,
    user: user ? { id: user.id, firstName: user.firstName, email: user.email } : null,
    plan: {
      id: resolvedTier,
      label: TIER_LABELS[resolvedTier],
      status: status === "past_due" ? ("past_due" as const) : ("active" as const),
      config: TIER_CONFIGS[resolvedTier],
    },
    usage: {
      sponsors: { used: watches.length, limit: limit === -1 ? null : limit },
      checks: {
        remaining: user?.verificationLimit === -1 ? null : (user?.verificationLimit ?? null),
        credits: creditsQ.data?.credits ?? user?.credits ?? 0,
        isUnlimited: creditsQ.data?.isUnlimited ?? false,
      },
    },
    protection: {
      status: protection,
      monitoredSponsors: watches.length,
      unresolvedAlerts: unresolved.length,
      revokedCount: revokedN,
      lastCheckedAt: lastCheckedAt ? new Date(lastCheckedAt).toISOString() : undefined,
      firstUnresolved: unresolved[0] ?? null,
    },
    watches,
    tier,
  };
}
