/**
 * CompanyIntelligencePanel
 * ========================
 * Pro-only overlay that surfaces enriched Companies House data and
 * historical licence timeline for a single sponsor fingerprint.
 *
 * Triggered from the MonitorTab watchlist cards in ProDashboard.
 *
 * Tabs:
 *   "Company Health"   — GET /api/sponsors/:fp/company-health
 *   "Licence Timeline" — GET /api/sponsors/:fp/licence-timeline
 *
 * Auto-triggers POST /api/sponsors/:fp/enrich on first open when
 * the enrichment record does not exist yet.
 */

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  MapPin,
  Briefcase,
  Hash,
  AlertTriangle,
  Clock,
  Loader2,
  Info,
  ExternalLink,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { unwrapApiEnvelope } from "@/lib/apiEnvelope";

// ─── Design tokens (mirrors ProDashboard's T object) ─────────────────────────
const T = {
  card:    "var(--card)",
  border:  "var(--border)",
  text:    "var(--foreground)",
  muted:   "var(--muted-foreground)",
  violet:  "var(--primary)",
  emerald: "var(--status-success)",
  amber:   "var(--status-warning)",
  red:     "var(--status-danger)",
} as const;

const card: CSSProperties = {
  background:   "var(--card)",
  border:       "1px solid var(--border)",
  borderRadius: 12,
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface EnrichmentRecord {
  fingerprint:           string;
  companyNumber:         string | null;
  natureOfBusiness:      string | null;
  registeredAddress:     string | null;
  websiteUrl:            string | null;
  scrapedAt:             string | null;
  scrapeStatus:          string;
  companyStatus:         string | null;
  companyType:           string | null;
  incorporationDate:     string | null;
  sicCodes:              string[] | null;
  lastFiledAccountsDate: string | null;
  nextConfStmtDueDate:   string | null;
  dissolvedAt:           string | null;
  companiesHouseSource:  boolean | null;
  fuzzyMatchScore:       string | null;
  historicalNamesRaw:    string[] | null;
}

interface CompanyHealthResponse {
  enrichment: EnrichmentRecord | null;
  status:     string;   // "not_enriched" | "scraped" | "enriched" | "failed" | ...
  stale:      boolean;
}

interface TimelineEntry {
  id:               number;
  fingerprint:      string;
  recordedDate:     string;
  licenceStatus:    string;
  route:            string | null;
  typeRating:       string | null;
  organisationName: string | null;
  source:           string;   // "home-office-csv" | "lsuk-scrape"
  scrapedAt:        string | null;
}

interface LicenceTimelineResponse {
  timeline: TimelineEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Theme-aware status pill classes (AA in both themes). */
function licenceStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "active")      return "st-soft st-soft-success";
  if (s === "revoked")     return "st-soft st-soft-danger";
  if (s === "suspended")   return "st-soft st-soft-warning";
  if (s === "surrendered") return "st-soft st-soft-warning";
  return                          "st-soft st-soft-neutral";
}

function companyStatusColor(status: string | null): string {
  if (!status) return T.muted;
  const s = status.toLowerCase();
  if (s === "active")                          return T.emerald;
  if (s === "dissolved" || s === "liquidation") return T.red;
  return T.amber;
}

function fuzzyScoreColor(score: string | null): string {
  if (!score) return T.muted;
  const n = parseFloat(score);
  if (n >= 0.92) return T.emerald;
  if (n >= 0.85) return T.amber;
  return T.red;
}

// ─── Company Health Panel ─────────────────────────────────────────────────────
function CompanyHealthPanel({ fingerprint }: { fingerprint: string }) {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<CompanyHealthResponse>({
    queryKey: ["/api/sponsors", fingerprint, "company-health"],
    queryFn: async () => {
      const r = await fetch(`/api/sponsors/${encodeURIComponent(fingerprint)}/company-health`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch company health");
      return unwrapApiEnvelope<CompanyHealthResponse>(await r.json());
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const enrichM = useMutation({
    mutationFn: () => apiRequest("POST", `/api/sponsors/${encodeURIComponent(fingerprint)}/enrich`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sponsors", fingerprint, "company-health"] });
      qc.invalidateQueries({ queryKey: ["/api/sponsors", fingerprint, "licence-timeline"] });
    },
  });

  // Auto-trigger enrichment once when status is not_enriched
  const hasAutoTriggered = useRef(false);
  useEffect(() => {
    if (data?.status === "not_enriched" && !hasAutoTriggered.current) {
      hasAutoTriggered.current = true;
      enrichM.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status]);

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash-card p-8 text-center">
        <AlertTriangle style={{ width: 24, height: 24, color: "var(--status-warning)", margin: "0 auto 8px" }} aria-hidden="true" />
        <p className="dash-body">Failed to load company health data.</p>
      </div>
    );
  }

  // Enrichment in flight
  if (data?.status === "not_enriched" || enrichM.isPending) {
    return (
      <div className="dash-card p-10 text-center" role="status">
        <Loader2 style={{ width: 28, height: 28, color: "var(--primary)", margin: "0 auto 12px" }} className="animate-spin" aria-hidden="true" />
        <p className="text-sm font-bold text-foreground mb-1">Analysing Company…</p>
        <p className="dash-body">
          Fetching Companies House data. Results appear after the next hourly batch (at :15 past the hour).
        </p>
      </div>
    );
  }

  const e = data?.enrichment;

  // No record and enrichment isn't pending — offer manual trigger
  if (!e) {
    return (
      <div className="dash-card p-8 text-center">
        <Info style={{ width: 24, height: 24, color: "var(--muted-foreground)", margin: "0 auto 8px" }} aria-hidden="true" />
        <p className="dash-body mb-3">No company data available yet.</p>
        <button
          onClick={() => enrichM.mutate()}
          disabled={enrichM.isPending}
          className="dash-btn-primary" style={{ padding: "7px 16px", fontSize: 13 }}
        >
          {enrichM.isPending ? "Requesting…" : "Request Analysis"}
        </button>
      </div>
    );
  }

  const sicCodes        = Array.isArray(e.sicCodes)         ? e.sicCodes         : [];
  const historicalNames = Array.isArray(e.historicalNamesRaw) ? e.historicalNamesRaw : [];
  const score           = e.fuzzyMatchScore ? parseFloat(e.fuzzyMatchScore) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Stale data warning */}
      {data.stale && (
        <div className="flex items-center gap-2 rounded-lg border px-3.5 py-2" style={{ background: "var(--status-warning-bg)", borderColor: "color-mix(in srgb, var(--status-warning) 25%, transparent)" }}>
          <AlertTriangle style={{ width: 13, height: 13, color: "var(--status-warning)", flexShrink: 0 }} aria-hidden="true" />
          <span className="dash-meta" style={{ color: "var(--status-warning)" }}>
            Data is over 7 days old — re-enrichment runs automatically on the next hourly batch.
          </span>
        </div>
      )}

      {/* Primary 2-col grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Company Status */}
        <div className="dash-card px-3.5 py-3">
          <p className="dash-label mb-1">Company Status</p>
          <p className="text-base font-bold" style={{ color: companyStatusColor(e.companyStatus) }}>
            {e.companyStatus
              ? e.companyStatus.charAt(0).toUpperCase() + e.companyStatus.slice(1)
              : "Unknown"}
          </p>
        </div>

        {/* Match Confidence */}
        <div className="dash-card px-3.5 py-3">
          <p className="dash-label mb-1">CH Match Confidence</p>
          <div className="flex items-center gap-1.5">
            <p className="text-base font-bold" style={{ color: fuzzyScoreColor(e.fuzzyMatchScore) }}>
              {score !== null ? `${Math.round(score * 100)}%` : "—"}
            </p>
            {e.companiesHouseSource && (
              <span className="dash-label" style={{ color: "var(--status-success)" }}>Official API</span>
            )}
          </div>
        </div>

        {/* Company Type */}
        <div className="dash-card px-3.5 py-3">
          <p className="dash-label mb-1">Company Type</p>
          <p className="text-sm font-semibold text-foreground">
            {e.companyType
              ? e.companyType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
              : "—"}
          </p>
        </div>

        {/* Incorporation Date */}
        <div className="dash-card px-3.5 py-3">
          <p className="dash-label mb-1">Incorporated</p>
          <p className="text-sm font-semibold text-foreground">{fmtDate(e.incorporationDate)}</p>
        </div>
      </div>

      {/* Filing dates */}
      {(e.lastFiledAccountsDate || e.nextConfStmtDueDate) && (
        <div className="grid grid-cols-2 gap-3">
          {e.lastFiledAccountsDate && (
            <div className="dash-card px-3.5 py-3">
              <p className="dash-label mb-1">Last Accounts Filed</p>
              <p className="text-sm font-semibold text-foreground">{fmtDate(e.lastFiledAccountsDate)}</p>
            </div>
          )}
          {e.nextConfStmtDueDate && (
            <div className="dash-card px-3.5 py-3">
              <p className="dash-label mb-1">Conf. Statement Due</p>
              <p className="text-sm font-semibold text-foreground">{fmtDate(e.nextConfStmtDueDate)}</p>
            </div>
          )}
        </div>
      )}

      {/* Registered Address */}
      {e.registeredAddress && (
        <div className="dash-card px-3.5 py-3 flex gap-2.5 items-start">
          <MapPin style={{ width: 14, height: 14, color: T.muted, flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="dash-label mb-1">Registered Address</p>
            <p className="text-sm text-foreground">{e.registeredAddress}</p>
          </div>
        </div>
      )}

      {/* Nature of Business */}
      {e.natureOfBusiness && (
        <div className="dash-card px-3.5 py-3 flex gap-2.5 items-start">
          <Briefcase style={{ width: 14, height: 14, color: T.muted, flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="dash-label mb-1">Nature of Business</p>
            <p className="text-sm text-foreground">{e.natureOfBusiness}</p>
          </div>
        </div>
      )}

      {/* SIC Codes */}
      {sicCodes.length > 0 && (
        <div className="dash-card px-3.5 py-3">
          <p className="dash-label mb-2">SIC Codes</p>
          <div className="flex flex-wrap gap-1.5">
            {sicCodes.map((code) => (
              <span
                key={code}
                className="dash-chip" style={{ color: "var(--primary)", borderColor: "color-mix(in srgb, var(--primary) 22%, transparent)", background: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Historical Names */}
      {historicalNames.length > 0 && (
        <div className="dash-card px-3.5 py-3">
          <p className="dash-label mb-2">Previous Names</p>
          <div className="flex flex-col gap-1">
            {historicalNames.map((name, i) => (
              <p key={i} className="dash-meta">{name}</p>
            ))}
          </div>
        </div>
      )}

      {/* CH number + link */}
      {e.companyNumber && (
        <div className="flex items-center gap-2.5">
          <Hash style={{ width: 12, height: 12, color: "var(--muted-foreground)" }} aria-hidden="true" />
          <span className="dash-meta">Companies House: {e.companyNumber}</span>
          <a
            href={`https://find-and-update.company-information.service.gov.uk/company/${e.companyNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary no-underline hover:underline"
          >
            View <ExternalLink style={{ width: 10, height: 10 }} aria-hidden="true" />
          </a>
        </div>
      )}

      {/* Data age footer */}
      {e.scrapedAt && (
        <p className="dash-meta">
          Data fetched {fmtDate(e.scrapedAt)}
          {e.companiesHouseSource ? " · Companies House Official API" : " · Web scrape"}
        </p>
      )}
    </div>
  );
}

// ─── Licence Timeline Panel ───────────────────────────────────────────────────
function LicenceTimelinePanel({ fingerprint }: { fingerprint: string }) {
  const { data, isLoading, error } = useQuery<LicenceTimelineResponse>({
    queryKey: ["/api/sponsors", fingerprint, "licence-timeline"],
    queryFn: async () => {
      const r = await fetch(`/api/sponsors/${encodeURIComponent(fingerprint)}/licence-timeline`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch licence timeline");
      return unwrapApiEnvelope<LicenceTimelineResponse>(await r.json());
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading licence timeline">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash-card p-8 text-center" role="alert">
        <AlertTriangle style={{ width: 24, height: 24, color: "var(--status-warning)", margin: "0 auto 8px" }} aria-hidden="true" />
        <p className="dash-body">Failed to load licence timeline.</p>
      </div>
    );
  }

  const timeline = data?.timeline ?? [];

  if (timeline.length === 0) {
    return (
      <div className="dash-card p-10 text-center">
        <Clock style={{ width: 28, height: 28, color: "var(--muted-foreground)", margin: "0 auto 12px" }} aria-hidden="true" />
        <p className="text-sm font-bold text-foreground mb-1">No historical records yet</p>
        <p className="dash-body">
          Timeline data appears after the next enrichment batch (daily at 02:00 UTC).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="dash-meta mb-1">
        {timeline.length} historical record{timeline.length !== 1 ? "s" : ""}
      </p>
      {timeline.map((entry, idx) => {
        const statusClass = licenceStatusClass(entry.licenceStatus);
        const s = entry.licenceStatus.toLowerCase();
        const accent = s === "active" ? "var(--status-success)"
          : s === "revoked" ? "var(--status-danger)"
          : (s === "suspended" || s === "surrendered") ? "var(--status-warning)"
          : "var(--text-secondary)";
        const isStatusChange = idx === 0 || timeline[idx - 1].licenceStatus !== entry.licenceStatus;
        return (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(idx * 0.02, 0.3), type: "spring", stiffness: 120, damping: 16 }}
            className="dash-card flex items-center gap-3 px-3.5 py-2"
            style={isStatusChange ? { boxShadow: `0 0 0 1px ${accent}` } : undefined}
          >
            {/* Status pill */}
            <span className={`${statusClass} shrink-0 min-w-[70px] justify-center`}>
              {entry.licenceStatus}
            </span>

            {/* Route / typeRating / name */}
            <div className="flex-1 min-w-0">
              <div className="flex gap-1.5 flex-wrap">
                {entry.route    && <span className="dash-meta">{entry.route}</span>}
                {entry.typeRating && <span className="dash-meta">· {entry.typeRating}</span>}
              </div>
              {entry.organisationName && (
                <p className="dash-meta truncate">
                  {entry.organisationName}
                </p>
              )}
            </div>

            {/* Date + source */}
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{fmtDate(entry.recordedDate)}</p>
              <p style={{ fontSize: 10, color: T.muted }}>
                {entry.source === "home-office-csv" ? "Home Office" : "LSUK"}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main Dialog export ───────────────────────────────────────────────────────
type IntelTab = "health" | "timeline";

export interface CompanyIntelligenceDialogProps {
  fingerprint:  string | null;
  companyName:  string;
  onClose:      () => void;
}

export function CompanyIntelligenceDialog({
  fingerprint,
  companyName,
  onClose,
}: CompanyIntelligenceDialogProps) {
  const [tab, setTab] = useState<IntelTab>("health");

  const tabBtnStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: "7px 14px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--primary)" : "transparent",
    color:      active ? "var(--primary-foreground)" : "var(--muted-foreground)",
    transition: "background-color 150ms cubic-bezier(0.16,1,0.3,1), color 150ms cubic-bezier(0.16,1,0.3,1)",
  });

  return (
    <Dialog open={!!fingerprint} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[560px] max-h-[85vh] flex flex-col overflow-hidden p-0">
        {/* ── Header ── */}
        <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div style={{ background: "linear-gradient(135deg, var(--primary), var(--status-info))", borderRadius: 8, padding: 7, flexShrink: 0 }} aria-hidden="true">
              <Building2 style={{ width: 14, height: 14, color: "white" }} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-extrabold leading-tight">
                {companyName}
              </DialogTitle>
              <p className="dash-meta">Company Intelligence</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div
            className="flex gap-1 rounded-lg bg-secondary p-1 mt-2.5 mb-1"
          >
            <button style={tabBtnStyle(tab === "health")}   onClick={() => setTab("health")}>Company Health</button>
            <button style={tabBtnStyle(tab === "timeline")} onClick={() => setTab("timeline")}>Licence Timeline</button>
          </div>
        </DialogHeader>

        {/* ── Scrollable panel content ── */}
        <div className="flex-1 overflow-y-auto px-5 pt-3.5 pb-5">
          {fingerprint && (
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: "spring", stiffness: 140, damping: 18 }}
              >
                {tab === "health"
                  ? <CompanyHealthPanel    fingerprint={fingerprint} />
                  : <LicenceTimelinePanel fingerprint={fingerprint} />
                }
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
