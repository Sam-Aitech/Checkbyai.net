import { CheckCircle, XCircle, Zap, Clock, RefreshCw, AlertTriangle, HelpCircle, type LucideIcon } from "lucide-react";

// Canonical semantic mapping for the sponsor licence status enum. Every
// surface that renders a sponsor status (badges, banners, list rows) should
// derive its color/label/icon from here so the same state always reads the
// same way — layouts differ per surface, this mapping does not.
export type SponsorStatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface SponsorStatusPresentation {
  label: string;
  icon: LucideIcon;
  tone: SponsorStatusTone;
}

export function getSponsorStatusPresentation(status: string | null | undefined): SponsorStatusPresentation {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", icon: CheckCircle, tone: "success" };
    case "NEWLY_GRANTED":
      return { label: "Newly Granted", icon: Zap, tone: "info" };
    case "REINSTATED":
      return { label: "Reinstated", icon: RefreshCw, tone: "success" };
    case "GRACE_PERIOD":
      return { label: "Under Review", icon: Clock, tone: "warning" };
    // NOT_LISTED is a retired legacy status meaning the company is no longer
    // on the register — treated as REMOVED so it never silently renders as
    // Active or falls through to "Unknown".
    case "REMOVED_REVOKED":
    case "NOT_LISTED":
      return { label: "Removed", icon: XCircle, tone: "danger" };
    default:
      return { label: "Unknown", icon: HelpCircle, tone: "neutral" };
  }
}

export const SPONSOR_B_RATED_PRESENTATION: SponsorStatusPresentation = {
  label: "B-Rated",
  icon: AlertTriangle,
  tone: "warning",
};

export function isSponsorBRated(typeRating: string | null | undefined): boolean {
  const rating = (typeRating || "").toLowerCase();
  return rating.includes("b rating") || rating.includes("b-rating") || rating === "b";
}

// Tinted-surface + darker-saturated-text + colored-border — the WCAG-safe
// pattern, shared by every sponsor status surface instead of each hand-rolling
// its own solid-fill-plus-white-text variant.
export const sponsorToneBadgeClasses: Record<SponsorStatusTone, string> = {
  success: "bg-success/10 text-success border-success/20 dark:bg-success/15",
  warning: "bg-warning/10 text-warning border-warning/20 dark:bg-warning/15",
  danger: "bg-destructive/10 text-destructive border-destructive/20 dark:bg-destructive/15",
  info: "bg-info/10 text-info border-info/20 dark:bg-info/15",
  neutral: "bg-muted text-muted-foreground border-border",
};

// Same tone-to-color mapping, formatted for a banner/panel surface (solid
// tinted background rather than a small badge fill).
export const sponsorToneBannerClasses: Record<SponsorStatusTone, string> = {
  success: "bg-success/10 border-success/20 text-success",
  warning: "bg-warning/10 border-warning/20 text-warning",
  danger: "bg-destructive/10 border-destructive/20 text-destructive",
  info: "bg-info/10 border-info/20 text-info",
  neutral: "bg-muted border-border text-muted-foreground",
};
