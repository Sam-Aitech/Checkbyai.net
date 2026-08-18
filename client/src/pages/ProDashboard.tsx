/**
 * CheckByAI Pro Dashboard
 * Design: Stitch MCP — CheckByAI Pro DS (dark, Geist, violet #7C3AED)
 * Palette: bg #0A0A0E · sidebar #0D0D12 · card rgba(17,17,20,.8) · border #1E1E24
 */
import { useState, useEffect, CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/queryDefaults";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import FileUploadSimple from "@/components/FileUploadSimple";
import { CompanyIntelligenceDialog } from "@/components/CompanyIntelligencePanel";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import logoImg from "@assets/logo_material.png";
import {
  LayoutDashboard, Building2, Shield, Bell, History,
  LogOut, Crown, CheckCircle2, XCircle, AlertTriangle,
  ArrowUp, ArrowDown, RefreshCw, RotateCcw, Pencil, Activity,
  Clock, FileText, BarChart3, Copy, Menu, X, Plus, Search,
  Mail, Smartphone, Loader2, Trash2, ChevronDown, ChevronRight, Zap,
  HelpCircle, SendHorizonal, MessageSquare, CheckCheck,
  type LucideIcon,
} from "lucide-react";

// ─── Design tokens — maps to site CSS variables ───────────────────────────────
const T = {
  bg:           "var(--background)",
  sidebar:      "var(--card)",
  card:         "var(--card)",
  cardSolid:    "var(--card)",
  border:       "var(--border)",
  violet:       "var(--primary)",
  violetDim:    "color-mix(in srgb, var(--primary) 8%, transparent)",
  violetBorder: "color-mix(in srgb, var(--primary) 22%, transparent)",
  indigo:       "var(--primary)",
  text:         "var(--foreground)",
  sub:          "var(--muted-foreground)",
  muted:        "var(--muted-foreground)",
  activeText:   "var(--primary)",
  emerald:      "#10B981",
  amber:        "#F59E0B",
  red:          "#EF4444",
  cyan:         "#06B6D4",
} as const;

const cardStyle: CSSProperties = {
  background: "var(--card)",
  border: `1px solid var(--border)`,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)",
};

const glowCardStyle: CSSProperties = {
  ...cardStyle,
  boxShadow: `0 0 24px color-mix(in srgb, var(--primary) 8%, transparent), 0 4px 16px rgba(0,0,0,0.06)`,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "overview" | "monitor" | "verify" | "notifications" | "history" | "support";

interface SponsorChange {
  id: number; organisationName: string; changeType: string;
  previousValue: string | null; newValue: string | null;
  detectedAt: string; snapshotDate: string;
}
interface WatchEntry {
  id: number; organisationName: string; townCity: string | null;
  fingerprint: string | null; isActive: boolean; createdAt: string;
  currentStatus: { listed: boolean; typeRating: string | null; route: string | null; status?: string };
  recentChanges: SponsorChange[];
}
interface Verification {
  id: number; receiptId: string | null; documentHash: string | null;
  filename: string; result: "genuine" | "suspicious" | "fake";
  confidence: number; verifiedAt: string; adminStatus: string;
  checks: Array<{ name: string; passed: boolean; severity: string; message: string }>;
}
type NotifEventType = "licence_revoked"|"rating_downgraded"|"licence_reinstated"|"rating_upgraded"|"route_added"|"route_removed"|"weekly_digest";
interface NotifEventPref { enabled: boolean; channels: { email: boolean; inApp: boolean; sms: boolean } }
type NotifPrefs = { [K in NotifEventType]: NotifEventPref };
interface SupportTicket {
  id: number; subject: string; message: string;
  status: "open" | "resolved"; adminReply: string | null;
  repliedAt: string | null; createdAt: string;
}
interface SponsorSearchResult {
  fingerprint: string; organisationName: string; townCity: string | null;
  typeRating: string | null; route: string | null; status: string; matchScore: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const NAV: Array<{ id: Tab; label: string; Icon: LucideIcon }> = [
  { id: "overview",      label: "Overview",        Icon: LayoutDashboard },
  { id: "monitor",       label: "Sponsor Monitor", Icon: Building2 },
  { id: "verify",        label: "Verify CoS",      Icon: Shield },
  { id: "notifications", label: "Notifications",   Icon: Bell },
  { id: "history",       label: "History",         Icon: History },
  { id: "support",       label: "Help & Support",  Icon: HelpCircle },
];

const EVENT_ROWS: Array<{ key: NotifEventType; label: string; sub: string }> = [
  { key: "licence_revoked",    label: "Licence Revoked",    sub: "Removed from register" },
  { key: "rating_downgraded",  label: "Rating Downgraded",  sub: "Rating decreased" },
  { key: "licence_reinstated", label: "Licence Reinstated", sub: "Restored to register" },
  { key: "rating_upgraded",    label: "Rating Upgraded",    sub: "Rating increased" },
  { key: "route_added",        label: "Route Added",        sub: "New immigration route" },
  { key: "route_removed",      label: "Route Removed",      sub: "Immigration route lost" },
  { key: "weekly_digest",      label: "Weekly Digest",      sub: "Weekly summary email" },
];

const CHANGE_META: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  NEW_LICENCE:     { label: "Licence Granted",  Icon: CheckCircle2, color: T.emerald },
  RE_ACTIVATED:    { label: "Reactivated",       Icon: RotateCcw,   color: T.cyan },
  REMOVED_REVOKED: { label: "Licence Revoked",   Icon: XCircle,     color: T.red },
  UPGRADED:        { label: "Rating Upgraded",   Icon: ArrowUp,     color: T.emerald },
  DOWNGRADED:      { label: "Rating Downgraded", Icon: ArrowDown,   color: T.amber },
  ROUTE_CHANGE:    { label: "Route Changed",     Icon: RefreshCw,   color: T.violet },
  NAME_CHANGE:     { label: "Name Changed",      Icon: Pencil,      color: T.cyan },
};

const PLAN_LABEL: Record<string, string> = { free:"Free", starter:"Starter", pro:"Pro", unlimited:"Unlimited", enterprise:"Enterprise" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useDebounce<V>(val: V, ms: number): V {
  const [d, setD] = useState(val);
  useEffect(() => { const t = setTimeout(() => setD(val), ms); return () => clearTimeout(t); }, [val, ms]);
  return d;
}
const fmtDate  = (s: string) => new Date(s).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
const fmtShort = (s: string) => { const d = new Date(s); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}) + " · " + d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}); };
function greeting() { const h = new Date().getHours(); return h<12?"Good morning":h<17?"Good afternoon":"Good evening"; }

// ─── Small Components ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status?: string }) {
  const s = status || "";
  const cfg =
    (s === "REMOVED_REVOKED" || s === "NOT_LISTED") ? { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)",  color: "#FCA5A5", label: "Revoked" } :
    s === "GRACE_PERIOD"    ? { bg: "rgba(245,158,11,0.12)",   border: "rgba(245,158,11,0.25)", color: "#FCD34D", label: "Grace" } :
    s === "NEWLY_GRANTED"   ? { bg: "rgba(245,158,11,0.12)",   border: "rgba(245,158,11,0.25)", color: "#FCD34D", label: "New" } :
    s === "ACTIVE"          ? { bg: "rgba(16,185,129,0.12)",   border: "rgba(16,185,129,0.25)", color: "#6EE7B7", label: "Active" } :
                              { bg: "rgba(100,116,139,0.12)",  border: "rgba(100,116,139,0.25)",color: "#CBD5E1", label: "Unknown" };
  return (
    <span style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 99, textTransform: "uppercase" }}>
      {cfg.label}
    </span>
  );
}

function PlanPill({ plan }: { plan: string }) {
  return (
    <span style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 4, boxShadow: "0 2px 8px color-mix(in srgb, var(--primary) 28%, transparent)" }}>
      <Crown style={{ width: 11, height: 11 }} />
      {PLAN_LABEL[plan] || plan}
    </span>
  );
}

interface StatCardProps { label: string; value: React.ReactNode; sub?: string; gradient: string; Icon: LucideIcon; loading?: boolean }
function StatCard({ label, value, sub, gradient, Icon, loading }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 14 }}
      whileHover={{ y: -2, boxShadow: "0 0 28px color-mix(in srgb, var(--primary) 12%, transparent), 0 8px 24px rgba(0,0,0,0.1)" }}
      style={{ ...cardStyle, padding: 20, cursor: "default" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontWeight: 600 }}>{label}</p>
          {loading
            ? <div style={{ background: T.border, height: 28, width: 56, borderRadius: 6, marginBottom: 4 }} />
            : <p style={{ fontSize: 26, fontWeight: 800, color: T.text, lineHeight: 1 }}>{value}</p>}
          {sub && <p style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>{sub}</p>}
        </div>
        <div style={{ background: gradient, borderRadius: 10, padding: 9, boxShadow: "0 2px 12px rgba(0,0,0,0.35)", flexShrink: 0 }}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ user, setTab }: { user: any; setTab: (t: Tab) => void }) {
  const { data: watches, isLoading: wL } = useQuery<WatchEntry[]>({ queryKey: ["/api/watches"], staleTime: STALE_TIMES.FREQUENT, retry: false, select: (raw: any): WatchEntry[] => Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [] });
  const { data: changes, isLoading: cL } = useQuery<{ changes: SponsorChange[]; totalCount: number }>({ queryKey: ["/api/sponsor-changes"], staleTime: STALE_TIMES.INFREQUENT, retry: false });
  const { data: verifs, isLoading: vL }  = useQuery<Verification[]>({ queryKey: ["/api/my-verifications"], staleTime: STALE_TIMES.NORMAL, retry: false });

  const plan        = user?.subscriptionStatus || "free";
  const firstName   = user?.firstName || user?.email?.split("@")[0] || "there";
  const revokedN    = watches?.filter(w => w.currentStatus?.status === "REMOVED_REVOKED" || w.currentStatus?.status === "NOT_LISTED").length || 0;

  // Only show changes for the user's own watched companies
  const watchedNames = new Set((watches||[]).map(w => w.organisationName.toLowerCase()));
  const myChanges = (changes?.changes || []).filter(c => watchedNames.has(c.organisationName.toLowerCase()));
  const alertsToday = myChanges.filter(c => Date.now() - new Date(c.detectedAt).getTime() < 86_400_000).length;
  const checksLeft  = user?.verificationLimit === -1 ? "∞" : user?.verificationLimit ?? "∞";

  type FeedItem = { key: string; ts: number; kind: "change"|"verify"; data: SponsorChange|Verification };
  const feed: FeedItem[] = [
    ...myChanges.slice(0,10).map(c => ({ key:`c${c.id}`, ts: +new Date(c.detectedAt), kind:"change" as const, data:c })),
    ...(verifs?.slice(0,5)||[]).map(v => ({ key:`v${v.id}`, ts: +new Date(v.verifiedAt), kind:"verify" as const, data:v })),
  ].sort((a,b) => b.ts - a.ts).slice(0, 8);

  const QUICK: Array<{ tab: Tab; label: string; sub: string; Icon: LucideIcon; gradient: string }> = [
    { tab:"monitor",       label:"Add Sponsor to Watch",   sub:"Monitor licence status",   Icon:Building2, gradient:`linear-gradient(135deg,#3B82F6,#06B6D4)` },
    { tab:"verify",        label:"Verify a CoS Document",  sub:"Instant AI verification",  Icon:Shield,    gradient:`linear-gradient(135deg,${T.violet},${T.indigo})` },
    { tab:"notifications", label:"Configure Alerts",       sub:"Email · SMS · In-app",     Icon:Bell,      gradient:`linear-gradient(135deg,${T.amber},#F97316)` },
  ];

  return (
    <div>
      {/* Welcome */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 4 }}>{greeting()}, {firstName} 👋</h1>
        <p style={{ fontSize: 14, color: T.sub }}>
          {revokedN > 0
            ? <span style={{ color: "#FCA5A5" }}>⚠ {revokedN} sponsor{revokedN>1?"s":""} in your watchlist ha{revokedN>1?"ve":"s"} been revoked</span>
            : "All your monitored sponsors are active — you're good to go."}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <StatCard label="Watched Sponsors" value={wL?"—":watches?.length??0} sub={revokedN>0?`${revokedN} revoked`:"All active"} gradient="linear-gradient(135deg,#3B82F6,#06B6D4)" Icon={Building2} loading={wL} />
        <StatCard label="Alerts Today"     value={cL?"—":alertsToday} sub="Last 24 hours" gradient={`linear-gradient(135deg,${T.amber},#F97316)`} Icon={Bell} loading={cL} />
        <StatCard label="CoS Checks"       value={checksLeft} sub={plan==="free"?"Free tier":"Unlimited"} gradient={`linear-gradient(135deg,${T.violet},${T.indigo})`} Icon={Shield} />
        <StatCard label="Plan"             value={PLAN_LABEL[plan]||plan} sub="Active subscription" gradient="linear-gradient(135deg,#10B981,#0D9488)" Icon={Crown} />
      </div>

      {/* Two-col layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Activity feed */}
        <div className="lg:col-span-2">
          <p style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>Recent Activity</p>
          {cL||vL ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[...Array(5)].map((_,i) => <div key={i} style={{ ...cardStyle, height:56, borderRadius:12 }} />)}
            </div>
          ) : feed.length===0 ? (
            <div style={{ ...cardStyle, padding:40, textAlign:"center", borderStyle:"dashed" }}>
              <Activity style={{ width:32, height:32, color:T.muted, margin:"0 auto 12px" }} />
              <p style={{ color:T.muted, fontSize:14 }}>No activity yet. Add a sponsor to start monitoring.</p>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {feed.map((item, idx) => (
                <motion.div
                  key={item.key}
                  initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
                  transition={{ delay: idx*0.04, type:"spring", stiffness:120, damping:16 }}
                  style={{ ...cardStyle, padding:"10px 14px", display:"flex", alignItems:"center", gap:12, borderRadius:12 }}
                >
                  {item.kind === "change" ? (() => {
                    const c = item.data as SponsorChange;
                    const meta = CHANGE_META[c.changeType] || { label: c.changeType, Icon: Activity, color: T.muted };
                    const MI = meta.Icon;
                    return <>
                      <MI style={{ width:16, height:16, color:meta.color, flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.organisationName}</p>
                        <p style={{ fontSize:12, color:T.muted }}>{meta.label}{c.previousValue&&c.newValue?<span> · {c.previousValue} → {c.newValue}</span>:null}</p>
                      </div>
                      <span style={{ fontSize:11, color:T.muted, flexShrink:0 }}>{fmtShort(c.detectedAt)}</span>
                    </>;
                  })() : (() => {
                    const v = item.data as Verification;
                    const col = v.result==="genuine"?T.emerald:v.result==="suspicious"?T.amber:T.red;
                    const RI = v.result==="genuine"?CheckCircle2:v.result==="suspicious"?AlertTriangle:XCircle;
                    return <>
                      <RI style={{ width:16, height:16, color:col, flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.filename}</p>
                        <p style={{ fontSize:12, color:T.muted }}>CoS Verified · <span style={{ color:col }}>{v.result}</span></p>
                      </div>
                      <span style={{ fontSize:11, color:T.muted, flexShrink:0 }}>{fmtShort(v.verifiedAt)}</span>
                    </>;
                  })()}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions + watchlist summary */}
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>Quick Actions</p>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {QUICK.map(q => (
              <motion.button
                key={q.tab} whileTap={{ scale:0.98 }} whileHover={{ y:-1 }}
                onClick={() => setTab(q.tab)}
                style={{ ...cardStyle, display:"flex", alignItems:"center", gap:12, padding:14, textAlign:"left", cursor:"pointer", width:"100%", transition:"box-shadow 0.15s" }}
              >
                <div style={{ background:q.gradient, borderRadius:10, padding:9, flexShrink:0, boxShadow:"0 2px 8px rgba(0,0,0,0.3)" }}>
                  <q.Icon className="w-4 h-4 text-white" />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:T.text }}>{q.label}</p>
                  <p style={{ fontSize:12, color:T.muted }}>{q.sub}</p>
                </div>
                <ChevronRight style={{ width:14, height:14, color:T.muted, flexShrink:0 }} />
              </motion.button>
            ))}
          </div>

          {watches && watches.length > 0 && (
            <div style={{ ...cardStyle, marginTop:16, padding:16, borderRadius:14 }}>
              <p style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>Watchlist Status</p>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {watches.slice(0,4).map(w => (
                  <div key={w.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                    <span style={{ fontSize:13, color:T.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{w.organisationName}</span>
                    <StatusPill status={w.currentStatus?.status} />
                  </div>
                ))}
                {watches.length > 4 && (
                  <button onClick={() => setTab("monitor")} style={{ fontSize:12, color:T.activeText, textAlign:"left", cursor:"pointer", padding:0 }}>
                    +{watches.length-4} more →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Monitor Tab ──────────────────────────────────────────────────────────────
function MonitorTab({ user }: { user: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [expanded, setExpanded] = useState<number|null>(null);
  const [intelligenceTarget, setIntelligenceTarget] = useState<{ fingerprint: string; name: string } | null>(null);
  const dq = useDebounce(query, 350);
  const isPro = ["starter","pro","unlimited","enterprise"].includes(user?.subscriptionStatus||"");
  const hasIntelligence = ["pro","unlimited","enterprise"].includes(user?.subscriptionStatus||"");

  const { data: watches, isLoading } = useQuery<WatchEntry[]>({ queryKey:["/api/watches"], staleTime: STALE_TIMES.FREQUENT, retry:false, select: (raw: any): WatchEntry[] => Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [] });

  const { data: results, isFetching: searching } = useQuery<SponsorSearchResult[]>({
    queryKey:["/api/sponsors/search", dq],
    enabled: dq.trim().length >= 3,
    staleTime: STALE_TIMES.FREQUENT,
    queryFn: async () => {
      const r = await fetch(`/api/sponsors/search?q=${encodeURIComponent(dq.trim())}`, { credentials:"include" });
      if(!r.ok) throw new Error();
      const data = await r.json();
      return data.results ?? data;
    },
    retry:false,
  });

  const addM = useMutation({
    mutationFn: (s: SponsorSearchResult) => apiRequest("POST","/api/watches",{ organisation_name:s.organisationName, town_city:s.townCity, fingerprint:s.fingerprint }),
    onSuccess: (_,s) => { qc.invalidateQueries({queryKey:["/api/watches"]}); toast({title:"Added to watchlist", description:`Monitoring ${s.organisationName}`}); setQuery(""); setShowSearch(false); },
    onError: (err: any) => {
      let msg = "Something went wrong. Please try again.";
      try {
        const raw = err?.message || "";
        const jsonStart = raw.indexOf("{");
        if (jsonStart >= 0) { msg = JSON.parse(raw.slice(jsonStart)).message || msg; }
      } catch {}
      toast({title:"Could not add",description:msg,variant:"destructive"});
    },
  });

  const delM = useMutation({
    mutationFn: (id:number) => apiRequest("DELETE",`/api/watches/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:["/api/watches"]}); toast({title:"Removed from watchlist"}); },
  });

  const watched = new Set((watches||[]).map(w => w.fingerprint));

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, gap:12 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:T.text, marginBottom:4 }}>Sponsor Monitor</h2>
          <p style={{ fontSize:14, color:T.sub }}>Track UK sponsor licence status changes in real time</p>
        </div>
        <motion.button whileTap={{scale:0.97}}
          onClick={() => setShowSearch(!showSearch)}
          style={{ background:"var(--primary)", color:"var(--primary-foreground)", border:"none", borderRadius:99, padding:"9px 18px", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", gap:7, cursor:"pointer", flexShrink:0, boxShadow:"0 2px 12px color-mix(in srgb, var(--primary) 30%, transparent)" }}
        >
          {showSearch ? <><X style={{width:14,height:14}}/> Cancel</> : <><Plus style={{width:14,height:14}}/> Add Sponsor</>}
        </motion.button>
      </div>

      {/* Search panel */}
      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} transition={{type:"spring",stiffness:120,damping:18}} style={{overflow:"hidden",marginBottom:20}}>
            <div style={{ background:"color-mix(in srgb, var(--primary) 5%, transparent)", border:`1px solid ${T.violetBorder}`, borderRadius:16, padding:20 }}>
              <p style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:12 }}>Search the UK sponsor register</p>
              <div style={{ position:"relative" }}>
                <Search style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", width:15, height:15, color:T.muted }} />
                <input value={query} onChange={e=>setQuery(e.target.value)} autoFocus placeholder="Company name..."
                  style={{ width:"100%", paddingLeft:38, paddingRight:36, paddingTop:10, paddingBottom:10, background:"var(--background)", border:`1px solid var(--border)`, borderRadius:10, color:"var(--foreground)", fontSize:14, outline:"none", boxSizing:"border-box" }}
                />
                {searching && <Loader2 style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", width:14, height:14, color:T.muted }} className="animate-spin" />}
              </div>

              {results && results.length > 0 && (
                <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:6, maxHeight:260, overflowY:"auto" }}>
                  {results.map(s => {
                    const alreadyWatched = watched.has(s.fingerprint);
                    return (
                      <div key={s.fingerprint} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, background:"var(--secondary)", border:`1px solid var(--border)`, borderRadius:10, padding:"10px 12px" }}>
                        <div style={{minWidth:0}}>
                          <p style={{ fontSize:13, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.organisationName}</p>
                          <p style={{ fontSize:12, color:T.muted }}>{s.townCity||"—"} · {s.typeRating||"Unknown"}</p>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                          <StatusPill status={s.status} />
                          <button disabled={alreadyWatched||addM.isPending} onClick={() => !alreadyWatched && addM.mutate(s)}
                            style={{ background: alreadyWatched ? "var(--secondary)" : "var(--primary)", color: alreadyWatched ? "var(--muted-foreground)" : "var(--primary-foreground)", border:"none", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:600, cursor: alreadyWatched ? "default" : "pointer" }}>
                            {alreadyWatched ? "Watching" : "Watch"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {dq.trim().length >= 2 && !searching && results?.length === 0 && (
                <p style={{ fontSize:13, color:T.muted, textAlign:"center", padding:"16px 0" }}>No results for "{dq}"</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Watchlist */}
      {isLoading ? (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[...Array(4)].map((_,i) => <div key={i} style={{...cardStyle,height:72,borderRadius:16}} />)}
        </div>
      ) : !isPro ? (
        <div style={{ ...cardStyle, padding:48, textAlign:"center", borderStyle:"dashed", borderColor:T.violetBorder }}>
          <Crown style={{ width:32, height:32, color:T.violet, margin:"0 auto 12px" }} />
          <p style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:6 }}>Upgrade to monitor sponsors</p>
          <p style={{ fontSize:14, color:T.sub, marginBottom:20 }}>Get instant alerts when a sponsor's licence is revoked or downgraded.</p>
          <a href="/pricing" style={{ background:"var(--primary)", color:"var(--primary-foreground)", padding:"10px 22px", borderRadius:99, fontSize:14, fontWeight:700, textDecoration:"none", boxShadow:"0 2px 12px color-mix(in srgb, var(--primary) 30%, transparent)" }}>View Plans</a>
        </div>
      ) : watches?.length === 0 ? (
        <div style={{ ...cardStyle, padding:48, textAlign:"center", borderStyle:"dashed" }}>
          <Building2 style={{ width:32, height:32, color:T.muted, margin:"0 auto 12px" }} />
          <p style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:6 }}>No sponsors in your watchlist</p>
          <p style={{ fontSize:14, color:T.sub }}>Click "Add Sponsor" above to start monitoring.</p>
        </div>
      ) : (
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>
            Your Watchlist ({watches?.length})
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {(watches||[]).map((w, idx) => (
              <motion.div key={w.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:idx*0.05,type:"spring",stiffness:120,damping:16}} style={{ ...cardStyle, borderRadius:16, overflow:"hidden" }}>
                <button onClick={() => setExpanded(expanded===w.id?null:w.id)}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", cursor:"pointer", width:"100%", background:"transparent", border:"none", textAlign:"left" }}>
                  <div style={{ background:"rgba(59,130,246,0.12)", borderRadius:10, padding:9, flexShrink:0 }}>
                    <Building2 style={{ width:16, height:16, color:"#60A5FA" }} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <span style={{ fontSize:14, fontWeight:700, color:T.text }}>{w.organisationName}</span>
                      <StatusPill status={w.currentStatus?.status} />
                    </div>
                    <p style={{ fontSize:12, color:T.muted, marginTop:2 }}>
                      {w.townCity||"—"} · {w.currentStatus?.typeRating||"Unknown"} · {w.currentStatus?.route||"—"}
                    </p>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                    {w.recentChanges?.length > 0 && (
                      <span style={{ background:"var(--secondary)", color:"var(--muted-foreground)", fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99, border:`1px solid var(--border)` }}>{w.recentChanges.length} changes</span>
                    )}
                    <ChevronDown style={{ width:15, height:15, color:T.muted, transition:"transform 0.2s", transform: expanded===w.id ? "rotate(180deg)" : "none" }} />
                  </div>
                </button>

                <AnimatePresence>
                  {expanded === w.id && (
                    <motion.div initial={{height:0}} animate={{height:"auto"}} exit={{height:0}} transition={{type:"spring",stiffness:120,damping:18}} style={{overflow:"hidden",borderTop:`1px solid ${T.border}`}}>
                      <div style={{ padding:"14px 16px" }}>
                        {w.recentChanges?.length > 0 ? (
                          <>
                            <p style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>Recent Changes</p>
                            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                              {w.recentChanges.slice(0,5).map(c => {
                                const meta = CHANGE_META[c.changeType] || { label:c.changeType, Icon:Activity, color:T.muted };
                                const MI = meta.Icon;
                                return (
                                  <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                                    <MI style={{ width:13, height:13, color:meta.color, flexShrink:0 }} />
                                    <span style={{ fontSize:13, color:T.text, fontWeight:500 }}>{meta.label}</span>
                                    {c.previousValue && c.newValue && <span style={{ fontSize:12, color:T.muted }}>{c.previousValue} → {c.newValue}</span>}
                                    <span style={{ fontSize:11, color:T.muted, marginLeft:"auto" }}>{fmtDate(c.detectedAt)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : <p style={{ fontSize:13, color:T.muted }}>No changes detected yet.</p>}
                        <div style={{ borderTop:`1px solid ${T.border}`, marginTop:12, paddingTop:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontSize:12, color:T.muted }}>Watching since {fmtDate(w.createdAt)}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                            {hasIntelligence && w.fingerprint ? (
                              <button
                                onClick={() => setIntelligenceTarget({ fingerprint: w.fingerprint!, name: w.organisationName })}
                                style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"var(--primary)", background:"none", border:"none", cursor:"pointer", fontWeight:600 }}
                              >
                                <BarChart3 style={{width:12,height:12}}/> Company Intel
                              </button>
                            ) : !hasIntelligence && w.fingerprint && (
                              <a href="/pricing" style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:T.muted, textDecoration:"none" }}>
                                <BarChart3 style={{width:12,height:12}}/> Company Intel <span style={{ fontSize:10, background:"color-mix(in srgb, var(--primary) 10%, transparent)", color:"var(--primary)", borderRadius:99, padding:"1px 6px", fontWeight:700 }}>Pro</span>
                              </a>
                            )}
                            <button onClick={() => delM.mutate(w.id)} disabled={delM.isPending}
                              style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:T.red, background:"none", border:"none", cursor:"pointer" }}>
                              <Trash2 style={{width:12,height:12}}/> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Company Intelligence dialog — rendered outside the list to avoid z-index issues */}
      <CompanyIntelligenceDialog
        fingerprint={intelligenceTarget?.fingerprint ?? null}
        companyName={intelligenceTarget?.name ?? ""}
        onClose={() => setIntelligenceTarget(null)}
      />
    </div>
  );
}

// ─── Verify Tab ───────────────────────────────────────────────────────────────
function VerifyTab({ user }: { user: any }) {
  const isAdmin = user?.role === "admin";
  const isPro = ["starter","pro","unlimited","enterprise"].includes(user?.subscriptionStatus||"");

  const STEPS = [
    { title:"Metadata Extraction",   desc:"XMP tags, creation date, producer tool" },
    { title:"Pattern Analysis",      desc:"Rule-based matching against trusted patterns" },
    { title:"AI Verification",       desc:"ONNX Runtime ML model inference" },
    { title:"Result Generation",     desc:"Confidence score and detailed analysis" },
  ];

  const [stepStates, setStepStates] = useState<("pending"|"active"|"done")[]>(STEPS.map(() => "pending"));
  const [result, setResult] = useState<{ type:"genuine"|"suspicious"|"fake"; confidence:number; mismatchedFields?:string[] }|null>(null);
  const [running, setRunning] = useState(false);

  const animatePipeline = async () => {
    setRunning(true); setResult(null);
    setStepStates(STEPS.map(() => "pending"));
    for (let i = 0; i < STEPS.length; i++) {
      setStepStates(prev => prev.map((s,j) => j===i ? "active" : s));
      await new Promise(r => setTimeout(r, 1300));
      setStepStates(prev => prev.map((s,j) => j===i ? "done" : s));
      await new Promise(r => setTimeout(r, 250));
    }
    setRunning(false);
  };

  const RC = {
    genuine:    { bg:"rgba(16,185,129,0.08)", border:"rgba(16,185,129,0.2)", title:"#6EE7B7", text:"Document is Genuine",    sub:"This document appears authentic. No anomalies detected.", Icon:CheckCircle2 },
    suspicious: { bg:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.2)", title:"#FCD34D", text:"Document is Suspicious", sub:"This document may have been modified.",                    Icon:AlertTriangle },
    fake:       { bg:"rgba(239,68,68,0.08)",  border:"rgba(239,68,68,0.2)",  title:"#FCA5A5", text:"Document is Fake",       sub:"This document appears fraudulent.",                          Icon:XCircle },
  };

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:T.text, marginBottom:4 }}>Verify CoS Document</h2>
        <p style={{ fontSize:14, color:T.sub }}>AI-powered forensic analysis of UK Certificate of Sponsorship PDFs</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Upload */}
        <div style={{ ...cardStyle, padding:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ background:"var(--primary)", borderRadius:12, padding:10, boxShadow:"0 2px 12px color-mix(in srgb, var(--primary) 25%, transparent)" }}>
              <Shield style={{ width:18, height:18, color:"#fff" }} />
            </div>
            <div>
              <p style={{ fontSize:15, fontWeight:700, color:T.text }}>Upload Document</p>
              <p style={{ fontSize:12, color:T.muted }}>PDF files only · Deleted after analysis</p>
            </div>
          </div>
          <FileUploadSimple
            onFileUpload={animatePipeline}
            onVerificationResult={setResult}
            onLoading={setRunning}
            onError={() => setRunning(false)}
            restrictToOneCheck={!isPro && !isAdmin}
            isAdmin={isAdmin}
          />
        </div>

        {/* Pipeline */}
        <div style={{ ...cardStyle, padding:24 }}>
          <p style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:20 }}>Verification Pipeline</p>
          <div style={{ display:"flex", flexDirection:"column", gap:0, position:"relative" }}>
            {/* Connecting line */}
            <div style={{ position:"absolute", left:13, top:14, bottom:14, width:2, background:`linear-gradient(to bottom, ${T.emerald}, ${T.violet}, ${T.border})`, opacity:0.4, borderRadius:2 }} />
            {STEPS.map((step, i) => {
              const s = stepStates[i];
              const circleBg = s==="done" ? T.emerald : s==="active" ? "var(--primary)" : "var(--muted)";
              const titleCol  = s==="done" ? T.emerald : s==="active" ? T.activeText : T.sub;
              return (
                <motion.div key={i} animate={{ opacity: running && s==="pending" ? 0.4 : 1 }} transition={{duration:0.3}}
                  style={{ display:"flex", alignItems:"flex-start", gap:12, paddingBottom:i<STEPS.length-1?20:0, position:"relative", zIndex:1 }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:circleBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"background 0.4s", boxShadow: s==="active"?"0 0 12px color-mix(in srgb, var(--primary) 45%, transparent)":"none" }}>
                    {s==="done"   ? <CheckCircle2 style={{ width:15, height:15, color:"#fff" }} /> :
                     s==="active" ? <Loader2 style={{ width:14, height:14, color:"#fff" }} className="animate-spin" /> :
                     <span style={{ fontSize:11, fontWeight:700, color:T.muted }}>{i+1}</span>}
                  </div>
                  <div>
                    <p style={{ fontSize:13, fontWeight:600, color:titleCol, transition:"color 0.3s" }}>{step.title}</p>
                    <p style={{ fontSize:12, color:T.muted }}>{step.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Result */}
          <AnimatePresence>
            {result && !running && (() => {
              const rc = RC[result.type];
              const RI = rc.Icon;
              return (
                <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                  style={{ marginTop:20, background:rc.bg, border:`1px solid ${rc.border}`, borderRadius:14, padding:16 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <RI style={{ width:22, height:22, color:rc.title, flexShrink:0 }} />
                    <div>
                      <p style={{ fontSize:15, fontWeight:700, color:rc.title }}>{rc.text}</p>
                      <p style={{ fontSize:12, color:T.sub }}>{rc.sub}</p>
                    </div>
                  </div>
                  <div style={{ background:"var(--muted)", borderRadius:99, height:6, overflow:"hidden", marginTop:10 }}>
                    <div style={{ width:`${Math.round(result.confidence*100)}%`, height:"100%", background:rc.title, borderRadius:99, transition:"width 0.8s ease" }} />
                  </div>
                  <p style={{ fontSize:12, color:T.muted, marginTop:5 }}>{Math.round(result.confidence*100)}% confidence</p>
                  {result.mismatchedFields && result.mismatchedFields.length > 0 && (
                    <ul style={{ marginTop:10, paddingLeft:16, color:T.sub, fontSize:12 }}>
                      {result.mismatchedFields.map((f,i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────
function NotificationsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: prefs, isLoading } = useQuery<NotifPrefs>({ queryKey:["/api/notifications/preferences"], staleTime: STALE_TIMES.FREQUENT, retry:false });

  const patchM = useMutation({
    mutationFn: (patch: Partial<NotifPrefs>) => apiRequest("PATCH","/api/notifications/preferences",patch),
    onSuccess: () => { qc.invalidateQueries({queryKey:["/api/notifications/preferences"]}); toast({title:"Saved"}); },
    onError: () => toast({title:"Save failed",variant:"destructive"}),
  });

  const toggle = (key: NotifEventType, field: "enabled"|"email"|"inApp"|"sms") => {
    if (!prefs) return;
    const cur = prefs[key];
    const patch: any = field === "enabled"
      ? { [key]: { ...cur, enabled: !cur.enabled } }
      : { [key]: { ...cur, channels: { ...cur.channels, [field]: !cur.channels[field] } } };
    patchM.mutate(patch);
  };

  const CH: Array<{ key:"email"|"inApp"|"sms"; label:string; Icon:LucideIcon }> = [
    { key:"email", label:"Email", Icon:Mail },
    { key:"inApp", label:"In-App", Icon:Bell },
    { key:"sms",   label:"SMS",   Icon:Smartphone },
  ];

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:T.text, marginBottom:4 }}>Notification Preferences</h2>
        <p style={{ fontSize:14, color:T.sub }}>Choose which events trigger alerts and on which channels</p>
      </div>

      <div style={{ ...cardStyle, borderRadius:16, overflow:"hidden" }}>
        {/* Header row */}
        <div style={{ display:"flex", alignItems:"center", padding:"12px 20px", background:"var(--secondary)", borderBottom:`1px solid var(--border)` }}>
          <div style={{ flex:1, fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>Event</div>
          {CH.map(ch => (
            <div key={ch.key} style={{ width:72, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <ch.Icon style={{ width:13, height:13, color:T.muted }} />
              <span style={{ fontSize:10, fontWeight:600, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>{ch.label}</span>
            </div>
          ))}
          <div style={{ width:72, textAlign:"center", fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>Active</div>
        </div>

        {/* Rows */}
        {isLoading ? (
          EVENT_ROWS.map(r => (
            <div key={r.key} style={{ display:"flex", alignItems:"center", padding:"16px 20px", borderBottom:`1px solid ${T.border}` }}>
              <div style={{ flex:1 }}><div style={{ background:T.border, height:14, width:120, borderRadius:4, marginBottom:6 }} /><div style={{ background:T.border, height:11, width:80, borderRadius:4 }} /></div>
              {[...Array(4)].map((_,i) => <div key={i} style={{ width:72, display:"flex", justifyContent:"center" }}><div style={{ background:T.border, height:20, width:36, borderRadius:99 }} /></div>)}
            </div>
          ))
        ) : (
          EVENT_ROWS.map((row, idx) => {
            const pref = prefs?.[row.key];
            const on = pref?.enabled ?? false;
            return (
              <motion.div key={row.key} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:idx*0.04}}
                style={{ display:"flex", alignItems:"center", padding:"14px 20px", borderBottom: idx<EVENT_ROWS.length-1?`1px solid ${T.border}`:"none", opacity: on ? 1 : 0.5, transition:"opacity 0.2s", borderLeft: on ? `3px solid ${T.violet}` : `3px solid transparent`, background: on ? T.violetDim : "transparent" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:500, color:T.text }}>{row.label}</p>
                  <p style={{ fontSize:12, color:T.muted }}>{row.sub}</p>
                </div>
                {CH.map(ch => (
                  <div key={ch.key} style={{ width:72, display:"flex", justifyContent:"center" }}>
                    <Switch checked={pref?.channels?.[ch.key]??false} onCheckedChange={()=>toggle(row.key,ch.key)} disabled={!on||patchM.isPending}
                      style={{ "--switch-thumb":"#fff", "--switch-on": T.violet } as any} />
                  </div>
                ))}
                <div style={{ width:72, display:"flex", justifyContent:"center" }}>
                  <Switch checked={on} onCheckedChange={()=>toggle(row.key,"enabled")} disabled={patchM.isPending}
                    style={{ "--switch-on": T.emerald } as any} />
                </div>
              </motion.div>
            );
          })
        )}

        {patchM.isPending && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 20px", background:"var(--muted)", borderTop:`1px solid var(--border)` }}>
            <Loader2 style={{ width:13, height:13, color:T.muted }} className="animate-spin" />
            <span style={{ fontSize:12, color:T.muted }}>Saving…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<number|null>(null);

  const { data: verifs, isLoading } = useQuery<Verification[]>({ queryKey:["/api/my-verifications"], staleTime: STALE_TIMES.NORMAL, retry:false });

  const copy = (text: string, label: string) => navigator.clipboard.writeText(text).then(() => toast({title:"Copied", description:`${label} copied`}));

  const RC = {
    genuine:    { bg:"rgba(16,185,129,0.07)", border:"rgba(16,185,129,0.18)", icon:"#6EE7B7",  label:"Genuine",    Icon:CheckCircle2 },
    suspicious: { bg:"rgba(245,158,11,0.07)", border:"rgba(245,158,11,0.18)", icon:"#FCD34D",  label:"Suspicious", Icon:AlertTriangle },
    fake:       { bg:"rgba(239,68,68,0.07)",  border:"rgba(239,68,68,0.18)",  icon:"#FCA5A5",  label:"Fake",       Icon:XCircle },
  };

  const total = verifs?.length || 0;
  const genuine = verifs?.filter(v=>v.result==="genuine").length || 0;
  const flagged = verifs?.filter(v=>v.result!=="genuine").length || 0;

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, gap:12, flexWrap:"wrap" }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:T.text, marginBottom:4 }}>Verification History</h2>
          <p style={{ fontSize:14, color:T.sub }}>All CoS documents you've submitted for AI verification</p>
        </div>
      </div>

      {/* Mini stats */}
      {total > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
          {[
            { label:"Total Verified", val:total,   col:"var(--muted-foreground)", bg:"var(--secondary)" },
            { label:"Genuine",        val:genuine,  col:T.emerald, bg:"rgba(16,185,129,0.07)" },
            { label:"Flagged",        val:flagged,  col:T.amber,  bg:"rgba(245,158,11,0.07)" },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, border:`1px solid ${T.border}`, borderRadius:12, padding:"12px 16px" }}>
              <p style={{ fontSize:11, color:T.muted, textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:600, marginBottom:4 }}>{s.label}</p>
              <p style={{ fontSize:22, fontWeight:800, color:s.col }}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[...Array(5)].map((_,i) => <div key={i} style={{...cardStyle,height:72,borderRadius:16}} />)}
        </div>
      ) : !verifs || verifs.length===0 ? (
        <div style={{ ...cardStyle, padding:48, textAlign:"center", borderStyle:"dashed" }}>
          <FileText style={{ width:32, height:32, color:T.muted, margin:"0 auto 12px" }} />
          <p style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:6 }}>No verifications yet</p>
          <p style={{ fontSize:14, color:T.sub }}>Your CoS verification history will appear here.</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {verifs.map((v, idx) => {
            const rc = RC[v.result] || RC.fake;
            const RI = rc.Icon;
            const pct = Math.round(v.confidence*100);
            const passed = v.checks?.filter(c=>c.passed).length??0;
            const total  = v.checks?.length??0;
            const isOpen = expanded===v.id;

            return (
              <motion.div key={v.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:idx*0.04,type:"spring",stiffness:120,damping:16}}
                style={{ background:rc.bg, border:`1px solid ${rc.border}`, borderRadius:16, overflow:"hidden" }}>
                <button onClick={() => setExpanded(isOpen?null:v.id)}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", cursor:"pointer", width:"100%", background:"transparent", border:"none", textAlign:"left" }}>
                  <RI style={{ width:18, height:18, color:rc.icon, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:700, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {v.filename.length>48 ? v.filename.slice(0,45)+"…" : v.filename}
                    </p>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:4 }}>
                      <span style={{ fontSize:11, color:T.muted, display:"flex", alignItems:"center", gap:3 }}><Clock style={{width:11,height:11}}/>{fmtShort(v.verifiedAt)}</span>
                      {total>0 && <span style={{ fontSize:11, color:T.muted, display:"flex", alignItems:"center", gap:3 }}><Shield style={{width:11,height:11}}/>{passed}/{total} checks</span>}
                      <span style={{ fontSize:11, color:T.muted, display:"flex", alignItems:"center", gap:3 }}><BarChart3 style={{width:11,height:11}}/>{pct}% confidence</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                    <span style={{ background:"var(--secondary)", border:`1px solid ${rc.border}`, color:rc.icon, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, textTransform:"uppercase", letterSpacing:"0.06em" }}>{rc.label}</span>
                    <ChevronDown style={{ width:14, height:14, color:T.muted, transition:"transform 0.2s", transform:isOpen?"rotate(180deg)":"none" }} />
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{height:0}} animate={{height:"auto"}} exit={{height:0}} transition={{type:"spring",stiffness:120,damping:18}} style={{overflow:"hidden",borderTop:`1px solid ${rc.border}`}}>
                      <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:10 }}>
                        {v.receiptId && (
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:12, color:T.muted }}>Receipt ID:</span>
                            <span style={{ fontSize:12, fontFamily:"monospace", color:T.sub }}>{v.receiptId}</span>
                            <button onClick={() => copy(v.receiptId!, "Receipt ID")} style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, padding:0, display:"flex" }}>
                              <Copy style={{width:12,height:12}} />
                            </button>
                          </div>
                        )}
                        {v.checks && v.checks.length > 0 && (
                          <div>
                            <p style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Check Details</p>
                            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                              {v.checks.map((ch,i) => (
                                <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
                                  {ch.passed
                                    ? <CheckCircle2 style={{ width:13, height:13, color:T.emerald, flexShrink:0 }} />
                                    : <XCircle     style={{ width:13, height:13, color:T.red,    flexShrink:0 }} />}
                                  <span style={{ fontSize:13, color: ch.passed?T.sub:T.text, fontWeight: ch.passed?400:500 }}>{ch.name}</span>
                                  {!ch.passed && <span style={{ marginLeft:"auto", fontSize:10, fontWeight:700, color: ch.severity==="critical"?T.red:ch.severity==="warning"?T.amber:T.cyan, textTransform:"uppercase", letterSpacing:"0.05em" }}>{ch.severity}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Support Tab ──────────────────────────────────────────────────────────────
function SupportTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<"new"|"history">("new");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: tickets, isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/support/tickets"], staleTime: STALE_TIMES.FREQUENT, retry: false,
  });

  const submitM = useMutation({
    mutationFn: () => apiRequest("POST", "/api/support/tickets", { subject: subject.trim(), message: message.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({ title: "Support request sent", description: "We'll get back to you within 24 hours." });
      setSubject(""); setMessage(""); setView("history");
    },
    onError: () => toast({ title: "Failed to send", description: "Please try again.", variant: "destructive" }),
  });

  const inputStyle: CSSProperties = {
    width: "100%", padding: "10px 14px", background: "var(--background)",
    border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)",
    fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  const openCount = tickets?.filter(t => t.status === "open").length || 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--foreground)", marginBottom: 4 }}>Help & Support</h2>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>Ask a question or report an issue — our team replies within 24 hours</p>
      </div>

      {/* Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["new","history"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: "8px 18px", borderRadius: 99, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
              background: view === v ? "var(--primary)" : "var(--secondary)",
              color: view === v ? "var(--primary-foreground)" : "var(--muted-foreground)" }}>
            {v === "new" ? "New Request" : `My Tickets${openCount > 0 ? ` (${openCount} open)` : ""}`}
          </button>
        ))}
      </div>

      {view === "new" ? (
        <div style={{ ...cardStyle, padding: 28, maxWidth: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <div style={{ background: "var(--primary)", borderRadius: 10, padding: 9 }}>
              <MessageSquare style={{ width: 16, height: 16, color: "var(--primary-foreground)" }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>Submit a Support Request</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Subject</p>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. I'm not receiving alerts"
                style={inputStyle} maxLength={120} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Message</p>
              <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe your issue or question in detail…"
                rows={5} style={{ ...inputStyle, resize: "vertical" as any, fontFamily: "inherit" }} maxLength={2000} />
              <p style={{ fontSize: 11, color: "var(--muted-foreground)", textAlign: "right", marginTop: 4 }}>{message.length}/2000</p>
            </div>
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={() => submitM.mutate()}
              disabled={submitM.isPending || !subject.trim() || !message.trim()}
              style={{ background: "var(--primary)", color: "var(--primary-foreground)", border: "none", borderRadius: 99, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: submitM.isPending || !subject.trim() || !message.trim() ? "not-allowed" : "pointer", opacity: submitM.isPending || !subject.trim() || !message.trim() ? 0.6 : 1, display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
              {submitM.isPending ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Sending…</> : <><SendHorizonal style={{ width: 14, height: 14 }} /> Send Request</>}
            </motion.button>
          </div>
        </div>
      ) : (
        <div>
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...Array(3)].map((_,i) => <div key={i} style={{ ...cardStyle, height: 80, borderRadius: 14 }} />)}
            </div>
          ) : !tickets || tickets.length === 0 ? (
            <div style={{ ...cardStyle, padding: 48, textAlign: "center", borderStyle: "dashed" }}>
              <HelpCircle style={{ width: 32, height: 32, color: "var(--muted-foreground)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", marginBottom: 6 }}>No tickets yet</p>
              <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>Submit a request and we'll reply here.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tickets.map((t, idx) => (
                <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                  style={{ ...cardStyle, borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{t.subject}</p>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0,
                      background: t.status === "resolved" ? "rgba(16,185,129,0.1)" : "color-mix(in srgb, var(--primary) 8%, transparent)",
                      color: t.status === "resolved" ? T.emerald : "var(--primary)",
                      border: `1px solid ${t.status === "resolved" ? "rgba(16,185,129,0.25)" : "color-mix(in srgb, var(--primary) 22%, transparent)"}` }}>
                      {t.status === "resolved" ? "Resolved" : "Open"}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: t.adminReply ? 14 : 0 }}>{t.message}</p>
                  {t.adminReply && (
                    <div style={{ background: "color-mix(in srgb, var(--primary) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 18%, transparent)", borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <CheckCheck style={{ width: 13, height: 13, color: T.emerald }} />
                        <p style={{ fontSize: 11, fontWeight: 700, color: T.emerald, textTransform: "uppercase", letterSpacing: "0.06em" }}>Admin Reply</p>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--foreground)" }}>{t.adminReply}</p>
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 10 }}>
                    <Clock style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
                    {fmtShort(t.createdAt)}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function ProDashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, isPro, isAdmin } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
    else if (!authLoading && isAuthenticated && !isPro && !isAdmin) setLocation("/pricing");
  }, [authLoading, isAuthenticated, isPro, isAdmin, setLocation]);

  const handleLogout = async () => {
    try { await apiRequest("POST","/api/auth/logout"); setLocation("/"); window.location.reload(); }
    catch { toast({title:"Logout failed",variant:"destructive"}); }
  };

  if (authLoading) return (
    <div style={{ background:"var(--background)", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:44, height:44, borderRadius:12, background:"var(--primary)", margin:"0 auto 14px", animation:"pulse 1.5s infinite" }} />
        <p style={{ fontSize:14, color:T.muted }}>Loading your dashboard…</p>
      </div>
    </div>
  );

  const plan       = user?.subscriptionStatus || "free";
  const initials   = `${user?.firstName?.[0]||""}${user?.lastName?.[0]||""}` || user?.email?.[0]?.toUpperCase() || "U";
  const fullName   = user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email?.split("@")[0] || "User";

  const PANELS: Record<Tab, React.ReactNode> = {
    overview:      <OverviewTab user={user} setTab={setActiveTab} />,
    monitor:       <MonitorTab user={user} />,
    verify:        <VerifyTab user={user} />,
    notifications: <NotificationsTab />,
    history:       <HistoryTab />,
    support:       <SupportTab />,
  };

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  const Sidebar = (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", userSelect:"none" }}>
      {/* Logo */}
      <div style={{ padding:"18px 16px 14px", borderBottom:`1px solid ${T.border}` }}>
        <img src={logoImg} alt="CheckByAI" style={{ height:32, objectFit:"contain" }} />
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:"10px 8px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
        {NAV.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <motion.button key={id} whileTap={{scale:0.98}}
              onClick={() => { setActiveTab(id); setDrawerOpen(false); }}
              style={{
                display:"flex", alignItems:"center", gap:11, padding:"9px 12px",
                borderRadius:10, border:"none", cursor:"pointer", textAlign:"left", width:"100%",
                background: active ? T.violetDim : "transparent",
                borderLeft: active ? `3px solid ${T.violet}` : "3px solid transparent",
                color: active ? T.activeText : T.muted,
                transition:"all 0.15s",
              }}
            >
              <Icon className="w-4 h-4" style={{ color: active ? T.activeText : T.muted, flexShrink: 0 } as CSSProperties} />
              <span style={{ fontSize:14, fontWeight: active?600:400 }}>{label}</span>
              {active && <motion.span layoutId="nav-dot" style={{ width:6, height:6, borderRadius:"50%", background:T.violet, marginLeft:"auto", flexShrink:0 }} />}
            </motion.button>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ padding:"12px 8px", borderTop:`1px solid ${T.border}`, display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 10px" }}>
          <div style={{ width:32, height:32, borderRadius:"50%", background:"var(--primary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"var(--primary-foreground)", flexShrink:0 }}>{initials}</div>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:13, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fullName}</p>
            <PlanPill plan={plan} />
          </div>
        </div>
        <button onClick={handleLogout} style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 10px", borderRadius:10, border:"none", cursor:"pointer", width:"100%", background:"transparent", color:T.muted, fontSize:13, transition:"color 0.15s" }}>
          <LogOut style={{ width:14, height:14 }} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background:T.bg, height:"100vh", overflow:"hidden", display:"flex", fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif" }}>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col" style={{ width:260, flexShrink:0, background:T.sidebar, borderRight:`1px solid ${T.border}`, height:"100%" }}>
        {Sidebar}
      </aside>

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {drawerOpen && <>
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{ position:"fixed", inset:0, zIndex:40, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)" }}
            onClick={() => setDrawerOpen(false)} />
          <motion.aside initial={{x:-264}} animate={{x:0}} exit={{x:-264}} transition={{type:"spring",stiffness:140,damping:20}}
            style={{ position:"fixed", left:0, top:0, bottom:0, width:260, zIndex:50, background:T.sidebar, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
            <button onClick={() => setDrawerOpen(false)} style={{ position:"absolute", top:14, right:14, background:"var(--secondary)", border:"none", borderRadius:8, padding:6, cursor:"pointer", color:"var(--muted-foreground)" }}>
              <X style={{ width:14, height:14 }} />
            </button>
            {Sidebar}
          </motion.aside>
        </>}
      </AnimatePresence>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>
        {/* Topbar */}
        <header style={{ height:54, flexShrink:0, background:"var(--card)", borderBottom:`1px solid var(--border)`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button className="lg:hidden" onClick={() => setDrawerOpen(true)} style={{ background:"var(--secondary)", border:"none", borderRadius:8, padding:7, cursor:"pointer", color:"var(--muted-foreground)", display:"flex" }}>
              <Menu style={{ width:16, height:16 }} />
            </button>
            <div className="hidden sm:flex" style={{ alignItems:"center", gap:6, fontSize:13, color:T.muted }}>
              <span>Dashboard</span>
              <ChevronRight style={{ width:12, height:12, opacity:0.5 }} />
              <span style={{ color:T.text, fontWeight:500, textTransform:"capitalize" }}>{activeTab.replace("-"," ")}</span>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div className="hidden sm:block"><PlanPill plan={plan} /></div>
            <div style={{ width:32, height:32, borderRadius:"50%", background:"var(--primary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"var(--primary-foreground)", flexShrink:0 }}>{initials}</div>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex:1, overflowY:"auto", padding:"24px 24px 80px", background:T.bg }} className="lg:pb-6">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:0.18, ease:"easeOut"}}>
              {PANELS[activeTab]}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden" style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:30, height:60, background:"var(--card)", backdropFilter:"blur(16px)", borderTop:`1px solid var(--border)`, display:"flex", alignItems:"center", justifyContent:"space-around", padding:"0 8px" }}>
        {NAV.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"6px 10px", border:"none", background:"transparent", cursor:"pointer", color: active ? T.activeText : T.muted, position:"relative" }}>
              <Icon className="w-5 h-5" style={{ color: active ? T.activeText : T.muted } as CSSProperties} />
              <span style={{ fontSize:10, fontWeight: active?700:400 }}>{label.split(" ")[0]}</span>
              {active && <motion.span layoutId="bottom-dot" style={{ position:"absolute", bottom:-2, width:4, height:4, borderRadius:"50%", background:T.violet }} />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
