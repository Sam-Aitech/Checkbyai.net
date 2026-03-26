import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, MapPin, Shield, Star, Calendar, Clock,
  CheckCircle, XCircle, AlertTriangle, ArrowLeft,
  Bell, ChevronRight, ArrowUpCircle, ArrowDownCircle,
  RefreshCw, FileText, Tag, Lock, ExternalLink, Briefcase,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SponsorChange {
  changeType:    string;
  snapshotDate:  string;
  previousValue: string | null;
  newValue:      string | null;
  detectedAt:    string;
}

interface SponsorEnrichment {
  companyNumber:        string | null;
  companyStatus:        string | null;
  companyType:          string | null;
  incorporationDate:    string | null;
  natureOfBusiness:     string | null;
  lastFiledAccountsDate: string | null;
  companiesHouseSource: boolean | null;
}

interface SponsorDetailData {
  id:              number;
  fingerprint:     string;
  currentName:     string;
  townCity:        string | null;
  typeRating:      string | null;
  route:           string | null;
  status:          string;
  firstSeen:       string;
  lastSeen:        string;
  grantedAt:       string;
  removedAt:       string | null;
  historicalNames: string[];
  recentChanges:   SponsorChange[];
  totalChanges:    number;
  enrichment:      SponsorEnrichment | null;
}

// ── Change type display helpers ───────────────────────────────────────────────

const CHANGE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  NEW_LICENCE:      { label: "Licence Granted",    icon: <CheckCircle className="w-4 h-4" />,      color: "text-emerald-600 dark:text-emerald-400" },
  RE_ACTIVATED:     { label: "Licence Reinstated", icon: <RefreshCw className="w-4 h-4" />,         color: "text-blue-600 dark:text-blue-400" },
  REMOVED_REVOKED:  { label: "Licence Revoked",    icon: <XCircle className="w-4 h-4" />,           color: "text-red-600 dark:text-red-400" },
  UPGRADED:         { label: "Rating Upgraded",    icon: <ArrowUpCircle className="w-4 h-4" />,     color: "text-emerald-600 dark:text-emerald-400" },
  DOWNGRADED:       { label: "Rating Downgraded",  icon: <ArrowDownCircle className="w-4 h-4" />,   color: "text-amber-600 dark:text-amber-400" },
  ROUTE_CHANGE:     { label: "Route Updated",      icon: <Tag className="w-4 h-4" />,               color: "text-indigo-600 dark:text-indigo-400" },
  NAME_CHANGE:      { label: "Company Renamed",    icon: <FileText className="w-4 h-4" />,          color: "text-slate-600 dark:text-slate-400" },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ── Status config ─────────────────────────────────────────────────────────────

function getStatusConfig(status: string) {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", icon: <CheckCircle className="w-4 h-4" />, badge: "bg-emerald-600", banner: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200" };
    case "NEWLY_GRANTED":
      return { label: "Newly Granted", icon: <CheckCircle className="w-4 h-4" />, badge: "bg-blue-600", banner: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200" };
    case "GRACE_PERIOD":
      return { label: "Under Review", icon: <AlertTriangle className="w-4 h-4" />, badge: "bg-amber-500", banner: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200" };
    default:
      return { label: "Revoked", icon: <XCircle className="w-4 h-4" />, badge: "bg-red-600", banner: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200" };
  }
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-1/3" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SponsorDetail() {
  const params = useParams<{ id: string; slug?: string }>();
  const id = parseInt(params.id || "", 10);

  const { data, isLoading, isError } = useQuery<SponsorDetailData>({
    queryKey: ["/api/sponsors/detail", id],
    queryFn:  async () => {
      const res = await fetch(`/api/sponsors/detail/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? "not_found" : "error");
      return res.json();
    },
    enabled:   !isNaN(id) && id > 0,
    staleTime: 60 * 60 * 1000, // 1 hr — matches server cache
  });

  // ── Invalid ID ──────────────────────────────────────────────────────────────
  if (isNaN(id) || id <= 0) {
    return (
      <PageLayout>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground mb-4">Invalid sponsor link.</p>
          <Link href="/sponsors"><Button variant="outline">Browse All Sponsors</Button></Link>
        </div>
      </PageLayout>
    );
  }

  // ── Error / not found ───────────────────────────────────────────────────────
  if (isError) {
    return (
      <PageLayout>
        <SEOHead
          title="Sponsor Not Found | CheckByAI"
          description="This sponsor could not be found in the UK Home Office register."
          canonicalUrl={`https://checkbyai.net/sponsor/${id}`}
        />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Sponsor Not Found</h1>
          <p className="text-muted-foreground mb-6">This sponsor could not be found in the register. They may have been removed or the link may be outdated.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/sponsors"><Button variant="outline">Browse Register</Button></Link>
            <Link href="/"><Button>Search Again</Button></Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading || !data) {
    return (
      <PageLayout>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <DetailSkeleton />
        </div>
      </PageLayout>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const statusConfig = getStatusConfig(data.status);
  const isBRated = (data.typeRating || "").toLowerCase().includes("b");
  const grantedYear = data.grantedAt ? new Date(data.grantedAt).getFullYear() : null;
  const isRevoked = data.status === "REMOVED_REVOKED";

  const baseUrl = "https://checkbyai.net";
  const slug = data.currentName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
  const canonicalUrl = `${baseUrl}/sponsor/${data.id}/${slug}`;

  const seoTitle = `${data.currentName} — ${statusConfig.label} UK Sponsor Licence | CheckByAI`;
  const seoDesc = isRevoked
    ? `${data.currentName}${data.townCity ? ` in ${data.townCity}` : ""} had their UK sponsor licence revoked. See the full licence history on CheckByAI.`
    : `${data.currentName}${data.townCity ? ` in ${data.townCity}` : ""} holds a ${statusConfig.label} UK sponsor licence${data.route ? ` (${data.route})` : ""}${grantedYear ? `, active since ${grantedYear}` : ""}. Get instant alerts if their status changes.`;

  return (
    <PageLayout>
      <SEOHead title={seoTitle} description={seoDesc} canonicalUrl={canonicalUrl} />

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/sponsors" className="hover:text-foreground transition-colors">UK Sponsor Register</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground truncate max-w-xs">{data.currentName}</span>
        </nav>

        {/* Status banner */}
        <div className={`flex items-center gap-3 border rounded-xl px-5 py-4 ${statusConfig.banner}`}>
          {statusConfig.icon}
          <div className="flex-1">
            <p className="font-semibold text-sm">
              {isRevoked
                ? "This sponsor's licence has been revoked by the Home Office."
                : data.status === "GRACE_PERIOD"
                ? "This licence is currently under review — it may be removed from the register."
                : data.status === "NEWLY_GRANTED"
                ? "This sponsor's licence was newly granted and is now active."
                : "This sponsor holds an active UK sponsor licence."}
            </p>
          </div>
        </div>

        {/* Company card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground leading-tight">{data.currentName}</h1>
                {data.historicalNames && data.historicalNames.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    formerly: {data.historicalNames.slice(-2).join(", ")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`${statusConfig.badge} text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1`}>
                {statusConfig.icon}
                {statusConfig.label}
              </Badge>
              {isBRated && (
                <Badge className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">B-Rated</Badge>
              )}
              <Link href={`/sponsor-monitor?company=${encodeURIComponent(data.currentName)}`}>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full px-3 h-7 text-xs gap-1">
                  <Bell className="w-3 h-3" />Set Alert
                </Button>
              </Link>
            </div>
          </div>

          {/* Key facts grid */}
          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            {data.townCity && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-foreground">{data.townCity}</span>
              </div>
            )}
            {data.route && (
              <div className="flex items-center gap-2 text-sm">
                <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-foreground">{data.route}</span>
              </div>
            )}
            {data.typeRating && (
              <div className="flex items-center gap-2 text-sm">
                <Star className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-foreground">{data.typeRating}</span>
              </div>
            )}
            {data.grantedAt && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-foreground">Licensed since {formatDate(data.grantedAt)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                {isRevoked
                  ? `Revoked ${data.removedAt ? formatDate(data.removedAt) : "recently"}`
                  : `Last confirmed ${formatDate(data.lastSeen)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Change history */}
        {data.recentChanges.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Licence Change History</h2>
              {data.totalChanges > 0 && (
                <span className="text-xs text-muted-foreground">{data.totalChanges} event{data.totalChanges !== 1 ? "s" : ""} on record</span>
              )}
            </div>
            <div className="space-y-0">
              {data.recentChanges.map((c, i) => {
                const meta = CHANGE_META[c.changeType] || {
                  label: c.changeType.replace(/_/g, " "),
                  icon: <RefreshCw className="w-4 h-4" />,
                  color: "text-muted-foreground",
                };
                return (
                  <div key={i} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                    <span className={`mt-0.5 shrink-0 ${meta.color}`}>{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${meta.color}`}>{meta.label}</p>
                      {(c.previousValue || c.newValue) && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {c.previousValue && c.newValue
                            ? `${c.previousValue} → ${c.newValue}`
                            : c.newValue || c.previousValue}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                      {formatDate(c.snapshotDate || c.detectedAt)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Lock indicator — shown when there are more changes than the 3-event free preview */}
            {data.totalChanges > 3 && (
              <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 flex items-center gap-3">
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {data.totalChanges - 3} more event{data.totalChanges - 3 !== 1 ? "s" : ""} in full history
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">90-day history, upgrades, downgrades, route changes — subscribe to unlock.</p>
                </div>
                <Link href="/pricing">
                  <Button size="sm" variant="outline" className="shrink-0 text-xs rounded-full">
                    Unlock <ChevronRight className="w-3 h-3 ml-0.5" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Companies House enrichment card */}
        {data.enrichment && (
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Companies House</h2>
              {data.enrichment.companiesHouseSource && (
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">Verified</Badge>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {data.enrichment.companyNumber && (
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Company No.</span>
                  <a
                    href={`https://find-and-update.company-information.service.gov.uk/company/${data.enrichment.companyNumber}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-0.5"
                  >
                    {data.enrichment.companyNumber} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {data.enrichment.companyStatus && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Status</span>
                  <span className="text-foreground capitalize">{data.enrichment.companyStatus.replace(/-/g, " ")}</span>
                </div>
              )}
              {data.enrichment.companyType && (
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Type</span>
                  <span className="text-foreground capitalize">{data.enrichment.companyType.replace(/-/g, " ")}</span>
                </div>
              )}
              {data.enrichment.incorporationDate && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Incorporated</span>
                  <span className="text-foreground">{formatDate(data.enrichment.incorporationDate)}</span>
                </div>
              )}
              {data.enrichment.lastFiledAccountsDate && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Last Accounts</span>
                  <span className="text-foreground">{formatDate(data.enrichment.lastFiledAccountsDate)}</span>
                </div>
              )}
              {data.enrichment.natureOfBusiness && (
                <div className="flex items-start gap-2 text-sm sm:col-span-2">
                  <Tag className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground shrink-0">Business</span>
                  <span className="text-foreground">{data.enrichment.natureOfBusiness}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="bg-slate-900 dark:bg-slate-800 rounded-xl p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">
                {isRevoked
                  ? "Track reinstatements and new sponsors"
                  : `Get instant alerts if ${data.currentName} changes`}
              </h3>
              <p className="text-sm text-white/70 mb-4">
                {isRevoked
                  ? "Monitor the register daily. Get notified the moment any sponsor is reinstated or a new licence is granted."
                  : "The Home Office updates the register at midnight without warning. Our Notification Engine checks every night and alerts you within 30 minutes via WhatsApp, email, or SMS."}
              </p>
              <div className="flex gap-3 flex-wrap">
                <Link href="/pricing">
                  <Button className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-full px-6">
                    Set Up Alerts — from £24.99/mo
                  </Button>
                </Link>
                <Link href="/sponsors">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 rounded-full bg-transparent">
                    <ArrowLeft className="w-4 h-4 mr-1.5" />Browse Register
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Source attribution */}
        <p className="text-xs text-muted-foreground text-center pb-4">
          Data sourced from the{" "}
          <a
            href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            UK Home Office Register of Licensed Sponsors
          </a>
          . Updated daily.
        </p>

      </div>
    </PageLayout>
  );
}
