import { cn } from '@/lib/utils'
import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { useQuery } from '@tanstack/react-query'
import { STALE_TIMES } from '@/lib/queryDefaults'
import { unwrapApiEnvelope } from '@/lib/apiEnvelope'
import { motion, AnimatePresence } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Zap, Lock, ArrowRight, Play, Bell, Activity, CheckCircle, XCircle, AlertTriangle, ShieldCheck, Search, Loader2, ChevronDown } from 'lucide-react'
import { ShieldMonitorIcon, DocumentVerifyIcon, TimelineClockIcon, EarlyWarningIcon,
  HeroAlertIcon,
  HeroTrackedIcon,
  HeroGDPRLockIcon,
  TripleChannelIcon,
  UKLockIcon
} from './icons/CheckByAIIcons';
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Link, useLocation } from 'wouter'
import logoImg from "@assets/logo_material.png";
import Footer from '@/components/Footer'
import LandingDigest from '@/components/LandingDigest'
import CosSamplePreview from '@/components/CosSamplePreview'

const AnimatedBackground = lazy(() => import('./AnimatedBackground'))
const Enhanced3DDemo = lazy(() => import('./Enhanced3DDemo'))

const spring = { type: "spring" as const, stiffness: 100, damping: 15 }
const springGentle = { type: "spring" as const, stiffness: 80, damping: 18 }

function FeatureCard({ icon, title, description, index }: { icon: React.ReactNode; title: string; description: string; index: number }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ ...spring, delay: index * 0.12 }} className="group theme-card p-8 overflow-hidden">
      <div className="relative z-10">
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl">{icon}</div>
        <h3 className="text-lg editorial-subheading text-foreground mb-3">{title}</h3>
        <p className="text-sm editorial-body text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  )
}

function LoadingFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-primary/5">
      <div className="text-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading</p>
      </div>
    </div>
  )
}

// ── Recently Revoked widget ───────────────────────────────────────────────────

interface RevokedEntry {
  id:          number;
  currentName: string;
  townCity:    string | null;
  route:       string | null;
  removedAt:   string | null;
}

function toDetailSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
}

function RecentlyRevokedSection() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const { data, isLoading } = useQuery<RevokedEntry[]>({
    queryKey: ["/api/sponsors/recently-revoked"],
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
    refetchOnWindowFocus: true,
    select: (res: any) => (res?.data ?? res) as RevokedEntry[],
  });
  // Shares the cache entry with NightlyStatsBar/UrgencyBanner (same queryKey) —
  // no extra request. A long run of zero-new-revocations days can leave every
  // row above showing an old date; this line confirms the scanner is still
  // actually running, distinct from "most recent revocation".
  const { data: stats, isLoading: statsLoading } = useQuery<NightlyStats>({
    queryKey: ["/api/sponsors/nightly-stats"],
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
    refetchOnWindowFocus: true,
    select: (res: any) => (res?.data ?? res) as NightlyStats,
  });

  return (
    <section ref={ref} className="bg-white dark:bg-background py-16 border-t border-border">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-5 h-5 text-red-500" aria-hidden="true" />
                <h2 className="text-xl font-bold text-foreground">Recently Revoked Licences</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Latest removals from the Home Office register, updated nightly.
                {!statsLoading && stats?.lastRunDate && (
                  <span className="ml-1 text-muted-foreground/70">
                    Register last checked: {formatRunDate(stats.lastRunDate)}.
                  </span>
                )}
              </p>
            </div>
            <Link href="/sponsor-changes">
              <Button variant="outline" size="sm" className="rounded-full text-xs">
                View All Changes <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && data && data.length > 0 && (
            <div className="rounded-xl border border-red-100 dark:border-red-900/40 overflow-hidden divide-y divide-red-50 dark:divide-red-900/20">
              {data.map((s) => (
                <Link
                  key={s.id}
                  href={`/sponsor/${s.id}/${toDetailSlug(s.currentName)}`}
                  className="flex items-center gap-4 px-5 py-4 bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors group"
                >
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate leading-relaxed group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                      {s.currentName}
                    </p>
                    {(s.townCity || s.route) && (
                      <p className="text-xs text-muted-foreground truncate mt-1 leading-relaxed">
                        {[s.townCity, s.route].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="text-xs whitespace-nowrap shrink-0">
                    {formatRevokedItemDate(s.removedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {!isLoading && (!data || data.length === 0) && (
            <div className="rounded-xl border border-border py-10 text-center text-muted-foreground text-sm">
              No revocations detected in recent data.
            </div>
          )}

          <div className="mt-5 bg-slate-50 dark:bg-slate-900/50 border border-border rounded-xl px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              <Bell className="w-3.5 h-3.5 inline mr-1 text-emerald-500" />
              Get instant WhatsApp or email alerts when any sponsor revokes.
            </p>
            <Link href="/pricing">
              <Button variant="brand" size="sm" className="text-xs">
                Set Up Alerts
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Nightly stats bar ─────────────────────────────────────────────────────

interface NightlyStats {
  totalActive:          number;
  lastRunDate:          string | null;
  digestDate:           string | null;
  isDigestCurrent:      boolean;
  addedCount:           number;
  removedCount:         number;
  changesCount:         number;
  revokedLast12Months:  number;
  staleDays:            number;
}

function formatRevokedItemDate(removedAt: string | null): JSX.Element {
  if (!removedAt) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">Licence Revoked</span>;
  }
  const d = new Date(removedAt);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const isoDate = (dt: Date) => dt.toISOString().slice(0, 10);
  const itemIso = isoDate(d);
  const todayIso = isoDate(today);
  const yesterdayIso = isoDate(yesterday);

  if (itemIso === todayIso) {
    return <span className="text-xs font-semibold text-red-600 dark:text-red-400">Today</span>;
  }
  if (itemIso === yesterdayIso) {
    return <span className="text-xs font-medium text-red-600/90 dark:text-red-400/90">Yesterday</span>;
  }

  const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays <= 7) {
    return <span className="text-xs font-medium text-muted-foreground">{diffDays} days ago</span>;
  }

  return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">Licence Revoked</span>;
}

function formatRunDate(dateStr: string | null): string {
  if (!dateStr) return "Today";
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isoDate = (dt: Date) => dt.toISOString().slice(0, 10);

  const itemIso = isoDate(d);
  const todayIso = isoDate(today);
  const yesterdayIso = isoDate(yesterday);

  if (itemIso === todayIso) return "Today";
  if (itemIso === yesterdayIso) return "Yesterday";

  const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays <= 7) {
    return `${diffDays} days ago`;
  }
  return "Today";
}

function NightlyStatsBar() {
  const { data, isLoading } = useQuery<NightlyStats>({
    queryKey: ["/api/sponsors/nightly-stats"],
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
    refetchOnWindowFocus: true,
    select: (res: any) => (res?.data ?? res) as NightlyStats,
  });

  const totalLabel   = isLoading ? "—" : (data?.totalActive  ?? 0).toLocaleString("en-GB");
  const changesLabel = isLoading ? "—" : (() => {
    if (!data) return "No data";
    const parts: string[] = [];
    if (data.addedCount)   parts.push(`+${data.addedCount} new`);
    if (data.removedCount) parts.push(`${data.removedCount} revoked`);
    if (data.changesCount) parts.push(`${data.changesCount} updated`);
    return parts.length > 0 ? parts.join(" · ") : "No changes";
  })();
  const dateLabel    = isLoading ? "—" : formatRunDate(data?.lastRunDate ?? null);
  const hasRemovals  = !isLoading && (data?.removedCount ?? 0) > 0;
  const revoked12Label = isLoading ? "—" : (data?.revokedLast12Months ?? 0).toLocaleString("en-GB");
  // The digest can stay pinned to the last day with real changes (see
  // sponsorPages.ts) — when that's not today, label the numbers with their
  // actual date instead of implying they're from tonight's run.
  const changesCaption = !isLoading && data && !data.isDigestCurrent
    ? `As of ${formatRunDate(data.digestDate)}`
    : "In last nightly run";

  return (
    <div className="bg-slate-900 border-y border-slate-700 -mt-16 relative z-10">
      <div className="max-w-5xl mx-auto px-4 py-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-0 sm:divide-x sm:divide-slate-700 text-center">
          <div className="px-4">
            <p className={cn("text-2xl font-bold text-white", isLoading && "animate-pulse")}>{totalLabel}</p>
            <p className="text-xs text-slate-400 mt-0.5">Active licensed sponsors</p>
          </div>
          <div className="px-4">
            <p className={cn("text-2xl font-bold", isLoading ? "text-white animate-pulse" : hasRemovals ? "text-red-400" : "text-emerald-400")}>
              {changesLabel}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{changesCaption}</p>
          </div>
          <div className="px-4">
            <Link href="/sponsor-changes" className="group">
              <p className={cn("text-2xl font-bold text-red-400 group-hover:text-red-300 transition-colors", isLoading && "animate-pulse")}>
                {revoked12Label}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 group-hover:text-slate-300 transition-colors">
                Licences revoked · 12 months <ArrowRight className="w-3 h-3 inline ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
            </Link>
          </div>
          <div className="px-4">
            <p className={cn("text-2xl font-bold text-emerald-400", isLoading && "animate-pulse")}>{dateLabel}</p>
            <p className="text-xs text-slate-400 mt-0.5">Register last checked</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Latest change toast ───────────────────────────────────────────────────

interface LatestChange {
  changeType:    string;
  previousValue: string | null;
  newValue:      string | null;
  detectedAt:    string;
  companyName:   string;
  companyId:     number;
}

function changeLabel(c: LatestChange): string {
  const name = c.companyName;
  const date = new Date(c.detectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  switch (c.changeType) {
    case "REMOVED_REVOKED":
      return `'${name}' had its licence revoked, detected ${date}.`;
    case "DOWNGRADED": {
      const ratingChange = c.previousValue && c.newValue ? ` from ${c.previousValue} to ${c.newValue}` : "";
      return `'${name}' was downgraded${ratingChange}, detected ${date}.`;
    }
    case "UPGRADED": {
      const ratingChange = c.previousValue && c.newValue ? ` from ${c.previousValue} to ${c.newValue}` : "";
      return `'${name}' was upgraded${ratingChange}, detected ${date}.`;
    }
    default:
      return `Change detected for '${name}' on ${date}.`;
  }
}

function heroSearchButtonLabel(searchLoading: boolean, alertMeOnSubmit: boolean) {
  if (searchLoading) return <Loader2 className="w-4 h-4 animate-spin" />;
  if (alertMeOnSubmit) return <><Bell className="w-3.5 h-3.5" />Search &amp; Alert Me</>;
  return <><Search className="w-3.5 h-3.5" />Search</>;
}

function LatestChangeToast() {
  const { data, isLoading } = useQuery<LatestChange | null>({
    queryKey: ["/api/sponsors/latest-change"],
    staleTime: STALE_TIMES.INFREQUENT,
    select: (res: any) => (res?.data ?? null) as LatestChange | null,
  });

  if (isLoading || !data || !data.companyName) return null;

  const slug = toHeroSlug(data.companyName);
  const href = `/sponsor/${data.companyId}/${slug}`;

  return (
    <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-xl p-4 mb-8 flex items-start gap-3">
      <Activity className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
      <p className="text-sm">
        <span className="font-bold text-emerald-400">Latest detection: </span>
        <Link href={href} className="hover:underline">{changeLabel(data)}</Link>
        {" "}
        <Link href="/sponsor-monitor" className="text-emerald-400 font-semibold hover:underline whitespace-nowrap">
          Monitor your employer →
        </Link>
      </p>
    </div>
  );
}

// ── Urgency banner ────────────────────────────────────────────────────────

function UrgencyBanner() {
  const { data, isLoading } = useQuery<NightlyStats>({
    queryKey: ["/api/sponsors/nightly-stats"],
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
    refetchOnWindowFocus: true,
    select: (res: any) => (res?.data ?? res) as NightlyStats,
  });

  // Don't render until data arrives — avoids showing stale hardcoded text
  if (isLoading || !data || !data.lastRunDate) return null;

  const { removedCount, changesCount, addedCount, lastRunDate } = data;

  if (removedCount > 0) {
    return (
      <div className="bg-red-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2.5 text-center">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <p className="text-xs sm:text-sm font-medium">
            <span className="font-bold">{removedCount} sponsor licence{removedCount !== 1 ? "s" : ""} revoked</span>{" "}
            in the last nightly register update.{" "}
            <Link href="/sponsor-monitor" className="underline underline-offset-2 font-bold">Check if your employer is affected →</Link>
          </p>
        </div>
      </div>
    );
  }

  if (changesCount > 0) {
    return (
      <div className="bg-amber-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2.5 text-center">
          <Activity className="w-3.5 h-3.5 shrink-0 animate-pulse" aria-hidden="true" />
          <p className="text-xs sm:text-sm font-medium">
            <span className="font-bold">{changesCount} licence change{changesCount !== 1 ? "s" : ""}</span>{" "}
            detected in the last nightly run.{" "}
            <Link href="/sponsor-monitor" className="underline underline-offset-2 font-bold">Set up monitoring →</Link>
          </p>
        </div>
      </div>
    );
  }

  if (addedCount > 0) {
    return (
      <div className="bg-emerald-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2.5 text-center">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <p className="text-xs sm:text-sm font-medium">
            <span className="font-bold">{addedCount} new sponsor{addedCount !== 1 ? "s" : ""}</span>{" "}
            added in the last nightly run. Register updated {formatRunDate(lastRunDate)}.
          </p>
        </div>
      </div>
    );
  }

  // No changes at all
  // If staleDays >= 3 (no successful run in 3+ calendar days), show an amber
  // warning banner — the register data may be outdated.
  if (data.staleDays >= 3) {
    return (
      <div className="bg-amber-900 text-amber-100">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          <p className="text-xs sm:text-sm font-medium">
            Register data may be out of date, last checked {formatRunDate(lastRunDate)}. The nightly update may have been delayed.
          </p>
        </div>
      </div>
    );
  }

  // No changes and data is fresh — show a calm confirmation strip
  return (
    <div className="bg-slate-800 text-slate-200">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
        <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
        <p className="text-xs sm:text-sm font-medium">
          Register checked {formatRunDate(lastRunDate)}, no changes detected.
        </p>
      </div>
    </div>
  );
}

// ── Dark-themed dropdown for the home page hero nav ──────────────────────────

interface HeroNavItem { href: string; label: string; desc: string }

function HeroNavDropdown({ label, items }: { label: string; items: HeroNavItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 px-4 py-2 text-sm text-white/70 hover:text-white font-medium rounded-full hover:bg-white/10 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        {label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            role="menu"
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-60 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl shadow-black/40 overflow-hidden z-50"
          >
            <div className="p-1.5">
              {items.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className="flex flex-col gap-0.5 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
                >
                  <span className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">{item.label}</span>
                  <span className="text-xs text-white/50">{item.desc}</span>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface HeroSectionProps {
  onStartVerification?: () => void;
}

interface FreeSearchResult {
  id?:             number;
  fingerprint:     string;
  organisationName: string;
  townCity:        string | null;
  typeRating:      string | null;
  route:           string | null;
  status:          string;
  matchScore:      number;
  grantedAt:       string | null;
  removedAt?:      string | null;
  isNew:           boolean;
}

// ── Client-side instant search index ─────────────────────────────────────────
// Cached at module level — survives re-renders and only fetches once per session.

interface IndexEntry { id: number; n: string; c: string | null; r: string | null; t: string | null; s: string }

let _clientIndex: IndexEntry[] | null = null;
let _indexFetching = false;

function preloadSearchIndex(): void {
  if (_clientIndex !== null || _indexFetching) return;
  _indexFetching = true;
  fetch("/api/sponsors/search-index.json")
    .then((res) => res.json())
    .then((data) => {
      // Unwrap the API envelope { success: true, data: [...] }.
      // The route may be called directly (raw array) or via getQueryFn (wrapped object).
      _clientIndex = Array.isArray(data) ? data : (data?.data ?? []);
    })
    .catch(() => {})
    .finally(() => { _indexFetching = false; });
}

function clientSearch(q: string, limit = 20): FreeSearchResult[] {
  if (!_clientIndex) return [];
  const query = q.toLowerCase();
  type Scored = { e: IndexEntry; score: number };
  const hits: Scored[] = [];
  for (const e of _clientIndex) {
    const name = e.n.toLowerCase();
    if (name.includes(query)) {
      hits.push({ e, score: name.startsWith(query) ? 2 : 1 });
    }
  }
  return hits
    .sort((a, b) => b.score - a.score || a.e.n.localeCompare(b.e.n))
    .slice(0, limit)
    .map(({ e, score }) => ({
      id:               e.id,
      fingerprint:      String(e.id),
      organisationName: e.n,
      townCity:         e.c,
      typeRating:       e.t,
      route:            e.r,
      status:           e.s,
      matchScore:       score === 2 ? 100 : 60, // startsWith vs plain substring
      grantedAt:        null,
      isNew:            e.s === "NEWLY_GRANTED",
    }));
}

function toHeroSlug(name: string | null | undefined): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
}

export default function HeroSection({ onStartVerification }: HeroSectionProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
  const [, setLocation] = useLocation()
  const [searchQuery, setSearchQuery] = useState("")
  const [alertMeOnSubmit, setAlertMeOnSubmit] = useState(false)
  const [searchResults, setSearchResults] = useState<FreeSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchUnavailable, setSearchUnavailable] = useState(false)
  const [historicalResults, setHistoricalResults] = useState<FreeSearchResult[]>([])
  const [historicalLoading, setHistoricalLoading] = useState(false)
  const historicalDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const triggerHistoricalSearch = async (q: string) => {
    setHistoricalLoading(true)
    setHistoricalResults([])
    try {
      const res = await fetch(`/api/sponsors/historical-search?q=${encodeURIComponent(q)}`)
      const envelope = await res.json()
      const data = unwrapApiEnvelope<{ results?: FreeSearchResult[] }>(envelope)
      if (res.ok) setHistoricalResults(data.results || [])
    } catch {
      // silently swallow — historical search is a best-effort enhancement
    } finally {
      setHistoricalLoading(false)
    }
  }

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  // Auto-focus the search input when the page is opened with ?search=1.
  // Used by the "Find active sponsors" link on the revoked-company CTA.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('search') === '1') {
      // Small delay so the element is visible after mount animations
      const t = setTimeout(() => {
        searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        searchInputRef.current?.focus()
      }, 300)
      return () => clearTimeout(t)
    }
  }, [])

  // Pre-load the client-side search index on mount so it's ready by the time
  // the user types. (Fire-and-forget; failures are silently ignored.)
  useEffect(() => { preloadSearchIndex(); }, [])

  // Reactive instant search: runs on every keystroke once the index is loaded.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setHistoricalResults([]);
      if (historicalDebounce.current) clearTimeout(historicalDebounce.current);
      return;
    }
    if (_clientIndex !== null) {
      const results = clientSearch(q);
      setSearchResults(results);
      setHasSearched(true);
      setSearchLoading(false);
      if (results.length === 0) {
        // Debounce the historical DB call so we don't fire on every keystroke.
        if (historicalDebounce.current) clearTimeout(historicalDebounce.current);
        historicalDebounce.current = setTimeout(() => triggerHistoricalSearch(q), 600);
      } else {
        setHistoricalResults([]);
        if (historicalDebounce.current) clearTimeout(historicalDebounce.current);
      }
    }
  }, [searchQuery])

  const handleSearchSubmit = async () => {
    const q = searchQuery.trim();
    if (q.length < 3) return;
    // "Alert me" is on: hand off to Sponsor Monitor, which owns real watch
    // creation and auth/freemium handling — the hero stays a pure discovery surface.
    if (alertMeOnSubmit) {
      setLocation(`/sponsor-monitor?q=${encodeURIComponent(q)}&alert=1`);
      return;
    }
    // If the client index is already loaded, the useEffect already populated results
    if (_clientIndex !== null) {
      const results = clientSearch(q);
      setSearchResults(results);
      setHasSearched(true);
      if (results.length === 0) triggerHistoricalSearch(q);
      return;
    }
    // Fallback: server-side search when index hasn't loaded yet
    setSearchLoading(true);
    setSearchResults([]);
    setHistoricalResults([]);
    setSearchUnavailable(false);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/sponsors/free-search?q=${encodeURIComponent(q)}`);
      const envelope = await res.json();
      const data = unwrapApiEnvelope<{ results?: FreeSearchResult[] }>(envelope);
      if (res.ok) {
        const results = data.results || [];
        setSearchResults(results);
        if (results.length === 0) triggerHistoricalSearch(q);
      } else {
        setSearchUnavailable(true);
      }
    } catch {
      setSearchUnavailable(true);
    } finally {
      setSearchLoading(false);
    }
  }

  return (
    <>
      {showDemo && (
        <Suspense fallback={<LoadingFallback />}>
          <Enhanced3DDemo
            isVisible={showDemo}
            onClose={() => setShowDemo(false)}
            onTryFreeCheck={() => { setShowDemo(false); window.location.href = '/dashboard'; }}
          />
        </Suspense>
      )}

    <div className="min-h-screen bg-background">
      <UrgencyBanner />

      <div className="relative overflow-hidden">
        <div className="theme-gradient pb-32 pt-6">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
            <nav className="flex justify-between items-center py-4 mb-6">
              <Link href="/" className="flex items-center shrink-0">
                <img src={logoImg} alt="CheckByAi.net" width={160} height={40} className="h-10 sm:h-12 w-auto object-contain" />
              </Link>

              {/* Desktop grouped nav */}
              <div className="hidden md:flex items-center gap-1">
                <HeroNavDropdown
                  label="Monitor"
                  items={[
                    { href: "/sponsors",        label: "Sponsor Register",  desc: "Search 124,000+ licensed sponsors" },
                    { href: "/sponsor-monitor", label: "Sponsor Monitor",   desc: "Get alerted when a licence changes" },
                    { href: "/sponsor-changes", label: "Licence Changes",   desc: "Recent additions and revocations" },
                  ]}
                />
                <Link href="/dashboard" className="px-4 py-2 text-sm text-white/70 hover:text-white font-medium rounded-full hover:bg-white/10 transition-all duration-200">Verify CoS</Link>
                <Link href="/pricing"   className="px-4 py-2 text-sm text-white/70 hover:text-white font-medium rounded-full hover:bg-white/10 transition-all duration-200">Pricing</Link>
                <HeroNavDropdown
                  label="Resources"
                  items={[
                    { href: "/cos-guide",  label: "CoS Guide",  desc: "Certificate of Sponsorship explained" },
                    { href: "/ai-guide",   label: "AI Guide",   desc: "How our AI verification works" },
                    { href: "/technology", label: "Technology", desc: "The tech behind CheckByAI" },
                    { href: "/api-docs",   label: "API Docs",   desc: "Integrate via our REST API" },
                  ]}
                />
              </div>

              <div className="flex items-center gap-2">
                <Link href="/pricing" className="hidden sm:flex items-center gap-1.5 px-4 py-2 text-sm text-white/70 hover:text-white font-medium rounded-full hover:bg-white/10 transition-all duration-200">
                  <Bell className="w-3.5 h-3.5" />Get Alerts
                </Link>
                <Link href="/login" className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all">Sign In</Link>
              </div>
            </nav>

            <div className="grid lg:grid-cols-2 gap-16 items-center min-h-[70vh] py-8">
              <div className="space-y-7">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={isLoaded ? { opacity: 1, x: 0 } : {}} transition={{ ...springGentle, delay: 0.1 }}>
                  <span className="inline-flex items-center gap-2 text-white text-xs font-bold bg-indigo-500/20 px-4 py-2 rounded-full backdrop-blur-sm">
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    UK sponsor licence monitoring
                  </span>
                </motion.div>

                <motion.h1 initial={{ opacity: 0, y: 30 }} animate={isLoaded ? { opacity: 1, y: 0 } : {}} transition={{ ...spring, delay: 0.2 }} className="text-4xl sm:text-5xl editorial-heading text-white leading-[1.1]">
                  Automated UK Sponsor Licence{' '}
                  <span className="text-gradient-indigo">& Integrity Monitoring</span>
                </motion.h1>

                <motion.p initial={{ opacity: 0, y: 20 }} animate={isLoaded ? { opacity: 1, y: 0 } : {}} transition={{ ...springGentle, delay: 0.35 }} className="text-base text-white/70 max-w-lg leading-relaxed">
                  We check the sponsor register every weeknight at ~00:30 UTC and alert you when your employer's status changes: Pro subscribers twice daily at 07:00 and 19:00 UTC, Starter subscribers by 18:00 UTC the same day.
                </motion.p>

                {/* ── Hero search box ───────────────────────────────────── */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={isLoaded ? { opacity: 1, y: 0 } : {}} transition={{ ...spring, delay: 0.45 }} className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none" />
                    <input
                      type="text"
                      ref={searchInputRef}
                      placeholder="Search any employer, e.g. NHS, Tata, Deloitte…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
                      className="w-full pl-11 pr-28 h-14 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 text-sm focus:outline-none focus:border-emerald-400 focus:bg-white/15 transition-all"
                    />
                    <button
                      onClick={handleSearchSubmit}
                      disabled={searchQuery.trim().length < 3 || searchLoading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-full px-4 h-10 text-sm font-semibold transition-colors flex items-center gap-1.5"
                    >
                      {heroSearchButtonLabel(searchLoading, alertMeOnSubmit)}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-white/50">Free, unlimited searches. No login required. 124,000+ licensed sponsors.</p>
                    <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer select-none">
                      <Switch checked={alertMeOnSubmit} onCheckedChange={setAlertMeOnSubmit} className="scale-90" />
                      Also alert me when this employer's licence changes
                    </label>
                  </div>
                  <a href="#cos-verification" className="inline-block text-sm font-medium text-white/70 hover:text-white underline underline-offset-2">
                    Need to verify a CoS document instead? →
                  </a>

                  {/* Hero search results */}
                  {searchLoading && (
                    <div className="flex items-center gap-2 text-white/60 text-sm py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />Searching…
                    </div>
                  )}
                  {searchUnavailable && (
                    <p className="text-amber-300 text-xs py-1">Search temporarily unavailable. Please try again.</p>
                  )}
                  {!searchLoading && !searchUnavailable && hasSearched && searchResults.length === 0 && !historicalLoading && historicalResults.length === 0 && (
                    <p className="text-white/60 text-xs py-1">No sponsors found. Try a different name.</p>
                  )}
                  {!searchLoading && searchResults.length > 0 && (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                      {searchResults.map((r) => {
                        const isActive = r.status === "ACTIVE";
                        const isNew = r.status === "NEWLY_GRANTED";
                        const isGrace = r.status === "GRACE_PERIOD";
                        const isRemoved = !isActive && !isNew && !isGrace;
                        const isBRated = (r.typeRating || "").toLowerCase().includes("b");
                        const grantedYear = r.grantedAt ? new Date(r.grantedAt).getFullYear() : null;
                        const detailHref = r.id ? `/sponsor/${r.id}/${toHeroSlug(r.organisationName)}` : null;
                        const inner = (
                          <div className="bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-white/15 transition-colors">
                            <div className="min-w-0">
                              <p className="font-semibold text-white text-sm truncate">{r.organisationName}</p>
                              <p className="text-xs text-white/55 mt-0.5 truncate">
                                {[r.townCity, r.route, grantedYear ? `since ${grantedYear}` : null].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isNew && <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">New</span>}
                              {isActive && !isNew && <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">Active</span>}
                              {isGrace && <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">Review</span>}
                              {isRemoved && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">Revoked</span>}
                              {isBRated && <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">B</span>}
                            </div>
                          </div>
                        );
                        return detailHref
                          ? <Link key={r.fingerprint} href={detailHref}>{inner}</Link>
                          : <div key={r.fingerprint}>{inner}</div>;
                      })}
                      <div className="pt-1 text-center">
                        <Link href="/pricing" className="text-xs text-emerald-300 hover:text-emerald-200 font-semibold">
                          Get alerts when any sponsor changes →
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* ── Historical / revoked results tier ───────────────── */}
                  {historicalLoading && (
                    <div className="flex items-center gap-2 text-white/50 text-xs py-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />Checking historical register…
                    </div>
                  )}
                  {!historicalLoading && historicalResults.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        <p className="text-xs text-red-300 font-semibold">Found in historical register: licence revoked</p>
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                        {historicalResults.map((r) => {
                          const removedDate = r.removedAt
                            ? new Date(r.removedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                            : null;
                          const detailHref = r.id ? `/sponsor/${r.id}/${toHeroSlug(r.organisationName)}` : null;
                          const inner = (
                            <div className="bg-red-950/40 border border-red-500/25 rounded-xl px-3.5 py-2.5 hover:bg-red-950/60 transition-colors">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-white text-sm truncate">{r.organisationName}</p>
                                  <p className="text-xs text-red-300/80 mt-0.5 truncate">
                                    {removedDate ? `Licence revoked · ${removedDate}` : "Licence revoked"}{r.townCity ? ` · ${r.townCity}` : ""}
                                  </p>
                                </div>
                                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5">Revoked</span>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <p className="text-xs text-white/50">Get notified if this licence is restored</p>
                                <Link
                                  href="/pricing?plan=starter"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs font-bold text-emerald-300 hover:text-emerald-200 whitespace-nowrap"
                                >
                                  Subscribe for alerts →
                                </Link>
                              </div>
                            </div>
                          );
                          return detailHref
                            ? <Link key={r.fingerprint} href={detailHref}>{inner}</Link>
                            : <div key={r.fingerprint}>{inner}</div>;
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>

                <p className="text-xs text-white/60">
                  CheckByAI is an independent monitoring service and is not affiliated with the UK Home Office or UKVI.
                </p>

                <motion.ul initial={{ opacity: 0 }} animate={isLoaded ? { opacity: 1 } : {}} transition={{ ...springGentle, delay: 0.6 }} aria-label="Trust signals" className="flex items-center gap-x-6 gap-y-2 pt-4 flex-wrap text-xs text-white/60">
                  {[
                    { icon: <HeroAlertIcon className="w-4 h-4 flex-shrink-0" size={16} />, label: "Pro alerts in 30 min" },
                    { icon: <HeroTrackedIcon className="w-4 h-4 flex-shrink-0" size={16} />, label: "47,823 sponsors tracked" },
                    { icon: <HeroGDPRLockIcon className="w-4 h-4 flex-shrink-0" size={16} />, label: "UK GDPR compliant" },
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-white/40">
                        {item.icon}
                      </span>
                      {item.label}
                    </li>
                  ))}
                </motion.ul>
              </div>

              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={isLoaded ? { opacity: 1, scale: 1 } : {}} transition={{ ...springGentle, delay: 0.3 }} className="lg:h-[480px] h-[320px] relative rounded-2xl overflow-hidden shadow-2xl shadow-black/20 border border-white/10">
                <Suspense fallback={<LoadingFallback />}><AnimatedBackground /></Suspense>
              </motion.div>
            </div>
          </div>
        </div>

        <NightlyStatsBar />
      </div>

      <LandingDigest />

      <section className="py-16 sm:py-20 bg-background">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-red-600 dark:text-red-400 mb-4">
            <AlertTriangle className="w-4 h-4" /> Is Your Employer Still Licensed?
          </span>
          <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-3">
            Check Your Sponsor Right Now
          </h2>
          <p className="text-base text-muted-foreground mb-8 max-w-xl mx-auto">
            124,000+ licensed sponsors from the official UK Home Office Register. Free, unlimited, no login required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/sponsors">
              <Button size="lg" className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white rounded-full px-8 font-bold shadow-md">
                <Search className="w-4 h-4 mr-2" />Browse Full Register
              </Button>
            </Link>
            <Link href="/sponsor-monitor">
              <Button size="lg" variant="outline" className="rounded-full px-8 font-bold border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                <Bell className="w-4 h-4 mr-2" />Set Up Monitoring
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Already searched above? <Link href="/pricing" className="text-primary font-semibold hover:underline">Subscribe for real-time alerts →</Link>
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-slate-50 dark:bg-slate-950/50">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="editorial-caption text-emerald-600 dark:text-emerald-400 block mb-4">Why You Need Alerts</span>
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              The Home Office Will Not Warn You
            </h2>
            <p className="text-base editorial-body text-muted-foreground">
              When a sponsor licence is revoked, your visa application is silently rejected. We make sure you know first.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-slate-200 dark:border-slate-800 glow-red transition-all duration-300">
              <CardContent className="py-8 px-6">
                <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center mb-5 shadow-sm">
                  <TimelineClockIcon size={30} />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3">The 12-Hour Advantage</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">We check the register at ~00:30 UTC. Letters are posted at 9 AM. Pro subscribers receive a WhatsApp alert by 07:00 UTC, well before their employer's letter arrives. Starter subscribers are alerted by 18:00 UTC, still the same day.</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800 glow-amber transition-all duration-300">
              <CardContent className="py-8 px-6">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center mb-5 shadow-sm">
                  <EarlyWarningIcon size={30} />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3">Spot Warning Signs Early</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">We track 90 days of history. See if your employer was downgraded to B-rating last month. A downgrade often comes before a full revocation.</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800 glow-teal transition-all duration-300">
              <CardContent className="py-8 px-6">
                <div className="w-14 h-14 rounded-2xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center mb-5 shadow-sm">
                  <TripleChannelIcon size={30} />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3">Triple-Channel Reliability</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">We send Email + WhatsApp + SMS simultaneously. If one channel fails, the others get through. This alert is too important to miss.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-12 bg-background border-y border-border/50">
        <div className="max-w-4xl mx-auto px-6">
          <LatestChangeToast />
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardContent className="py-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-primary">R</span>
                </div>
                <div>
                  <blockquote className="text-foreground text-sm sm:text-base italic leading-relaxed mb-3">
                    "I got the alert just after midnight. My employer got the suspension email at 9 AM. I had already applied for a new job. That subscription saved my 5-year UK career."
                  </blockquote>
                  <p className="text-xs text-muted-foreground font-medium">Rahul K., Skilled Worker Visa Holder</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-background">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-2">Choose Your Protection Level</h2>
          <p className="text-center text-muted-foreground mb-12">Keep your visa safe. Cancel anytime.</p>

          <div className="grid md:grid-cols-3 gap-5">
            <Card className="border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800/30 opacity-80">
              <CardContent className="py-6">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2">Search Only</p>
                <p className="text-3xl font-extrabold text-foreground mb-1">Free</p>
                <p className="text-xs text-muted-foreground mb-6">No protection</p>
                <ul className="space-y-2.5 text-sm mb-6">
                  <li className="flex items-center gap-2 text-muted-foreground"><CheckCircle className="w-4 h-4 text-amber-500" />Check today's status</li>
                  <li className="flex items-center gap-2 text-muted-foreground/60"><Lock className="w-4 h-4 text-slate-300 dark:text-slate-600" /><span className="line-through">No alerts</span></li>
                  <li className="flex items-center gap-2 text-muted-foreground/60"><Lock className="w-4 h-4 text-slate-300 dark:text-slate-600" /><span className="line-through">No history</span></li>
                  <li className="flex items-center gap-2 text-muted-foreground/60"><Lock className="w-4 h-4 text-slate-300 dark:text-slate-600" /><span className="line-through">No monitoring</span></li>
                </ul>
                <Button variant="outline" disabled className="w-full opacity-60">Free Plan</Button>
              </CardContent>
            </Card>

            <Card className="border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/30 relative shadow-lg shadow-emerald-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2"><Badge className="bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider px-3 py-1 shadow-sm">Best Value</Badge></div>
              <CardContent className="py-6">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2">Starter</p>
                <div className="mb-1"><span className="text-3xl font-extrabold text-foreground">£24.99</span><span className="text-sm text-muted-foreground">/month</span></div>
                <p className="text-xs text-muted-foreground mb-6">£239.99/year (save 20%)</p>
                <ul className="space-y-2.5 text-sm mb-6">
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />Monitor 2 companies</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />Email + WhatsApp alerts</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />30-day history</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-emerald-500" />Same-day alerts (18:00 UTC)</li>
                </ul>
                <Link href="/pricing?plan=starter"><Button variant="brand" className="w-full py-5 text-base shadow-md"><Zap className="w-4 h-4 mr-2" />Get Same-Day Alerts</Button></Link>
              </CardContent>
            </Card>

            <Card className="border-slate-300 dark:border-slate-700">
              <CardContent className="py-6">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Pro</p>
                <div className="mb-1"><span className="text-3xl font-extrabold text-foreground">£49.99</span><span className="text-sm text-muted-foreground">/month</span></div>
                <p className="text-xs text-muted-foreground mb-6">£479.99/year (save 20%)</p>
                <ul className="space-y-2.5 text-sm mb-6">
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />Monitor 5 companies</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />Email + WhatsApp + SMS</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />90-day history</li>
                  <li className="flex items-center gap-2 text-foreground"><CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />Twice-daily alerts (07:00 & 19:00 UTC)</li>
                </ul>
                <Link href="/pricing?plan=pro"><Button variant="outline" className="w-full font-bold py-5 text-base">Get Pro Protection</Button></Link>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">Cancel anytime. 30-day money-back guarantee.</p>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-slate-50 dark:bg-slate-950/50">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-10">Common Questions</h2>
          <Accordion type="single" collapsible className="space-y-2">
            <AccordionItem value="q1" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">What if my company is revoked while I sleep?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">You wake up to our alert, not a rejection letter. You can immediately stop your visa application or find new employment before the Home Office processes your case.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">Is this legal and official?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">We monitor the official public register published by the UK Home Office. We are not affiliated with the Home Office, which is why we can alert you faster than their bureaucratic process.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">Can I just check myself for free?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">Yes, but you must remember to check every single night. Most people check once, forget, and find out too late. Our service is insurance against forgetfulness.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="q4" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">What is the difference between Starter and Pro?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">
                Starter (£24.99/mo) monitors 2 companies and sends Email + WhatsApp alerts by 18:00 UTC on the day a change is detected. Pro (£49.99/mo) monitors 5 companies, adds SMS, delivers alerts twice daily at 07:00 and 19:00 UTC, and includes 5 Certificate of Sponsorship checks per month. Both plans can be cancelled anytime.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q5" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">How exactly does monitoring work?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">
                Every night we download the full UK Home Office licensed sponsor register and compare it against the previous version. Any addition, removal, downgrade, or route change is recorded. Subscribed users with a matching company are alerted by their chosen channels within the delivery window for their plan.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q6" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">What happens if the register does not update one night?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">
                The Home Office occasionally skips a nightly publish (bank holidays, weekends). Our system detects this, skips the comparison for that night, and resumes automatically when the register is updated. You will not receive false alerts and will not miss any genuine changes.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q7" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">Is there a refund policy?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">
                Yes. We offer a 30-day money-back guarantee on all plans, no questions asked. If you are not satisfied within the first 30 days, contact us and we will issue a full refund. After 30 days you can cancel anytime; your plan stays active until the end of the billing period.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q8" className="border rounded-xl px-4 bg-white dark:bg-slate-900">
              <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">Can I monitor a company I do not yet work for?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-4">
                Yes. Many users monitor a prospective employer before accepting a job offer, or track a previous employer to follow up on a pending visa application. You can add any licensed UK sponsor to your watchlist.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      <section id="cos-verification" className="py-16 sm:py-20 bg-background border-t border-border/50 scroll-mt-20">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="editorial-caption text-primary block mb-4">Also Available</span>
            <h2 className="text-3xl sm:text-4xl editorial-subheading text-foreground mb-4">
              AI-Assisted Certificate of Sponsorship Authenticity Check
            </h2>
            <p className="text-base editorial-body text-muted-foreground">
              Received a Certificate of Sponsorship from a prospective employer? Upload the PDF to assess whether the document appears unaltered or has been modified. No personal data is retained at any stage.
            </p>
          </div>

          <CosSamplePreview />

          <div className="text-center">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button variant="brand" size="lg" className="px-8 py-3 shadow-lg shadow-emerald-500/20 transition-all duration-200" onClick={onStartVerification}>
                Verify a Document
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button variant="outline" size="lg" className="rounded-full px-6 py-3 font-semibold transition-all duration-200" onClick={() => setShowDemo(true)}>
                <Play className="mr-2 w-4 h-4" />Watch Demo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              CheckByAI is an independent verification service and is not affiliated with the UK Home Office or UKVI.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="cos-features-heading" className="py-16 sm:py-20 bg-muted/40 border-t border-border/50">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 id="cos-features-heading" className="text-2xl sm:text-3xl editorial-subheading text-foreground mb-4">
              Built for compliance and privacy
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard icon={<ShieldMonitorIcon size={30} />} title="Home Office Compliance" description="Our tool cross-references your Certificate of Sponsorship against known Home Office document structure and formatting standards. Results are indicative only and do not constitute legal verification." index={0} />
            <FeatureCard icon={<DocumentVerifyIcon size={30} />} title="Instant Assessment" description="Receive an automated assessment within seconds of upload. The system evaluates document structure, formatting consistency, and file integrity against Home Office-issued templates." index={1} />
            <FeatureCard icon={<UKLockIcon size={30} />} title="UK Data Protection" description="Operates in full compliance with UK GDPR. No personal data is extracted, stored, or processed. Uploaded files are permanently deleted immediately upon completion of analysis." index={2} />
          </div>
        </div>
      </section>

      <RecentlyRevokedSection />

      <section className="bg-slate-950 text-white py-16">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Stay Ahead of Sponsor Licence Changes</h2>
          <p className="text-slate-300 mb-8 max-w-lg mx-auto">Get automated alerts the moment a sponsor licence changes status, before it affects your visa, your career, or your future in the UK.</p>
          <Link href="/pricing">
            <Button variant="brand" size="lg" className="text-base px-10 py-6 shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-5 h-5 mr-2" />Start Monitoring Now
            </Button>
          </Link>
          <p className="text-xs text-slate-500 mt-4">Free to start. Cancel anytime.</p>
        </div>
      </section>

      <Footer />
    </div>
    </>
  )
}
