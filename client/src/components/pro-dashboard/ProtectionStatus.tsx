import { ShieldCheck, AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProtectionStatus } from "@/hooks/useAccountSummary";

interface Props {
  status: ProtectionStatus;
  monitored: number;
  unresolved: number;
  revokedCount: number;
  lastCheckedAt?: string;
  firstUnresolvedName?: string;
  onViewMonitoring: () => void;
  onVerify: () => void;
  onReviewChange?: () => void;
}

export default function ProtectionStatus({
  status,
  monitored,
  unresolved,
  revokedCount,
  lastCheckedAt,
  firstUnresolvedName,
  onViewMonitoring,
  onVerify,
  onReviewChange,
}: Props) {
  const detectedLabel = lastCheckedAt
    ? `Last change detected ${new Date(lastCheckedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · checks run daily`
    : "Checks run daily";

  if (status === "empty") {
    return (
      <section aria-live="polite" className="rounded-2xl border border-border bg-card p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Protection status</p>
        <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          Not protected yet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No sponsors monitored · {detectedLabel}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="min-h-[44px] rounded-full" onClick={onViewMonitoring}>
            Protect your first sponsor <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </section>
    );
  }

  if (status === "critical") {
    return (
      <section aria-live="polite" className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-red-500">Protection status</p>
        <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold">
          <XCircle className="h-6 w-6 text-red-500" aria-hidden="true" />
          Attention required
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {revokedCount} sponsor{revokedCount === 1 ? " has" : "s have"} been revoked · {monitored} monitored · {detectedLabel}
        </p>
        {firstUnresolvedName && (
          <p className="mt-1 text-sm font-semibold">{firstUnresolvedName}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="min-h-[44px] rounded-full" onClick={onReviewChange ?? onViewMonitoring}>
            Review change <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" className="min-h-[44px] rounded-full" onClick={onVerify}>
            Verify a CoS
          </Button>
        </div>
      </section>
    );
  }

  if (status === "attention") {
    return (
      <section aria-live="polite" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Protection status</p>
        <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold">
          <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden="true" />
          {unresolved} change{unresolved === 1 ? "" : "s"} to review
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {monitored} monitored · {detectedLabel}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="min-h-[44px] rounded-full" onClick={onReviewChange ?? onViewMonitoring}>
            Review change <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" className="min-h-[44px] rounded-full" onClick={onVerify}>
            Verify a CoS
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-live="polite" className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Protection status</p>
      <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold">
        <ShieldCheck className="h-6 w-6 text-emerald-500" aria-hidden="true" />
        You&apos;re protected
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {monitored} {monitored === 1 ? "company" : "companies"} monitored · 0 changes need attention · {detectedLabel}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-[44px] rounded-full" onClick={onViewMonitoring}>
          View monitoring
        </Button>
        <Button variant="outline" className="min-h-[44px] rounded-full" onClick={onVerify}>
          Verify a CoS
        </Button>
      </div>
    </section>
  );
}
