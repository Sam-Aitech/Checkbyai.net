import { CheckCircle, XCircle, Zap, Clock, RefreshCw, AlertTriangle, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Shared by SponsorDirectory and SponsorMonitor, which previously each hand-rolled
// an identical badge function with solid saturated fills + white text — several of
// those combinations fail WCAG contrast (see CLAUDE.md P1). Restyled here to the
// light-tint-background + darker-saturated-text + colored-border pattern already
// used correctly elsewhere in the app (e.g. VerificationHistory.tsx result badges),
// at a real Tailwind scale step (text-xs) instead of the arbitrary text-[10px]/[11px]
// values both originals used.
const badgeBase = "rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap border";

function isBRated(typeRating: string | null | undefined): boolean {
  const rating = (typeRating || "").toLowerCase();
  return rating.includes("b rating") || rating.includes("b-rating") || rating === "b";
}

export default function SponsorStatusBadge({ status, typeRating }: { status: string; typeRating?: string | null }) {
  // NOT_LISTED is a retired legacy status meaning the company is no longer on the
  // register — treat as REMOVED so it never silently renders as Active.
  if (status === "REMOVED_REVOKED" || status === "NOT_LISTED") {
    return (
      <Badge className={`${badgeBase} bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30`}>
        <XCircle className="w-3 h-3 mr-1" />
        Removed
      </Badge>
    );
  }

  if (status === "NEWLY_GRANTED") {
    return (
      <Badge className={`${badgeBase} bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30`}>
        <Zap className="w-3 h-3 mr-1" />
        Newly Granted
      </Badge>
    );
  }

  if (status === "REINSTATED") {
    return (
      <Badge className={`${badgeBase} bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30`}>
        <RefreshCw className="w-3 h-3 mr-1" />
        Reinstated
      </Badge>
    );
  }

  if (status === "GRACE_PERIOD") {
    return (
      <Badge className={`${badgeBase} bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30`}>
        <Clock className="w-3 h-3 mr-1" />
        Under Review
      </Badge>
    );
  }

  if (status === "ACTIVE") {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={`${badgeBase} bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30`}>
          <CheckCircle className="w-3 h-3 mr-1" />
          Active
        </Badge>
        {isBRated(typeRating) && (
          <Badge className={`${badgeBase} bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30`}>
            <AlertTriangle className="w-3 h-3 mr-1" />
            B-Rated
          </Badge>
        )}
      </div>
    );
  }

  // Unknown / future status — neutral badge, never silently rendered as Active.
  return (
    <Badge className={`${badgeBase} bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30`}>
      <HelpCircle className="w-3 h-3 mr-1" />
      Unknown
    </Badge>
  );
}
