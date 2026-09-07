import { Badge } from "@/components/ui/badge";
import {
  getSponsorStatusPresentation,
  isSponsorBRated,
  SPONSOR_B_RATED_PRESENTATION,
  sponsorToneBadgeClasses,
} from "@/lib/sponsorStatus";

// Canonical sponsor status pill — derives color/label/icon from the shared
// mapping in lib/sponsorStatus.ts so every surface (this badge, SponsorDetail,
// SponsorDashboard, admin search) renders the same state identically.
const badgeBase = "rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap border";

export default function SponsorStatusBadge({ status, typeRating }: { status: string; typeRating?: string | null }) {
  const presentation = getSponsorStatusPresentation(status);
  const Icon = presentation.icon;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge className={`${badgeBase} ${sponsorToneBadgeClasses[presentation.tone]}`}>
        <Icon className="w-3 h-3 mr-1" />
        {presentation.label}
      </Badge>
      {status === "ACTIVE" && isSponsorBRated(typeRating) && (
        <Badge className={`${badgeBase} ${sponsorToneBadgeClasses[SPONSOR_B_RATED_PRESENTATION.tone]}`}>
          <SPONSOR_B_RATED_PRESENTATION.icon className="w-3 h-3 mr-1" />
          {SPONSOR_B_RATED_PRESENTATION.label}
        </Badge>
      )}
    </div>
  );
}
