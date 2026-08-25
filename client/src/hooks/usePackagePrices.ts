import { useQuery } from '@tanstack/react-query';
import { unwrapApiEnvelope } from '@/lib/apiEnvelope';

interface StripePrice {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string } | null;
}

interface StripePackage {
  id: string;
  name: string;
  description: string | null;
  metadata: { packageType?: string };
  prices: StripePrice[];
}

// Looks up live Stripe price IDs by our internal packageType string, via
// GET /api/packages (which reads Stripe products/prices directly — Stripe is
// the source of truth for amounts). Returns undefined for a packageType until
// its Stripe product/price has actually been created (see Phase 0 of the
// pricing restructure — a manual Stripe-dashboard step, not something this
// client can fabricate).
export function usePackagePrices() {
  const { data, isLoading } = useQuery<{ packages: StripePackage[] }>({
    queryKey: ['/api/packages'],
    queryFn: async () => {
      const res = await fetch('/api/packages');
      const envelope = await res.json();
      return unwrapApiEnvelope<{ packages: StripePackage[] }>(envelope);
    },
    staleTime: 5 * 60 * 1000,
  });

  const getPriceId = (packageType: string): string | undefined => {
    const pkg = data?.packages.find((p) => p.metadata?.packageType === packageType);
    return pkg?.prices[0]?.id;
  };

  return { getPriceId, isLoading };
}
