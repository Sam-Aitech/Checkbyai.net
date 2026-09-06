import { useState, useCallback, useRef, memo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "wouter";
import {
  Search, Building2, MapPin, Route, Star, CheckCircle, Zap, XCircle,
  Clock, AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Shield,
  Loader2, RefreshCw, Download,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import SponsorStatusBadge from "@/components/SponsorStatusBadge";
import { useDebounce } from "@/hooks/useDebounce";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DirectoryResult {
  id: number;
  fingerprint: string;
  organisationName: string;
  townCity: string | null;
  county: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
  grantedAt: string | null;
  removedAt: string | null;
  firstSeen: string | null;
}

interface DirectoryStats {
  active: number;
  newlyGranted: number;
  removedThisWeek: number;
  gracePeriod: number;
}

interface DirectoryResponse {
  results: DirectoryResult[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  stats: DirectoryStats;
}

// ── Row highlight ─────────────────────────────────────────────────────────────

function rowClass(status: string) {
  if (status === "NEWLY_GRANTED")   return "border-l-2 border-l-orange-400 bg-orange-50/40 dark:bg-orange-950/10";
  if (status === "REMOVED_REVOKED" || status === "NOT_LISTED") return "border-l-2 border-l-red-400    bg-red-50/30    dark:bg-red-950/10 opacity-75";
  if (status === "GRACE_PERIOD")    return "border-l-2 border-l-yellow-400 bg-yellow-50/30 dark:bg-yellow-950/10";
  return "";
}

// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard = memo(function StatCard({
  label, value, color, icon: Icon,
}: { label: string; value: number | undefined; color: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={`rounded-xl border bg-white dark:bg-slate-900 p-4 flex items-center gap-3 shadow-sm ${color}`}>
      <div className="rounded-lg p-2 bg-current/10">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold tabular-nums leading-none">
          {value !== undefined ? value.toLocaleString() : <span className="inline-block w-16 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
});

// ── Status filter tabs ────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: "",                 label: "All"            },
  { value: "ACTIVE",          label: "Active"         },
  { value: "NEWLY_GRANTED",   label: "Newly Granted"  },
  { value: "REMOVED_REVOKED", label: "Removed"        },
  { value: "GRACE_PERIOD",    label: "Under Review"   },
];

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <nav className="flex items-center justify-center gap-1 mt-6" aria-label="Pagination">
      <Button
        variant="outline" size="sm" disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
        data-compact-target
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-sm">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(p as number)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            data-compact-target
            className="h-8 w-8 p-0 text-xs"
          >
            {p}
          </Button>
        )
      )}
      <Button
        variant="outline" size="sm" disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
        data-compact-target
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </nav>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function SponsorDirectory() {
  const [nameInput, setNameInput]   = useState("");
  const [statusFilter, setStatus]   = useState("");
  const [townInput, setTownInput]   = useState("");
  const [routeInput, setRouteInput] = useState("");
  const [letterFilter, setLetter]   = useState("");
  const [page, setPage]             = useState(1);

  const name  = useDebounce(nameInput,  400);
  const town  = useDebounce(townInput,  400);
  const route = useDebounce(routeInput, 400);

  const resetPage = useCallback(() => setPage(1), []);

  const buildQuery = () => {
    const p = new URLSearchParams();
    if (name)         p.set("name",   name);
    if (statusFilter) p.set("status", statusFilter);
    if (town)         p.set("town",   town);
    if (route)        p.set("route",  route);
    if (letterFilter) p.set("letter", letterFilter);
    p.set("page",  String(page));
    p.set("limit", "50");
    return p.toString();
  };

  const { data, isLoading, isFetching, isError, refetch } = useQuery<DirectoryResponse>({
    queryKey: ["/api/sponsors/directory", name, statusFilter, town, route, letterFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/sponsors/directory?${buildQuery()}`);
      if (!res.ok) throw new Error("Failed to load directory");
      return res.json();
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    select: (res: any) => (res?.data ?? res) as DirectoryResponse,
  });

  const handleStatusChange = (value: string) => { setStatus(value);     resetPage(); };
  const handleNameChange  = (v: string)      => { setNameInput(v);     setLetter(""); resetPage(); };
  const handleTownChange  = (v: string)      => { setTownInput(v);     resetPage(); };
  const handleRouteChange = (v: string)      => { setRouteInput(v);    resetPage(); };
  const handleLetterClick = (l: string)      => {
    setLetter(l === letterFilter ? "" : l);
    setNameInput("");
    resetPage();
  };

  const stats = data?.stats;
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: data?.results.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  return (
    <PageLayout>
      <SEOHead
        title="UK Licensed Sponsor Register — Browse 80,000+ Employers | CheckByAI"
        description="Search and browse the full UK Home Office Register of Licensed Sponsors. Filter by status: Active, Newly Granted, Removed. Updated daily from official gov.uk data."
        canonicalUrl="https://checkbyai.net/sponsors"
      />

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">UK Licensed Sponsor Register</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Official Home Office data · Updated daily ·{" "}
              <a
                href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Source: gov.uk <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a href="/api/sponsors/export.csv" download>
              <Button variant="outline" size="sm" className="shrink-0">
                <Download className="w-4 h-4 mr-1.5" />
                Download CSV
              </Button>
            </a>
            <Link href="/sponsor-monitor">
              <Button variant="default" size="sm" className="shrink-0">
                <Zap className="w-4 h-4 mr-1.5" />
                Monitor a Sponsor
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Active Sponsors"
            value={stats?.active}
            color="text-emerald-700 dark:text-emerald-400"
            icon={CheckCircle}
          />
          <StatCard
            label="Newly Granted"
            value={stats?.newlyGranted}
            color="text-orange-700 dark:text-orange-400"
            icon={Zap}
          />
          <StatCard
            label="Removed (7 days)"
            value={stats?.removedThisWeek}
            color="text-red-600 dark:text-red-400"
            icon={XCircle}
          />
          <StatCard
            label="Under Review"
            value={stats?.gracePeriod}
            color="text-amber-700 dark:text-amber-400"
            icon={Clock}
          />
        </div>

        {/* ── Filters ── */}
        <div className="bg-white dark:bg-slate-900 border rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Label htmlFor="directory-name-filter" className="sr-only">Search company name</Label>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="directory-name-filter"
                placeholder="Search company name..."
                value={nameInput}
                onChange={(e) => handleNameChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative w-full sm:w-44">
              <Label htmlFor="directory-town-filter" className="sr-only">Filter by town or city</Label>
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="directory-town-filter"
                placeholder="Town / City..."
                value={townInput}
                onChange={(e) => handleTownChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative w-full sm:w-52">
              <Label htmlFor="directory-route-filter" className="sr-only">Filter by immigration route</Label>
              <Route className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="directory-route-filter"
                placeholder="Route (e.g. Skilled Worker)..."
                value={routeInput}
                onChange={(e) => handleRouteChange(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Status tabs */}
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleStatusChange(tab.value)}
                aria-pressed={statusFilter === tab.value}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  statusFilter === tab.value
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
                    : "bg-transparent text-muted-foreground border-input hover:border-slate-400"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* A–Z quick filter */}
          <div className="border-t pt-3">
            <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter by first letter">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">A–Z</span>
              {ALPHABET.map((l) => (
                <button
                  key={l}
                  data-compact-target
                  onClick={() => handleLetterClick(l)}
                  aria-pressed={letterFilter === l}
                  aria-label={`Filter by organisations starting with ${l}`}
                  className={`w-7 h-7 rounded text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    letterFilter === l
                      ? "bg-primary text-white border-primary"
                      : "bg-transparent text-muted-foreground border-input hover:border-primary hover:text-primary"
                  }`}
                >
                  {l}
                </button>
              ))}
              {letterFilter && (
                <button
                  data-compact-target
                  onClick={() => handleLetterClick("")}
                  className="ml-1 px-2 h-7 rounded text-xs font-medium text-muted-foreground border border-input hover:border-destructive hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Results count + spinner ── */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {isLoading ? (
            <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</span>
          ) : isError ? (
            <span className="text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Failed to load — please refresh
            </span>
          ) : data ? (
            <span>
              Showing{" "}
              <span className="font-semibold text-foreground">
                {((data.page - 1) * data.limit + 1).toLocaleString()}–
                {Math.min(data.page * data.limit, data.total).toLocaleString()}
              </span>{" "}
              of <span className="font-semibold text-foreground">{data.total.toLocaleString()}</span> sponsors
            </span>
          ) : null}
          {isFetching && !isLoading && (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* ── Table ── */}
        <div className="border rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_auto_auto] gap-4 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Organisation</span>
            <span>Town / City</span>
            <span>Type & Rating</span>
            <span>Route</span>
            <span>Date</span>
            <span>Status</span>
          </div>

          {/* Skeleton rows */}
          {isLoading && (
            <div className="divide-y">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center">
              <AlertTriangle className="w-8 h-8 mb-3 text-destructive" />
              <p className="font-medium text-foreground">Could not load the register.</p>
              <p className="text-sm mt-1 mb-4">Please try refreshing the page or try again below.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && data?.results.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No sponsors match your filters.</p>
              <p className="text-sm mt-1">Try broadening your search terms.</p>
            </div>
          )}

          {/* Virtualized data rows — 60 FPS for 50-row pages, scales to 100 */}
          {!isLoading && data && data.results.length > 0 && (
            <div ref={parentRef} className="max-h-[640px] overflow-auto divide-y">
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const r = data.results[virtualRow.index];
                  const slug = r.organisationName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
                  const detailHref = r.id ? `/sponsor/${r.id}/${slug}` : null;
                  const dateLabel = r.status === "REMOVED_REVOKED" && r.removedAt
                    ? new Date(r.removedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })
                    : r.grantedAt
                    ? new Date(r.grantedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })
                    : "—";
                  return (
                  <div
                    key={r.fingerprint}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                    className={`px-4 py-3 ${rowClass(r.status)} transition-colors hover:bg-muted/20 border-b`}
                  >
                    <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_auto_auto] gap-4 items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        {detailHref ? (
                          <Link href={detailHref} className="font-medium text-foreground text-sm truncate hover:text-primary hover:underline" title={r.organisationName}>{r.organisationName}</Link>
                        ) : (
                          <span className="font-medium text-foreground text-sm truncate" title={r.organisationName}>{r.organisationName}</span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground truncate">{r.townCity ?? "—"}</span>
                      <span className="text-sm text-muted-foreground truncate">{r.typeRating ?? "—"}</span>
                      <span className="text-sm text-muted-foreground truncate">{r.route ?? "—"}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                        {dateLabel}
                      </span>
                      <SponsorStatusBadge status={r.status} typeRating={r.typeRating} />
                    </div>
                    <div className="md:hidden space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          {detailHref ? (
                            <Link href={detailHref} className="font-semibold text-sm text-foreground leading-tight hover:text-primary hover:underline">{r.organisationName}</Link>
                          ) : (
                            <span className="font-semibold text-sm text-foreground leading-tight">{r.organisationName}</span>
                          )}
                        </div>
                        <SponsorStatusBadge status={r.status} typeRating={r.typeRating} />
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground pl-5">
                        {r.townCity && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.townCity}</span>}
                        {r.typeRating && <span className="flex items-center gap-1"><Star className="w-3 h-3" />{r.typeRating}</span>}
                        {r.route && <span className="flex items-center gap-1"><Route className="w-3 h-3" />{r.route}</span>}
                        <span className="flex items-center gap-1 tabular-nums">{dateLabel}</span>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {data && data.totalPages > 1 && (
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        )}

        {/* ── Footer CTA ── */}
        <div className="bg-slate-50 dark:bg-slate-900/50 border rounded-xl p-6 text-center space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Get instant alerts when any sponsor's licence changes
          </p>
          <p className="text-xs text-muted-foreground">
            Revocations, downgrades, and new grants — delivered to your email, WhatsApp, or SMS.
          </p>
          <Link href="/sponsor-monitor">
            <Button size="sm" className="mt-2">
              <Zap className="w-4 h-4 mr-1.5" />
              Set Up Sponsor Alerts
            </Button>
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
