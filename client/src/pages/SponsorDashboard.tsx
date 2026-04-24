import { useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Building2, CheckCircle2, XCircle, Clock, Mail, Loader2,
  ArrowRight, Shield, AlertTriangle, Tag, MapPin, Activity, Zap,
  ChevronRight, RotateCcw, ArrowUp, ArrowDown, RefreshCw, Pencil,
  MessageSquare, Smartphone,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SponsorChange {
  id: number;
  organisationName: string;
  changeType: string;
  previousValue: string | null;
  newValue: string | null;
  detectedAt: string;
  snapshotDate: string;
}

interface WatchEntry {
  id: number;
  organisationName: string;
  townCity: string | null;
  fingerprint: string | null;
  isActive: boolean;
  createdAt: string;
  currentStatus: {
    listed: boolean;
    typeRating: string | null;
    route: string | null;
    status?: string;
  };
  recentChanges: SponsorChange[];
}

type NotifEventType =
  | "licence_revoked"
  | "rating_downgraded"
  | "licence_reinstated"
  | "rating_upgraded"
  | "route_added"
  | "route_removed"
  | "weekly_digest";

interface NotifEventPref {
  enabled: boolean;
  channels: { email: boolean; inApp: boolean; sms: boolean };
}

type NotifPrefs = { [K in NotifEventType]: NotifEventPref };

type NotifPrefPatch = Partial<
  Record<NotifEventType, { enabled?: boolean; channels?: { email?: boolean; inApp?: boolean; sms?: boolean } }>
>;

// ─── Event metadata ───────────────────────────────────────────────────────────

const EVENT_ROWS: Array<{ key: NotifEventType; label: string; subtitle: string }> = [
  { key: "licence_revoked",    label: "Licence Revoked",    subtitle: "Removed from register" },
  { key: "rating_downgraded",  label: "Rating Downgraded",  subtitle: "Rating decreased" },
  { key: "licence_reinstated", label: "Licence Reinstated", subtitle: "Restored to register" },
  { key: "rating_upgraded",    label: "Rating Upgraded",    subtitle: "Rating increased" },
  { key: "route_added",        label: "Route Added",        subtitle: "New immigration route" },
  { key: "route_removed",      label: "Route Removed",      subtitle: "Immigration route lost" },
  { key: "weekly_digest",      label: "Weekly Digest",      subtitle: "Weekly summary email" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRevokedStatus(status: string | undefined): boolean {
  return status === "REMOVED_REVOKED";
}

function StatusBadge({ status }: { status: string | undefined }) {
  if (status === "ACTIVE")
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs">
        Active
      </Badge>
    );
  if (status === "REMOVED_REVOKED")
    return (
      <Badge className="bg-red-500/10 text-red-600 border border-red-500/20 text-xs">
        Revoked
      </Badge>
    );
  if (status === "GRACE_PERIOD")
    return (
      <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-xs">
        Grace Period
      </Badge>
    );
  if (status === "NEWLY_GRANTED")
    return (
      <Badge className="bg-blue-500/10 text-blue-600 border border-blue-500/20 text-xs">
        Newly Granted
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-xs">
      Unknown
    </Badge>
  );
}

const CHANGE_META: Record<string, { label: string; Icon: React.FC<{ className?: string }>; color: string }> = {
  NEW_LICENCE:     { label: "Licence Granted",  Icon: CheckCircle2, color: "text-emerald-500" },
  RE_ACTIVATED:    { label: "Reactivated",       Icon: RotateCcw,   color: "text-blue-500"    },
  REMOVED_REVOKED: { label: "Licence Revoked",   Icon: XCircle,     color: "text-red-500"     },
  UPGRADED:        { label: "Rating Upgraded",   Icon: ArrowUp,     color: "text-emerald-500" },
  DOWNGRADED:      { label: "Rating Downgraded", Icon: ArrowDown,   color: "text-amber-500"   },
  ROUTE_CHANGE:    { label: "Route Changed",     Icon: RefreshCw,   color: "text-violet-500"  },
  NAME_CHANGE:     { label: "Name Changed",      Icon: Pencil,      color: "text-sky-500"     },
};

function changeMeta(type: string) {
  return CHANGE_META[type] ?? { label: type, Icon: Activity, color: "text-muted-foreground" };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompanyHeaderCard({
  companyName,
  watch,
  isLoading,
}: {
  companyName: string;
  watch: WatchEntry | undefined;
  isLoading: boolean;
}) {
  const status = watch?.currentStatus?.status;

  return (
    <Card className="border border-border rounded-xl overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 rounded-xl p-2.5 shrink-0 mt-0.5">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <>
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-1">Monitoring</p>
                <h2 className="editorial-subheading text-foreground text-lg leading-snug break-words">
                  {companyName || watch?.organisationName || "Your Company"}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <StatusBadge status={status} />
                  {watch?.currentStatus?.typeRating && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {watch.currentStatus.typeRating}
                    </span>
                  )}
                  {watch?.townCity && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {watch.townCity}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          {watch?.isActive && (
            <div className="shrink-0">
              <span className="text-xs text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                <Bell className="w-3 h-3" />
                Watching
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationMatrixCard({
  prefs,
  isLoading,
  onUpdate,
  isUpdating,
}: {
  prefs: NotifPrefs | undefined;
  isLoading: boolean;
  onUpdate: (patch: NotifPrefPatch) => void;
  isUpdating: boolean;
}) {
  return (
    <Card className="border border-border rounded-xl">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="editorial-subheading text-foreground text-sm font-semibold">
            Alert Settings
          </h3>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_36px_28px_28px_28px] items-center mb-1 px-1">
              <span className="text-xs text-muted-foreground">Event</span>
              <span className="text-xs text-muted-foreground text-center">On</span>
              <span className="flex justify-center" title="Email">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              </span>
              <span className="flex justify-center" title="In-App">
                <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
              </span>
              <span className="flex justify-center" title="SMS">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              </span>
            </div>

            {/* Event rows */}
            <div className="divide-y divide-border/50">
              {EVENT_ROWS.map(({ key, label, subtitle }) => {
                const pref = prefs?.[key];
                const enabled = pref?.enabled ?? false;
                const emailOn = pref?.channels?.email ?? false;
                const inAppOn = pref?.channels?.inApp ?? false;
                const smsOn   = pref?.channels?.sms   ?? false;

                return (
                  <div
                    key={key}
                    className="grid grid-cols-[1fr_36px_28px_28px_28px] items-center py-2.5 px-1"
                  >
                    <div className="min-w-0 pr-2">
                      <p className={`text-sm leading-tight truncate ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground leading-tight">{subtitle}</p>
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => onUpdate({ [key]: { enabled: v } })}
                        disabled={isUpdating}
                        aria-label={`Enable ${label}`}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={emailOn}
                        onCheckedChange={(v) => onUpdate({ [key]: { channels: { email: !!v } } })}
                        disabled={isUpdating || !enabled}
                        aria-label={`Email for ${label}`}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={inAppOn}
                        onCheckedChange={(v) => onUpdate({ [key]: { channels: { inApp: !!v } } })}
                        disabled={isUpdating || !enabled}
                        aria-label={`In-app for ${label}`}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={smsOn}
                        onCheckedChange={(v) => onUpdate({ [key]: { channels: { sms: !!v } } })}
                        disabled={isUpdating || !enabled}
                        aria-label={`SMS for ${label}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border/50">
              Changes are saved automatically. SMS requires a Pro plan.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityTimelineCard({
  changes,
  isLoading,
  companyName,
}: {
  changes: SponsorChange[];
  isLoading: boolean;
  companyName: string;
}) {
  const revokedEvents = changes.filter((change) => change.changeType === "REMOVED_REVOKED").length;
  const reinstatedEvents = changes.filter((change) => change.changeType === "RE_ACTIVATED").length;

  return (
    <Card className="border border-border rounded-xl">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="editorial-subheading text-foreground text-sm font-semibold">
              Register Activity
            </h3>
          </div>
          {!isLoading && (revokedEvents > 0 || reinstatedEvents > 0) && (
            <div className="flex flex-wrap justify-end gap-2">
              {revokedEvents > 0 && (
                <Badge className="bg-red-500/10 text-red-600 border border-red-500/20 text-xs">
                  {revokedEvents} revoked
                </Badge>
              )}
              {reinstatedEvents > 0 && (
                <Badge className="bg-blue-500/10 text-blue-600 border border-blue-500/20 text-xs">
                  {reinstatedEvents} reinstated
                </Badge>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1.5" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : changes.length === 0 ? (
          <div className="text-center py-6">
            <div className="bg-muted/50 rounded-xl w-10 h-10 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {companyName
                ? `No register changes detected for ${companyName} yet.`
                : "No register changes detected yet."}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              We'll alert you as soon as something changes.
            </p>
          </div>
        ) : (
          <ol className="space-y-0">
            {changes.map((change, idx) => {
              const { label, Icon, color } = changeMeta(change.changeType);
              return (
                <li key={change.id} className="flex gap-3">
                  {/* Timeline spine */}
                  <div className="flex flex-col items-center">
                    <div className={`bg-muted rounded-lg p-1.5 shrink-0 ${color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    {idx < changes.length - 1 && (
                      <div className="w-px flex-1 bg-border/50 my-1" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 pb-4 min-w-0">
                    <p className="text-sm text-foreground font-medium">{label}</p>
                    {!companyName && (
                      <p className="text-xs text-muted-foreground truncate">
                        {change.organisationName}
                      </p>
                    )}
                    {(change.previousValue || change.newValue) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {change.previousValue && <span className="line-through mr-1">{change.previousValue}</span>}
                        {change.newValue && <span className="text-foreground">{change.newValue}</span>}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(change.detectedAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function UpsellCard({ plan }: { plan: string }) {
  const [, setLocation] = useLocation();

  if (plan === "pro" || plan === "unlimited" || plan === "enterprise") {
    return (
      <Card className="border border-border rounded-xl bg-gradient-to-br from-violet-500/5 to-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="editorial-subheading text-foreground text-sm font-semibold">
              Enterprise Monitoring
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Need to monitor unlimited companies, webhook integrations, CSV bulk upload, and dedicated support?
          </p>
          <Button
            size="sm"
            className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
            onClick={() => setLocation("/pricing")}
          >
            Contact Sales
            <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // starter plan → upsell to pro
  return (
    <Card className="border border-primary/20 rounded-xl bg-gradient-to-br from-primary/5 to-background">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="editorial-subheading text-foreground text-sm font-semibold">
            Upgrade to Pro
          </h3>
          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs ml-auto">
            Recommended
          </Badge>
        </div>
        <ul className="space-y-1.5 mb-4">
          {[
            "Monitor up to 5 companies",
            "Immediate alerts (not same-day)",
            "WhatsApp + SMS notifications",
            "5 CoS checks per month",
            "Enriched company intelligence",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              {f}
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
          onClick={() => setLocation("/pricing")}
        >
          Upgrade Now
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SponsorDashboard() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const companyParam = new URLSearchParams(search).get("company") || "";

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const returnUrl = `/dashboard/sponsor${companyParam ? `?company=${encodeURIComponent(companyParam)}` : ""}`;
      setLocation(`/login?return=${encodeURIComponent(returnUrl)}`);
    }
  }, [authLoading, isAuthenticated, companyParam, setLocation]);

  const { data: watches, isLoading: watchesLoading } = useQuery<WatchEntry[]>({
    queryKey: ["/api/watches"],
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const { data: prefs, isLoading: prefsLoading } = useQuery<NotifPrefs>({
    queryKey: ["/api/notifications/preferences"],
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const updatePrefsMutation = useMutation({
    mutationFn: (patch: NotifPrefPatch) =>
      apiRequest("PATCH", "/api/notifications/preferences", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/preferences"] });
      toast({ title: "Alert settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const watchedEntries = (watches ?? []).filter((watch) => watch.isActive);
  const activeSponsorWatches = watchedEntries.filter(
    (watch) => !isRevokedStatus(watch.currentStatus?.status),
  );
  const revokedSponsorWatches = watchedEntries.filter((watch) =>
    isRevokedStatus(watch.currentStatus?.status),
  );

  // Find the watch matching the URL param
  const focusedWatch = companyParam && watches
    ? watchedEntries.find(
        (watch) =>
          normalizeCompanyName(watch.organisationName) === normalizeCompanyName(companyParam),
      )
    : undefined;

  // Collect timeline changes
  const timelineChanges: SponsorChange[] = (() => {
    if (!watches) return [];

    if (companyParam) {
      // Only show changes for the focused company
      const target = focusedWatch ?? watchedEntries.find(
        (w) => normalizeCompanyName(w.organisationName) === normalizeCompanyName(companyParam),
      );
      return target ? [...target.recentChanges].sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()) : [];
    }

    // All watches: merge and sort
    return watchedEntries
      .flatMap((w) => w.recentChanges)
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, 15);
  })();

  const plan = user?.subscriptionStatus || "free";
  const isFreeUser = plan === "free" || !plan;

  // Show loading skeleton while auth resolves
  if (authLoading) {
    return (
      <PageLayout>
        <div className="max-w-[480px] mx-auto px-4 py-8">
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  // Free user upgrade prompt
  if (isFreeUser && isAuthenticated) {
    return (
      <PageLayout>
        <SEOHead
          title="Sponsor Monitor Dashboard | Check By AI"
          description="Monitor UK sponsor licence changes in real time."
          canonicalUrl="https://checkbyai.net/dashboard/sponsor"
        />
        <div className="max-w-[480px] mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
          >
            <Card className="border border-primary/20 rounded-xl">
              <CardContent className="p-6 text-center">
                <div className="bg-primary/10 rounded-xl w-12 h-12 flex items-center justify-center mx-auto mb-4">
                  <Bell className="w-6 h-6 text-primary" />
                </div>
                <h2 className="editorial-subheading text-foreground text-xl mb-2">
                  {companyParam ? `Monitor ${companyParam}` : "Start Monitoring"}
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Get real-time alerts when a sponsor's licence status changes on the GOV.UK register.
                </p>
                <Button
                  className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() =>
                    setLocation(
                      companyParam
                        ? `/pricing?company=${encodeURIComponent(companyParam)}`
                        : "/pricing",
                    )
                  }
                >
                  View Plans
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <SEOHead
        title="Sponsor Monitor Dashboard | Check By AI"
        description="Monitor UK sponsor licence changes in real time."
        canonicalUrl="https://checkbyai.net/dashboard/sponsor"
      />
      <div className="max-w-[480px] mx-auto px-4 py-8">
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
        >
          {/* Section 1: Company header */}
          {(companyParam || focusedWatch) && (
            <CompanyHeaderCard
              companyName={companyParam}
              watch={focusedWatch}
              isLoading={watchesLoading}
            />
          )}

          {/* Section 2: Notification controls */}
          <NotificationMatrixCard
            prefs={prefs}
            isLoading={prefsLoading}
            onUpdate={(patch) => updatePrefsMutation.mutate(patch)}
            isUpdating={updatePrefsMutation.isPending}
          />

          {/* Section 3: Activity timeline */}
          <ActivityTimelineCard
            changes={timelineChanges}
            isLoading={watchesLoading}
            companyName={companyParam}
          />

          {/* Section 4: Upsell (starter or pro only) */}
          {(plan === "starter" || plan === "pro") && <UpsellCard plan={plan} />}

          {!companyParam && watches && (
            <>
              <Card className="border border-border rounded-xl overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Watch Status</p>
                      <h3 className="editorial-subheading text-foreground text-sm font-semibold">
                        {watchedEntries.length === 0
                          ? "No sponsors currently watched"
                          : `Watching ${watchedEntries.length} sponsor${watchedEntries.length === 1 ? "" : "s"}`}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {watchedEntries.length === 0
                          ? "Add a sponsor to start tracking active, revoked, and reinstated changes."
                          : revokedSponsorWatches.length > 0
                            ? `${revokedSponsorWatches.length} sponsor${revokedSponsorWatches.length === 1 ? " is" : "s are"} currently revoked.`
                            : "All watched sponsors are currently active or pending review."}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 shrink-0">
                      <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs">
                        {activeSponsorWatches.length} active
                      </Badge>
                      <Badge className="bg-red-500/10 text-red-600 border border-red-500/20 text-xs">
                        {revokedSponsorWatches.length} revoked
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-2 px-1">
                  Watching Active
                </p>
                {activeSponsorWatches.length === 0 ? (
                  <Card className="border border-border rounded-xl">
                    <CardContent className="p-5">
                      <p className="text-sm text-foreground">No active sponsors in your watchlist.</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Revoked sponsors stay tracked below until they are reinstated.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {activeSponsorWatches.map((watch) => {
                      const latestChange = watch.recentChanges[0];
                      return (
                        <button
                          key={watch.id}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-left"
                          onClick={() =>
                            setLocation(
                              `/dashboard/sponsor?company=${encodeURIComponent(watch.organisationName)}`,
                            )
                          }
                        >
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{watch.organisationName}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {latestChange
                                ? `${changeMeta(latestChange.changeType).label} · ${formatDate(latestChange.detectedAt)}`
                                : watch.townCity || "Monitoring for status changes"}
                            </p>
                          </div>
                          <StatusBadge status={watch.currentStatus?.status} />
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-2 px-1">
                  Watching Revoked
                </p>
                {revokedSponsorWatches.length === 0 ? (
                  <Card className="border border-border rounded-xl">
                    <CardContent className="p-5">
                      <p className="text-sm text-foreground">No revoked sponsors in your watchlist.</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        If a watched sponsor is removed from the register, it will stay visible here until reinstated.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {revokedSponsorWatches.map((watch) => {
                      const latestChange = watch.recentChanges[0];
                      return (
                        <button
                          key={watch.id}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-500/20 bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/60 dark:hover:bg-red-950/20 transition-colors text-left"
                          onClick={() =>
                            setLocation(
                              `/dashboard/sponsor?company=${encodeURIComponent(watch.organisationName)}`,
                            )
                          }
                        >
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{watch.organisationName}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {latestChange
                                ? `${changeMeta(latestChange.changeType).label} · ${formatDate(latestChange.detectedAt)}`
                                : "Revoked sponsors remain monitored for reinstatement"}
                            </p>
                          </div>
                          <StatusBadge status={watch.currentStatus?.status} />
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </PageLayout>
  );
}
