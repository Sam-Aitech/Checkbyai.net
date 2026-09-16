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
  const bRated = status === "ACTIVE" && isSponsorBRated(typeRating);

  if (bRated) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge role="status" aria-label="Active licence, B rating, higher risk. B-rating means a Home Office action plan; revocation risk elevated." className={`${badgeBase} ${sponsorToneBadgeClasses["warning"]}`}>
          <Icon className="w-3 h-3 mr-1" aria-hidden="true" />
          Active — B-Rated (at risk)
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge role="status" aria-label={`${presentation.label}`} className={`${badgeBase} ${sponsorToneBadgeClasses[presentation.tone]}`}>
        <Icon className="w-3 h-3 mr-1" aria-hidden="true" />
        {presentation.label}
      </Badge>
    </div>
  );
}
