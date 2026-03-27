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

// ─── Design tokens (mirrors ProDashboard's T object) ─────────────────────────
const T = {
  card:    "var(--card)",
  border:  "var(--border)",
  text:    "var(--foreground)",
  muted:   "var(--muted-foreground)",
  violet:  "var(--primary)",
  emerald: "#10B981",
  amber:   "#F59E0B",
  red:     "#EF4444",
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

function licenceStatusStyle(status: string): CSSProperties {
  const s = status.toLowerCase();
  if (s === "active")     return { background: "rgba(16,185,129,0.12)",  color: "#6EE7B7",  border: "1px solid rgba(16,185,129,0.25)"  };
  if (s === "revoked")    return { background: "rgba(239,68,68,0.12)",   color: "#FCA5A5",  border: "1px solid rgba(239,68,68,0.25)"   };
  if (s === "suspended")  return { background: "rgba(245,158,11,0.12)",  color: "#FCD34D",  border: "1px solid rgba(245,158,11,0.25)"  };
  if (s === "surrendered")return { background: "rgba(249,115,22,0.12)",  color: "#FDBA74",  border: "1px solid rgba(249,115,22,0.25)"  };
  return                         { background: "rgba(100,116,139,0.12)", color: "#94A3B8",  border: "1px solid rgba(100,116,139,0.25)" };
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
      return r.json();
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
      <div style={{ ...card, padding: 32, textAlign: "center" }}>
        <AlertTriangle style={{ width: 24, height: 24, color: T.amber, margin: "0 auto 8px" }} />
        <p style={{ color: T.muted, fontSize: 13 }}>Failed to load company health data.</p>
      </div>
    );
  }

  // Enrichment in flight
  if (data?.status === "not_enriched" || enrichM.isPending) {
    return (
      <div style={{ ...card, padding: 40, textAlign: "center" }}>
        <Loader2 style={{ width: 28, height: 28, color: T.violet, margin: "0 auto 12px" }} className="animate-spin" />
        <p style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Analysing Company…</p>
        <p style={{ fontSize: 13, color: T.muted }}>
          Fetching Companies House data. Results appear after the next hourly batch (at :15 past the hour).
        </p>
      </div>
    );
  }

  const e = data?.enrichment;

  // No record and enrichment isn't pending — offer manual trigger
  if (!e) {
    return (
      <div style={{ ...card, padding: 32, textAlign: "center" }}>
        <Info style={{ width: 24, height: 24, color: T.muted, margin: "0 auto 8px" }} />
        <p style={{ color: T.muted, fontSize: 13, marginBottom: 12 }}>No company data available yet.</p>
        <button
          onClick={() => enrichM.mutate()}
          disabled={enrichM.isPending}
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Stale data warning */}
      {data.stale && (
        <div style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle style={{ width: 13, height: 13, color: T.amber, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: T.amber }}>
            Data is over 7 days old — re-enrichment runs automatically on the next hourly batch.
          </span>
        </div>
      )}

      {/* Primary 2-col grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Company Status */}
        <div style={{ ...card, padding: "12px 14px" }}>
          <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>Company Status</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: companyStatusColor(e.companyStatus) }}>
            {e.companyStatus
              ? e.companyStatus.charAt(0).toUpperCase() + e.companyStatus.slice(1)
              : "Unknown"}
          </p>
        </div>

        {/* Match Confidence */}
        <div style={{ ...card, padding: "12px 14px" }}>
          <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>CH Match Confidence</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: fuzzyScoreColor(e.fuzzyMatchScore) }}>
              {score !== null ? `${Math.round(score * 100)}%` : "—"}
            </p>
            {e.companiesHouseSource && (
              <span style={{ fontSize: 10, color: T.emerald, fontWeight: 600 }}>Official API</span>
            )}
          </div>
        </div>

        {/* Company Type */}
        <div style={{ ...card, padding: "12px 14px" }}>
          <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>Company Type</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
            {e.companyType
              ? e.companyType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
              : "—"}
          </p>
        </div>

        {/* Incorporation Date */}
        <div style={{ ...card, padding: "12px 14px" }}>
          <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>Incorporated</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{fmtDate(e.incorporationDate)}</p>
        </div>
      </div>

      {/* Filing dates */}
      {(e.lastFiledAccountsDate || e.nextConfStmtDueDate) && (
        <div className="grid grid-cols-2 gap-3">
          {e.lastFiledAccountsDate && (
            <div style={{ ...card, padding: "12px 14px" }}>
              <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>Last Accounts Filed</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{fmtDate(e.lastFiledAccountsDate)}</p>
            </div>
          )}
          {e.nextConfStmtDueDate && (
            <div style={{ ...card, padding: "12px 14px" }}>
              <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 4 }}>Conf. Statement Due</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{fmtDate(e.nextConfStmtDueDate)}</p>
            </div>
          )}
        </div>
      )}

      {/* Registered Address */}
      {e.registeredAddress && (
        <div style={{ ...card, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <MapPin style={{ width: 14, height: 14, color: T.muted, flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 3 }}>Registered Address</p>
            <p style={{ fontSize: 13, color: T.text }}>{e.registeredAddress}</p>
          </div>
        </div>
      )}

      {/* Nature of Business */}
      {e.natureOfBusiness && (
        <div style={{ ...card, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Briefcase style={{ width: 14, height: 14, color: T.muted, flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 3 }}>Nature of Business</p>
            <p style={{ fontSize: 13, color: T.text }}>{e.natureOfBusiness}</p>
          </div>
        </div>
      )}

      {/* SIC Codes */}
      {sicCodes.length > 0 && (
        <div style={{ ...card, padding: "12px 14px" }}>
          <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 8 }}>SIC Codes</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sicCodes.map((code) => (
              <span
                key={code}
                style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 22%, transparent)", color: "var(--primary)", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99 }}
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Historical Names */}
      {historicalNames.length > 0 && (
        <div style={{ ...card, padding: "12px 14px" }}>
          <p style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 8 }}>Previous Names</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {historicalNames.map((name, i) => (
              <p key={i} style={{ fontSize: 13, color: T.muted }}>{name}</p>
            ))}
          </div>
        </div>
      )}

      {/* CH number + link */}
      {e.companyNumber && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Hash style={{ width: 12, height: 12, color: T.muted }} />
          <span style={{ fontSize: 12, color: T.muted }}>Companies House: {e.companyNumber}</span>
          <a
            href={`https://find-and-update.company-information.service.gov.uk/company/${e.companyNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--primary)", textDecoration: "none" }}
          >
            View <ExternalLink style={{ width: 10, height: 10 }} />
          </a>
        </div>
      )}

      {/* Data age footer */}
      {e.scrapedAt && (
        <p style={{ fontSize: 11, color: T.muted }}>
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
      return r.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...card, padding: 32, textAlign: "center" }}>
        <AlertTriangle style={{ width: 24, height: 24, color: T.amber, margin: "0 auto 8px" }} />
        <p style={{ color: T.muted, fontSize: 13 }}>Failed to load licence timeline.</p>
      </div>
    );
  }

  const timeline = data?.timeline ?? [];

  if (timeline.length === 0) {
    return (
      <div style={{ ...card, padding: 40, textAlign: "center" }}>
        <Clock style={{ width: 28, height: 28, color: T.muted, margin: "0 auto 12px" }} />
        <p style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>No historical records yet</p>
        <p style={{ fontSize: 13, color: T.muted }}>
          Timeline data appears after the next enrichment batch (daily at 02:00 UTC).
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
        {timeline.length} historical record{timeline.length !== 1 ? "s" : ""}
      </p>
      {timeline.map((entry, idx) => {
        const statusStyle = licenceStatusStyle(entry.licenceStatus);
        const isStatusChange = idx === 0 || timeline[idx - 1].licenceStatus !== entry.licenceStatus;
        return (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(idx * 0.02, 0.3), type: "spring", stiffness: 120, damping: 16 }}
            style={{
              ...card,
              padding: "9px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              // Highlight rows where the status changed
              ...(isStatusChange ? { boxShadow: `0 0 0 1px ${String(statusStyle.border ?? "").replace("1px solid ", "")}` } : {}),
            }}
          >
            {/* Status pill */}
            <span
              style={{
                ...statusStyle,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "2px 8px",
                borderRadius: 99,
                textTransform: "uppercase",
                flexShrink: 0,
                minWidth: 70,
                textAlign: "center",
              }}
            >
              {entry.licenceStatus}
            </span>

            {/* Route / typeRating / name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {entry.route    && <span style={{ fontSize: 12, color: T.muted }}>{entry.route}</span>}
                {entry.typeRating && <span style={{ fontSize: 12, color: T.muted }}>· {entry.typeRating}</span>}
              </div>
              {entry.organisationName && (
                <p style={{ fontSize: 11, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--primary)" : "transparent",
    color:      active ? "var(--primary-foreground)" : T.muted,
    transition: "background 0.15s, color 0.15s",
  });

  return (
    <Dialog open={!!fingerprint} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[560px] max-h-[85vh] flex flex-col overflow-hidden p-0">
        {/* ── Header ── */}
        <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ background: "linear-gradient(135deg, var(--primary), #06B6D4)", borderRadius: 8, padding: 7, flexShrink: 0 }}>
              <Building2 style={{ width: 14, height: 14, color: "white" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <DialogTitle
                style={{ fontSize: 15, fontWeight: 800, color: T.text, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {companyName}
              </DialogTitle>
              <p style={{ fontSize: 12, color: T.muted }}>Company Intelligence</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div
            style={{ display: "flex", gap: 4, background: "var(--secondary)", borderRadius: 10, padding: 3, marginTop: 10, marginBottom: 4 }}
          >
            <button style={tabBtnStyle(tab === "health")}   onClick={() => setTab("health")}>Company Health</button>
            <button style={tabBtnStyle(tab === "timeline")} onClick={() => setTab("timeline")}>Licence Timeline</button>
          </div>
        </DialogHeader>

        {/* ── Scrollable panel content ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px 20px" }}>
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
