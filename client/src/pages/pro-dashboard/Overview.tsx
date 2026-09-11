/**
 * Pro Dashboard — Overview
 * Protection-status-first layout: greeting -> protection status -> sponsor
 * summary -> jobs summary -> recent activity. See the approved plan
 * (Workstream 6) for the exact status semantics and copy.
 */
import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/queryDefaults";
import { ALERT_TIMING_SHORT } from "@shared/planTiers";
import { Shell, T, cardStyle } from "./index";
import { useAccountSummary, type SponsorChange } from "./hooks/useAccountSummary";
import {
  Building2, Bell, ShieldCheck, ShieldAlert, ShieldQuestion,
  AlertTriangle, CheckCircle2, XCircle, RotateCcw, ArrowUp, ArrowDown,
  RefreshCw, Pencil, Activity, ChevronRight, CreditCard, Briefcase,
  type LucideIcon,
} from "lucide-react";

interface Verification { id: number; filename: string; result: "genuine" | "suspicious" | "fake"; verifiedAt: string }

const CHANGE_META: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  NEW_LICENCE:     { label: "Licence Granted",  Icon: CheckCircle2, color: T.emerald },
  RE_ACTIVATED:    { label: "Reactivated",       Icon: RotateCcw,   color: T.cyan },
  REMOVED_REVOKED: { label: "Licence Revoked",   Icon: XCircle,     color: T.red },
  UPGRADED:        { label: "Rating Upgraded",   Icon: ArrowUp,     color: T.emerald },
  DOWNGRADED:      { label: "Rating Downgraded", Icon: ArrowDown,   color: T.amber },
  ROUTE_CHANGE:    { label: "Route Changed",     Icon: RefreshCw,   color: T.violet },
  NAME_CHANGE:     { label: "Name Changed",      Icon: Pencil,      color: T.cyan },
};

const fmtShort = (s: string) => { const d = new Date(s); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); };
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

const STATUS_META: Record<string, { label: string; sub: string; Icon: LucideIcon; color: string; bg: string; border: string }> = {
  empty:     { label: "You're not protected yet", sub: "Add a sponsor to start monitoring their licence status.", Icon: ShieldQuestion, color: T.muted,  bg: "var(--secondary)",          border: "var(--border)" },
  clear:     { label: "All clear",                 sub: "Your monitored sponsors are active with no unresolved issues.", Icon: ShieldCheck,  color: T.emerald, bg: "rgba(16,185,129,0.08)",     border: "rgba(16,185,129,0.22)" },
  attention: { label: "Needs your attention",       sub: "A recent change was detected on one of your sponsors.",         Icon: ShieldAlert,  color: T.amber,   bg: "rgba(245,158,11,0.08)",     border: "rgba(245,158,11,0.22)" },
  critical:  { label: "Licence revoked",            sub: "One of your monitored sponsors is no longer listed as active.", Icon: ShieldAlert,  color: T.red,     bg: "rgba(239,68,68,0.08)",      border: "rgba(239,68,68,0.22)" },
};

function ProtectionStatusCard({ status, isPastDue }: { status: string; isPastDue: boolean }) {
  const meta = STATUS_META[status] || STATUS_META.empty;
  const Icon = meta.Icon;
  return (
    <div style={{ ...cardStyle, background: meta.bg, border: `1px solid ${meta.border}`, padding: 22, display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon style={{ width: 22, height: 22, color: meta.color }} />
      </div>
      <div>
        <p style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 2 }}>{meta.label}</p>
        <p style={{ fontSize: 13, color: T.sub }}>{isPastDue ? "Payment failed — update your billing to keep alerts active." : meta.sub}</p>
      </div>
    </div>
  );
}

function PastDueBanner() {
  return (
    <div style={{ ...cardStyle, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <AlertTriangle style={{ width: 18, height: 18, color: T.red, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Payment failed</p>
        <p style={{ fontSize: 12, color: T.sub }}>We couldn't process your last payment. Update your billing details to avoid losing access.</p>
      </div>
      <a href="/pro-dashboard/account" style={{ fontSize: 12, fontWeight: 700, color: T.red, textDecoration: "none", flexShrink: 0 }}>Update billing →</a>
    </div>
  );
}

function OnboardingSteps({ showJobAlertsStep }: { showJobAlertsStep: boolean }) {
  const steps = [
    { title: "Add your sponsor", desc: "Search the UK sponsor register and start monitoring their licence.", href: "/pro-dashboard/monitor" },
    { title: "Enable your alerts", desc: "Choose how you want to be notified of licence changes.", href: "/pro-dashboard/alerts" },
    ...(showJobAlertsStep ? [{ title: "Turn on sponsored job alerts", desc: "Get notified when your watched sponsors post new roles.", href: "/pro-dashboard/jobs" }] : []),
  ];
  return (
    <div style={{ ...cardStyle, padding: 22, marginBottom: 24 }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>Get started</p>
      <p style={{ fontSize: 13, color: T.sub, marginBottom: 18 }}>Three steps to full sponsor-licence protection.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {steps.map((s, i) => (
          <a key={s.title} href={s.href} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 8px", textDecoration: "none", borderRadius: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.violetDim, border: `1px solid ${T.violetBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 700, color: T.violet }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{s.title}</p>
              <p style={{ fontSize: 12, color: T.muted }}>{s.desc}</p>
            </div>
            <ChevronRight style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
          </a>
        ))}
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div>
      <div style={{ height: 26, width: 220, background: T.border, borderRadius: 6, marginBottom: 28 }} />
      <div style={{ ...cardStyle, height: 84, marginBottom: 20 }} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...Array(3)].map((_, i) => <div key={i} style={{ ...cardStyle, height: 60 }} />)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...Array(2)].map((_, i) => <div key={i} style={{ ...cardStyle, height: 72 }} />)}
        </div>
      </div>
    </div>
  );
}

function OverviewError() {
  return (
    <div style={{ ...cardStyle, padding: 40, textAlign: "center", borderStyle: "dashed" }}>
      <AlertTriangle style={{ width: 30, height: 30, color: T.amber, margin: "0 auto 12px" }} />
      <p style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>We couldn't load your sponsors</p>
      <p style={{ fontSize: 13, color: T.sub, marginBottom: 16 }}>Your monitoring settings are safe.</p>
      <button onClick={() => window.location.reload()} style={{ background: "var(--primary)", color: "var(--primary-foreground)", border: "none", borderRadius: 99, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Try again</button>
    </div>
  );
}

function OverviewContent() {
  const summary = useAccountSummary();
  const { user, tier, isPastDue, isLoading, isError, watches, myChanges, protectionStatus, isFirstRun, jobAlertsEligible } = summary;

  const { data: verifs } = useQuery<Verification[]>({ queryKey: ["/api/my-verifications"], staleTime: STALE_TIMES.NORMAL, retry: false, enabled: summary.hasCosAccess });

  const firstName = user?.firstName || user?.email?.split("@")[0] || "there";
  const alertsToday = myChanges.filter((c) => Date.now() - new Date(c.detectedAt).getTime() < 86_400_000).length;

  type FeedItem = { key: string; ts: number; kind: "change" | "verify"; data: SponsorChange | Verification };
  const feed: FeedItem[] = [
    ...myChanges.slice(0, 10).map((c) => ({ key: `c${c.id}`, ts: +new Date(c.detectedAt), kind: "change" as const, data: c })),
    ...((verifs ?? []).slice(0, 5).map((v) => ({ key: `v${v.id}`, ts: +new Date(v.verifiedAt), kind: "verify" as const, data: v }))),
  ].sort((a, b) => b.ts - a.ts).slice(0, 8);

  if (isLoading) return <OverviewSkeleton />;
  if (isError) return <OverviewError />;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 4 }}>{greeting()}, {firstName} 👋</h1>
        <p style={{ fontSize: 14, color: T.sub }}>{ALERT_TIMING_SHORT[tier]} — we'll keep you ahead of licence changes.</p>
      </div>

      {isPastDue && <PastDueBanner />}

      <ProtectionStatusCard status={protectionStatus} isPastDue={isPastDue} />

      {isFirstRun ? (
        <OnboardingSteps showJobAlertsStep={jobAlertsEligible} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-7">
          <div style={{ ...cardStyle, padding: 18 }}>
            <p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 600 }}>Watched Sponsors</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: T.text }}>{watches.length}</p>
          </div>
          <div style={{ ...cardStyle, padding: 18 }}>
            <p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 600 }}>Alerts Today</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: T.text }}>{alertsToday}</p>
          </div>
          <div style={{ ...cardStyle, padding: 18 }}>
            <p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 600 }}>Plan</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: T.text, textTransform: "capitalize" }}>{tier}</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Recent Activity</p>
          {feed.length === 0 ? (
            <div style={{ ...cardStyle, padding: 40, textAlign: "center", borderStyle: "dashed" }}>
              <Activity style={{ width: 32, height: 32, color: T.muted, margin: "0 auto 12px" }} />
              <p style={{ color: T.muted, fontSize: 14 }}>No activity yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {feed.map((item, idx) => (
                <motion.div key={item.key} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}
                  style={{ ...cardStyle, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, borderRadius: 12 }}>
                  {item.kind === "change" ? (() => {
                    const c = item.data as SponsorChange;
                    const meta = CHANGE_META[c.changeType] || { label: c.changeType, Icon: Activity, color: T.muted };
                    const MI = meta.Icon;
                    return <>
                      <MI style={{ width: 16, height: 16, color: meta.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.organisationName}</p>
                        <p style={{ fontSize: 12, color: T.muted }}>{meta.label}{c.previousValue && c.newValue ? <span> · {c.previousValue} → {c.newValue}</span> : null} · Last change detected</p>
                      </div>
                      <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{fmtShort(c.detectedAt)}</span>
                    </>;
                  })() : (() => {
                    const v = item.data as Verification;
                    const col = v.result === "genuine" ? T.emerald : v.result === "suspicious" ? T.amber : T.red;
                    const RI = v.result === "genuine" ? CheckCircle2 : v.result === "suspicious" ? AlertTriangle : XCircle;
                    return <>
                      <RI style={{ width: 16, height: 16, color: col, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.filename}</p>
                        <p style={{ fontSize: 12, color: T.muted }}>CoS Verified · <span style={{ color: col }}>{v.result}</span></p>
                      </div>
                      <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{fmtShort(v.verifiedAt)}</span>
                    </>;
                  })()}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Quick Actions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <a href="/pro-dashboard/monitor" style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, padding: 14, textDecoration: "none" }}>
              <div style={{ background: "linear-gradient(135deg,#3B82F6,#06B6D4)", borderRadius: 10, padding: 9, flexShrink: 0 }}><Building2 className="w-4 h-4 text-white" /></div>
              <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Add Sponsor to Watch</p><p style={{ fontSize: 12, color: T.muted }}>Monitor licence status</p></div>
              <ChevronRight style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
            </a>
            {jobAlertsEligible && (
              <a href="/pro-dashboard/jobs" style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, padding: 14, textDecoration: "none" }}>
                <div style={{ background: `linear-gradient(135deg,${T.violet},${T.indigo})`, borderRadius: 10, padding: 9, flexShrink: 0 }}><Briefcase className="w-4 h-4 text-white" /></div>
                <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Sponsored Job Alerts</p><p style={{ fontSize: 12, color: T.muted }}>Nightly digest of new roles</p></div>
                <ChevronRight style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
              </a>
            )}
            <a href="/pro-dashboard/alerts" style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, padding: 14, textDecoration: "none" }}>
              <div style={{ background: `linear-gradient(135deg,${T.amber},#F97316)`, borderRadius: 10, padding: 9, flexShrink: 0 }}><Bell className="w-4 h-4 text-white" /></div>
              <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Configure Alerts</p><p style={{ fontSize: 12, color: T.muted }}>Email · SMS · WhatsApp</p></div>
              <ChevronRight style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
            </a>
          </div>

          {summary.hasCosAccess && (
            <div style={{ ...cardStyle, marginTop: 16, padding: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <CreditCard style={{ width: 16, height: 16, color: T.violet, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{summary.credits} CoS checks left</p>
                <a href="/pro-dashboard/account" style={{ fontSize: 11, color: T.violet, textDecoration: "none" }}>Manage in Account →</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Overview() {
  return <Shell active="overview"><OverviewContent /></Shell>;
}
