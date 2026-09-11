/**
 * Pro Dashboard — Account
 * Profile / Plan & usage / Billing / Security / Support sections, plus the
 * demoted "Verify a CoS" entry point (links out to the existing standalone
 * /dashboard page rather than re-embedding upload UI — locked decision).
 */
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { unwrapApiEnvelope } from "@/lib/apiEnvelope";
import { TIER_LABELS } from "@shared/planTiers";
import { Shell, T, cardStyle } from "./index";
import { useAccountSummary } from "./hooks/useAccountSummary";
import {
  User, CreditCard, ShieldCheck, HelpCircle, Crown, AlertTriangle,
  ExternalLink, Loader2, ChevronRight,
} from "lucide-react";

function SectionCard({ title, Icon, children }: { title: string; Icon: any; children: React.ReactNode }) {
  return (
    <div style={{ ...cardStyle, padding: 22, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Icon style={{ width: 16, height: 16, color: T.violet }} />
        <p style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const unlimited = limit === -1;
  const pct = unlimited ? 100 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const atCapacity = !unlimited && used >= limit;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: T.sub }}>{unlimited ? `${used} sponsors watched` : `${used} / ${limit} sponsors`}</span>
        {atCapacity && <span style={{ fontSize: 12, fontWeight: 700, color: T.amber }}>Capacity reached</span>}
      </div>
      <div style={{ background: "var(--secondary)", borderRadius: 99, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: atCapacity ? T.amber : T.violet, borderRadius: 99, transition: "width 0.4s ease" }} />
      </div>
      {atCapacity && (
        <a href="/pricing" style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 700, color: T.violet, textDecoration: "none" }}>
          Monitoring capacity reached — Upgrade capacity →
        </a>
      )}
    </div>
  );
}

function AccountContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const summary = useAccountSummary();
  const [openingPortal, setOpeningPortal] = useState(false);
  const tierLabel = TIER_LABELS[summary.tier] || summary.tier;

  const handleOpenBillingPortal = async () => {
    try {
      setOpeningPortal(true);
      const res = await apiRequest("POST", "/api/billing/portal");
      const envelope = await res.json();
      const data = unwrapApiEnvelope<Record<string, any>>(envelope);
      if (data.url) { window.location.href = data.url; }
      else { throw new Error(envelope.error || data.message || "No portal URL returned"); }
    } catch (error: any) {
      toast({ title: "Could not open billing portal", description: error.message || "Please try again in a moment.", variant: "destructive" });
      setOpeningPortal(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>Account</h2>
        <p style={{ fontSize: 14, color: T.sub }}>Profile, plan, billing, and support</p>
      </div>

      <SectionCard title="Profile" Icon={User}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div><p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", marginBottom: 3 }}>Name</p><p style={{ fontSize: 14, color: T.text }}>{user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : "—"}</p></div>
          <div><p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", marginBottom: 3 }}>Email</p><p style={{ fontSize: 14, color: T.text }}>{user?.email || "—"}</p></div>
        </div>
      </SectionCard>

      <SectionCard title="Plan & Usage" Icon={Crown}>
        {summary.isPastDue && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <AlertTriangle style={{ width: 16, height: 16, color: T.red, flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: T.text }}><strong>Payment failed.</strong> Update your billing to keep your alerts active.</p>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", marginBottom: 3 }}>Current plan</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{summary.isPastDue ? "Free (payment failed)" : tierLabel}</p>
          </div>
          <a href="/pricing" style={{ fontSize: 12, fontWeight: 700, color: T.violet, textDecoration: "none" }}>Change plan →</a>
        </div>
        <UsageBar used={summary.watchCount} limit={summary.watchLimit} />

        {summary.hasCosAccess && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", marginBottom: 3 }}>CoS Checks</p><p style={{ fontSize: 14, color: T.text }}>{summary.credits} remaining</p></div>
          </div>
        )}

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
          {summary.hasCosAccess ? (
            <a href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "12px 14px", borderRadius: 10, background: "var(--secondary)" }}>
              <ShieldCheck style={{ width: 16, height: 16, color: T.violet, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Verify a CoS</p>
                <p style={{ fontSize: 11, color: T.muted }}>Opens the CoS verification tool</p>
              </div>
              <ExternalLink style={{ width: 13, height: 13, color: T.muted, flexShrink: 0 }} />
            </a>
          ) : (
            <a href="/cos-pricing" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "12px 14px", borderRadius: 10, background: "var(--secondary)", opacity: 0.85 }}>
              <ShieldCheck style={{ width: 16, height: 16, color: T.muted, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Verify a CoS</p>
                <p style={{ fontSize: 11, color: T.muted }}>Separate product — see CoS Check pricing</p>
              </div>
              <ChevronRight style={{ width: 13, height: 13, color: T.muted, flexShrink: 0 }} />
            </a>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Billing" Icon={CreditCard}>
        <p style={{ fontSize: 13, color: T.sub, marginBottom: 14 }}>Update your card, view invoices, or cancel your subscription via the secure Stripe customer portal.</p>
        <button onClick={handleOpenBillingPortal} disabled={openingPortal}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--primary)", color: "var(--primary-foreground)", border: "none", borderRadius: 99, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: openingPortal ? "default" : "pointer", opacity: openingPortal ? 0.7 : 1 }}>
          {openingPortal ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Opening…</> : "Manage Billing"}
        </button>
      </SectionCard>

      <SectionCard title="Security" Icon={ShieldCheck}>
        <p style={{ fontSize: 13, color: T.sub }}>Manage your sign-in and password via the Stripe/account portal above, or contact support for account security requests.</p>
      </SectionCard>

      <SectionCard title="Support" Icon={HelpCircle}>
        <a href="/pro-dashboard/support" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Help &amp; Support</p><p style={{ fontSize: 12, color: T.muted }}>Submit a request or view your tickets</p></div>
          <ChevronRight style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
        </a>
      </SectionCard>
    </div>
  );
}

export default function Account() {
  return <Shell active="account"><AccountContent /></Shell>;
}
