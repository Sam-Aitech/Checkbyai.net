/**
 * Pro Dashboard — Monitor
 * Sponsor cards show outcomes, not internals: name, active/inactive status,
 * current rating, "No recent changes" or the specific change with a relative
 * "Detected" time, and a review/company-intel action.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { STALE_TIMES } from "@/lib/queryDefaults";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { unwrapApiEnvelope } from "@/lib/apiEnvelope";
import { isPaidTier, hasEnrichedNotifications } from "@shared/planTiers";
import { CompanyIntelligenceDialog } from "@/components/CompanyIntelligencePanel";
import { Shell, T, cardStyle } from "./index";
import type { WatchEntry } from "./hooks/useAccountSummary";
import {
  Building2, Crown, Plus, X, Search, Loader2, ChevronDown,
  Trash2, BarChart3, Activity, CheckCircle2, XCircle, RotateCcw, ArrowUp,
  ArrowDown, RefreshCw, Pencil, type LucideIcon,
} from "lucide-react";

interface SponsorSearchResult {
  fingerprint: string; organisationName: string; townCity: string | null;
  typeRating: string | null; route: string | null; status: string; matchScore: number;
}

const CHANGE_META: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  NEW_LICENCE:     { label: "Licence Granted",  Icon: CheckCircle2, color: T.emerald },
  RE_ACTIVATED:    { label: "Reactivated",       Icon: RotateCcw,   color: T.cyan },
  REMOVED_REVOKED: { label: "Licence Revoked",   Icon: XCircle,     color: T.red },
  UPGRADED:        { label: "Rating Upgraded",   Icon: ArrowUp,     color: T.emerald },
  DOWNGRADED:      { label: "Rating Downgraded", Icon: ArrowDown,   color: T.amber },
  ROUTE_CHANGE:    { label: "Route Changed",     Icon: RefreshCw,   color: T.violet },
  NAME_CHANGE:     { label: "Name Changed",      Icon: Pencil,      color: T.cyan },
};

function useDebounce<V>(val: V, ms: number): V {
  const [d, setD] = useState(val);
  useEffect(() => { const t = setTimeout(() => setD(val), ms); return () => clearTimeout(t); }, [val, ms]);
  return d;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function StatusPill({ status }: { status?: string }) {
  const s = status || "";
  const cfg =
    (s === "REMOVED_REVOKED" || s === "NOT_LISTED") ? { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.25)", color: "#FCA5A5", label: "Revoked" } :
    s === "GRACE_PERIOD"  ? { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", color: "#FCD34D", label: "Grace" } :
    s === "NEWLY_GRANTED" ? { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", color: "#FCD34D", label: "New" } :
    s === "ACTIVE"        ? { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.25)", color: "#6EE7B7", label: "Active" } :
                             { bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.25)", color: "#CBD5E1", label: "Unknown" };
  return (
    <span style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 99, textTransform: "uppercase" }}>
      {cfg.label}
    </span>
  );
}

function MonitorContent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [intelligenceTarget, setIntelligenceTarget] = useState<{ fingerprint: string; name: string } | null>(null);
  const dq = useDebounce(query, 350);
  const isPro = isPaidTier(user?.subscriptionStatus);
  const hasIntelligence = hasEnrichedNotifications(user?.subscriptionStatus);

  const { data: watches, isLoading } = useQuery<WatchEntry[]>({ queryKey: ["/api/watches"], staleTime: STALE_TIMES.FREQUENT, retry: false });

  const { data: results, isFetching: searching } = useQuery<SponsorSearchResult[]>({
    queryKey: ["/api/sponsors/search", dq],
    enabled: dq.trim().length >= 3,
    staleTime: STALE_TIMES.FREQUENT,
    queryFn: async () => {
      const r = await fetch(`/api/sponsors/search?q=${encodeURIComponent(dq.trim())}`, { credentials: "include" });
      if (!r.ok) throw new Error();
      const envelope = await r.json();
      const data = unwrapApiEnvelope<{ results?: SponsorSearchResult[] }>(envelope);
      return data.results ?? [];
    },
    retry: false,
  });

  const addM = useMutation({
    mutationFn: (s: SponsorSearchResult) => apiRequest("POST", "/api/watches", { organisation_name: s.organisationName, town_city: s.townCity, fingerprint: s.fingerprint }),
    onSuccess: (_, s) => { qc.invalidateQueries({ queryKey: ["/api/watches"] }); toast({ title: "Added to watchlist", description: `Monitoring ${s.organisationName}` }); setQuery(""); setShowSearch(false); },
    onError: (err: any) => {
      let msg = "Something went wrong. Please try again.";
      try {
        const raw = err?.message || "";
        const jsonStart = raw.indexOf("{");
        if (jsonStart >= 0) { msg = JSON.parse(raw.slice(jsonStart)).message || msg; }
      } catch {}
      toast({ title: "Could not add", description: msg, variant: "destructive" });
    },
  });

  const delM = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/watches/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/watches"] }); toast({ title: "Removed from watchlist" }); },
  });

  const watched = new Set((watches || []).map((w) => w.fingerprint));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>Sponsor Monitor</h2>
          <p style={{ fontSize: 14, color: T.sub }}>Track UK sponsor licence status changes</p>
        </div>
        <motion.button whileTap={{ scale: 0.97 }}
          onClick={() => setShowSearch(!showSearch)}
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", border: "none", borderRadius: 99, padding: "9px 18px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 7, cursor: "pointer", flexShrink: 0 }}
        >
          {showSearch ? <><X style={{ width: 14, height: 14 }} /> Cancel</> : <><Plus style={{ width: 14, height: 14 }} /> Add Sponsor</>}
        </motion.button>
      </div>

      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden", marginBottom: 20 }}>
            <div style={{ background: "color-mix(in srgb, var(--primary) 5%, transparent)", border: `1px solid ${T.violetBorder}`, borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 12 }}>Search the UK sponsor register</p>
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: T.muted }} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus placeholder="Company name..."
                  style={{ width: "100%", paddingLeft: 38, paddingRight: 36, paddingTop: 10, paddingBottom: 10, background: "var(--background)", border: `1px solid var(--border)`, borderRadius: 10, color: "var(--foreground)", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
                {searching && <Loader2 style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.muted }} className="animate-spin" />}
              </div>

              {results && results.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                  {results.map((s) => {
                    const alreadyWatched = watched.has(s.fingerprint);
                    return (
                      <div key={s.fingerprint} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--secondary)", border: `1px solid var(--border)`, borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.organisationName}</p>
                          <p style={{ fontSize: 12, color: T.muted }}>{s.townCity || "—"} · {s.typeRating || "Unknown"}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <StatusPill status={s.status} />
                          <button disabled={alreadyWatched || addM.isPending} onClick={() => !alreadyWatched && addM.mutate(s)}
                            style={{ background: alreadyWatched ? "var(--secondary)" : "var(--primary)", color: alreadyWatched ? "var(--muted-foreground)" : "var(--primary-foreground)", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: alreadyWatched ? "default" : "pointer" }}>
                            {alreadyWatched ? "Watching" : "Watch"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {dq.trim().length >= 2 && !searching && results?.length === 0 && (
                <p style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: "16px 0" }}>No results for "{dq}"</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ ...cardStyle, height: 72, borderRadius: 16 }} />)}
        </div>
      ) : !isPro ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", borderStyle: "dashed", borderColor: T.violetBorder }}>
          <Crown style={{ width: 32, height: 32, color: T.violet, margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>Upgrade to monitor sponsors</p>
          <p style={{ fontSize: 14, color: T.sub, marginBottom: 20 }}>Get alerted twice-daily when a sponsor's licence is revoked or downgraded.</p>
          <a href="/pricing" style={{ background: "var(--primary)", color: "var(--primary-foreground)", padding: "10px 22px", borderRadius: 99, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>View Plans</a>
        </div>
      ) : watches?.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", borderStyle: "dashed" }}>
          <Building2 style={{ width: 32, height: 32, color: T.muted, margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No sponsors in your watchlist</p>
          <p style={{ fontSize: 14, color: T.sub }}>Click "Add Sponsor" above to start monitoring.</p>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
            Your Watchlist ({watches?.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(watches || []).map((w) => (
              <div key={w.id} style={{ ...cardStyle, borderRadius: 16, overflow: "hidden" }}>
                <button onClick={() => setExpanded(expanded === w.id ? null : w.id)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer", width: "100%", background: "transparent", border: "none", textAlign: "left" }}>
                  <div style={{ background: "rgba(59,130,246,0.12)", borderRadius: 10, padding: 9, flexShrink: 0 }}>
                    <Building2 style={{ width: 16, height: 16, color: "#60A5FA" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{w.organisationName}</span>
                      <StatusPill status={w.currentStatus?.status} />
                    </div>
                    <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                      {w.townCity || "—"} · {w.currentStatus?.typeRating || "Unknown"} · {w.currentStatus?.route || "—"}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {w.recentChanges?.length > 0 && (
                      <span style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, border: `1px solid var(--border)` }}>{w.recentChanges.length} changes</span>
                    )}
                    <ChevronDown style={{ width: 15, height: 15, color: T.muted, transform: expanded === w.id ? "rotate(180deg)" : "none" }} />
                  </div>
                </button>

                <AnimatePresence>
                  {expanded === w.id && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden", borderTop: `1px solid ${T.border}` }}>
                      <div style={{ padding: "14px 16px" }}>
                        {w.recentChanges?.length > 0 ? (
                          <>
                            <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Recent Changes</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                              {w.recentChanges.slice(0, 5).map((c) => {
                                const meta = CHANGE_META[c.changeType] || { label: c.changeType, Icon: Activity, color: T.muted };
                                const MI = meta.Icon;
                                return (
                                  <div key={c.id}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <MI style={{ width: 13, height: 13, color: meta.color, flexShrink: 0 }} />
                                      <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{meta.label}</span>
                                      {c.previousValue && c.newValue && <span style={{ fontSize: 12, color: T.muted }}>{c.previousValue} → {c.newValue}</span>}
                                      <span style={{ fontSize: 11, color: T.muted, marginLeft: "auto" }}>Detected {relativeTime(c.detectedAt)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : <p style={{ fontSize: 13, color: T.muted }}>No recent changes.</p>}
                        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: T.muted }}>Watching since {fmtDate(w.createdAt)}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {hasIntelligence && w.fingerprint ? (
                              <button onClick={() => setIntelligenceTarget({ fingerprint: w.fingerprint!, name: w.organisationName })}
                                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                                <BarChart3 style={{ width: 12, height: 12 }} /> Review change
                              </button>
                            ) : !hasIntelligence && w.fingerprint && (
                              <a href="/pricing" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.muted, textDecoration: "none" }}>
                                <BarChart3 style={{ width: 12, height: 12 }} /> Company Intel <span style={{ fontSize: 10, background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)", borderRadius: 99, padding: "1px 6px", fontWeight: 700 }}>Pro</span>
                              </a>
                            )}
                            <button onClick={() => delM.mutate(w.id)} disabled={delM.isPending}
                              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.red, background: "none", border: "none", cursor: "pointer" }}>
                              <Trash2 style={{ width: 12, height: 12 }} /> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}

      <CompanyIntelligenceDialog
        fingerprint={intelligenceTarget?.fingerprint ?? null}
        companyName={intelligenceTarget?.name ?? ""}
        onClose={() => setIntelligenceTarget(null)}
      />
    </div>
  );
}

export default function Monitor() {
  return <Shell active="monitor"><MonitorContent /></Shell>;
}
