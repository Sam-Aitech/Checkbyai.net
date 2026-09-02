import { useQuery } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/queryDefaults";

// Single source of truth for the /api/daily-digest/current response shape.
// StickyAlertBanner, LandingDigest, and ProofBar all read this hook so the
// three widgets can never drift apart on field names or fallback values.
export interface DigestSummary {
  available: boolean;
  type: "overview" | "daily";
  date: string;
  headline?: string;
  emotion?: string;
  focus?: string;
  counts: {
    added: number;
    updated: number;
    removed: number;
  };
  activeSponsors: number;
  signature?: string;
}

export function useDailyDigest() {
  const query = useQuery<DigestSummary>({
    queryKey: ["/api/daily-digest/current"],
    staleTime: STALE_TIMES.NORMAL,
    refetchInterval: STALE_TIMES.INFREQUENT,
    refetchOnWindowFocus: true,
  });

  const counts = {
    added: query.data?.counts?.added ?? 0,
    updated: query.data?.counts?.updated ?? 0,
    removed: query.data?.counts?.removed ?? 0,
  };

  return { ...query, counts };
}
