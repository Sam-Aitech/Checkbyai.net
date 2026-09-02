import { useEffect } from "react";
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

  // Without this, a fetch failure (e.g. Redis outage on the server) renders
  // identically to a legitimate "no digest generated yet" response — both
  // leave `data` undefined, so !data?.available is true either way. Log so a
  // backend regression is at least visible somewhere instead of silently
  // looking like a quiet news day.
  useEffect(() => {
    if (query.isError) {
      console.error("[useDailyDigest] Failed to load /api/daily-digest/current:", query.error);
    }
  }, [query.isError, query.error]);

  const counts = {
    added: query.data?.counts?.added ?? 0,
    updated: query.data?.counts?.updated ?? 0,
    removed: query.data?.counts?.removed ?? 0,
  };

  return { ...query, counts };
}
