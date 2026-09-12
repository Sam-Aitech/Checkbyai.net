/**
 * Pro Dashboard — Alerts
 * Combines, using existing data only (no second notification architecture):
 *  1. Sponsor alerts (licence/rating/route changes)
 *  2. Sponsored job alerts summary
 *  3. Delivery channels (email/WhatsApp/SMS/in-app) — ports the
 *     verify-then-enable pattern from SponsorMonitor.tsx's NotificationSettings.
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/queryDefaults";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isChannelAllowed, ALERT_TIMING_COPY, resolveTier } from "@shared/planTiers";
import { Shell, T, cardStyle } from "./index";
import { useAccountSummary } from "./hooks/useAccountSummary";
import { Switch } from "@/components/ui/switch";
import {
  Bell, Mail, Smartphone, MessageSquare, Phone, Loader2, CheckCircle2,
  Briefcase, ChevronRight, Clock, Send, type LucideIcon,
} from "lucide-react";

type NotifEventType = "licence_revoked" | "rating_downgraded" | "licence_reinstated" | "rating_upgraded" | "route_added" | "route_removed" | "weekly_digest";
interface NotifEventPref { enabled: boolean; channels: { email: boolean; inApp: boolean; sms: boolean } }
type NotifPrefs = { [K in NotifEventType]: NotifEventPref };

interface NotificationPrefs {
  emailEnabled: boolean; email: string | null;
  whatsappEnabled: boolean; whatsappNumber: string | null; whatsappVerified: boolean;
  smsEnabled: boolean; smsNumber: string | null; smsVerified: boolean;
}
interface JobAlertPref { fingerprint: string; enabled: boolean }

const EVENT_ROWS: Array<{ key: NotifEventType; label: string; sub: string }> = [
  { key: "licence_revoked",    label: "Licence Revoked",    sub: "Removed from register" },
  { key: "rating_downgraded",  label: "Rating Downgraded",  sub: "Rating decreased" },
  { key: "licence_reinstated", label: "Licence Reinstated", sub: "Restored to register" },
  { key: "rating_upgraded",    label: "Rating Upgraded",    sub: "Rating increased" },
  { key: "route_added",        label: "Route Added",        sub: "New immigration route" },
  { key: "route_removed",      label: "Route Removed",      sub: "Immigration route lost" },
  { key: "weekly_digest",      label: "Weekly Digest",      sub: "Weekly summary email" },
];

function SponsorAlertsSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: prefs, isLoading } = useQuery<NotifPrefs>({ queryKey: ["/api/notifications/preferences"], staleTime: STALE_TIMES.FREQUENT, retry: false });

  const patchM = useMutation({
    mutationFn: (patch: Partial<NotifPrefs>) => apiRequest("PATCH", "/api/notifications/preferences", patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/notifications/preferences"] }); toast({ title: "Saved" }); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const toggle = (key: NotifEventType, field: "enabled" | "email" | "inApp" | "sms") => {
    if (!prefs) return;
    const cur = prefs[key];
    const patch: any = field === "enabled"
      ? { [key]: { ...cur, enabled: !cur.enabled } }
      : { [key]: { ...cur, channels: { ...cur.channels, [field]: !cur.channels[field] } } };
    patchM.mutate(patch);
  };

  const CH: Array<{ key: "email" | "inApp" | "sms"; label: string; Icon: LucideIcon }> = [
    { key: "email", label: "Email", Icon: Mail },
    { key: "inApp", label: "In-App", Icon: Bell },
    { key: "sms", label: "SMS", Icon: Smartphone },
  ];

  return (
    <div id="sponsor-alerts" style={{ ...cardStyle, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "12px 20px", background: "var(--secondary)", borderBottom: `1px solid var(--border)` }}>
        <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Event</div>
        {CH.map((ch) => (
          <div key={ch.key} style={{ width: 64, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <ch.Icon style={{ width: 13, height: 13, color: T.muted }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase" }}>{ch.label}</span>
          </div>
        ))}
        <div style={{ width: 64, textAlign: "center", fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase" }}>Active</div>
      </div>

      {isLoading ? (
        EVENT_ROWS.map((r) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ flex: 1 }}><div style={{ background: T.border, height: 14, width: 120, borderRadius: 4 }} /></div>
          </div>
        ))
      ) : (
        EVENT_ROWS.map((row, idx) => {
          const pref = prefs?.[row.key];
          const on = pref?.enabled ?? false;
          return (
            <div key={row.key}
              style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: idx < EVENT_ROWS.length - 1 ? `1px solid ${T.border}` : "none", opacity: on ? 1 : 0.5, borderLeft: on ? `3px solid ${T.violet}` : "3px solid transparent", background: on ? T.violetDim : "transparent" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{row.label}</p>
                <p style={{ fontSize: 12, color: T.muted }}>{row.sub}</p>
              </div>
              {CH.map((ch) => (
                <div key={ch.key} style={{ width: 64, display: "flex", justifyContent: "center" }}>
                  <Switch checked={pref?.channels?.[ch.key] ?? false} onCheckedChange={() => toggle(row.key, ch.key)} disabled={!on || patchM.isPending} />
                </div>
              ))}
              <div style={{ width: 64, display: "flex", justifyContent: "center" }}>
                <Switch checked={on} onCheckedChange={() => toggle(row.key, "enabled")} disabled={patchM.isPending} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function JobAlertsSummary({ jobAlertsEligible }: { jobAlertsEligible: boolean }) {
  const { data: jobAlertPrefs } = useQuery<JobAlertPref[]>({
    queryKey: ["/api/job-alert-preferences"], enabled: jobAlertsEligible, staleTime: STALE_TIMES.FREQUENT, retry: false,
  });
  const enabledCount = (jobAlertPrefs ?? []).filter((p) => p.enabled).length;

  return (
    <a href="/pro-dashboard/jobs" style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 14, padding: 18, textDecoration: "none", marginBottom: 20 }}>
      <div style={{ background: `linear-gradient(135deg,${T.violet},${T.indigo})`, borderRadius: 10, padding: 10, flexShrink: 0 }}>
        <Briefcase className="w-4 h-4 text-white" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Sponsored job alerts</p>
        <p style={{ fontSize: 12, color: T.muted }}>
          {!jobAlertsEligible ? "Available on Alert Pass Pro" : enabledCount > 0 ? `Enabled for ${enabledCount} sponsor${enabledCount > 1 ? "s" : ""}` : "Not enabled for any sponsor yet"}
        </p>
      </div>
      <ChevronRight style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
    </a>
  );
}

function PhoneField({
  channel, label, icon: Icon, enabled, onToggle, phoneNumber, onPhoneChange, verified, channelAllowed, requiredPlan,
}: {
  channel: "whatsapp" | "sms"; label: string; icon: LucideIcon;
  enabled: boolean; onToggle: (v: boolean) => void; phoneNumber: string;
  onPhoneChange: (v: string) => void; verified: boolean; channelAllowed: boolean; requiredPlan: string;
}) {
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const sendOtpM = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/notification-preferences/verify-phone", { phone_number: phoneNumber, channel })).json(),
    onSuccess: (data: any) => { setOtpSent(true); setOtpCode(""); toast({ title: "Code sent", description: data.message }); },
    onError: (err: Error) => toast({ title: "Couldn't send code", description: err.message, variant: "destructive" }),
  });

  const confirmOtpM = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/notification-preferences/confirm-phone", { phone_number: phoneNumber, channel, code: otpCode })).json(),
    onSuccess: (data: any) => { setOtpSent(false); setOtpCode(""); qc.invalidateQueries({ queryKey: ["/api/notification-preferences"] }); toast({ title: "Verified", description: data.message }); },
    onError: (err: Error) => toast({ title: "Verification failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon style={{ width: 15, height: 15, color: T.muted }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{label}</span>
        </div>
        <Switch checked={enabled} disabled={!channelAllowed} onCheckedChange={(v) => {
          if (v && !verified) { toast({ title: "Verification required", description: `Please verify your ${label.split(" ")[0]} number first.` }); return; }
          onToggle(v);
        }} />
      </div>
      {!channelAllowed ? (
        <p style={{ fontSize: 12, color: T.muted, marginTop: 6, marginLeft: 25 }}>Requires {requiredPlan} plan or higher. <a href="/pricing" style={{ color: T.violet }}>Upgrade</a></p>
      ) : (
        <div style={{ marginLeft: 25, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="tel" placeholder="+447700900000" value={phoneNumber} onChange={(e) => onPhoneChange(e.target.value)}
              style={{ maxWidth: 200, padding: "7px 10px", fontSize: 13, background: "var(--background)", border: `1px solid var(--border)`, borderRadius: 8, color: "var(--foreground)" }} />
            {verified ? (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.emerald, fontWeight: 600 }}><CheckCircle2 style={{ width: 14, height: 14 }} /> Verified</span>
            ) : (
              <button onClick={() => sendOtpM.mutate()} disabled={!phoneNumber || phoneNumber.length < 8 || sendOtpM.isPending}
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: `1px solid var(--border)`, background: "transparent", color: T.text, cursor: "pointer" }}>
                {sendOtpM.isPending ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Send style={{ width: 12, height: 12 }} />} Verify
              </button>
            )}
          </div>
          {otpSent && !verified && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="text" inputMode="numeric" placeholder="6-digit code" value={otpCode} maxLength={6}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={{ width: 120, padding: "7px 10px", fontSize: 13, textAlign: "center", background: "var(--background)", border: `1px solid var(--border)`, borderRadius: 8, color: "var(--foreground)" }} />
              <button onClick={() => confirmOtpM.mutate()} disabled={otpCode.length !== 6 || confirmOtpM.isPending}
                style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer" }}>
                {confirmOtpM.isPending ? "Confirming…" : "Confirm"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryChannelsSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const tier = resolveTier(user?.subscriptionStatus);
  const { data: prefs, isLoading } = useQuery<NotificationPrefs>({ queryKey: ["/api/notification-preferences"], staleTime: STALE_TIMES.FREQUENT, retry: false });

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsNumber, setSmsNumber] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (prefs) {
      setEmailEnabled(prefs.emailEnabled); setWhatsappEnabled(prefs.whatsappEnabled);
      setWhatsappNumber(prefs.whatsappNumber || ""); setSmsEnabled(prefs.smsEnabled);
      setSmsNumber(prefs.smsNumber || ""); setDirty(false);
    }
  }, [prefs]);
  const markDirty = useCallback(() => setDirty(true), []);

  const saveM = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/notification-preferences", { email_enabled: emailEnabled, whatsapp_enabled: whatsappEnabled, whatsapp_number: whatsappNumber || null, sms_enabled: smsEnabled, sms_number: smsNumber || null }),
    onSuccess: () => { setDirty(false); qc.invalidateQueries({ queryKey: ["/api/notification-preferences"] }); toast({ title: "Preferences saved" }); },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div style={{ ...cardStyle, height: 180 }} />;

  return (
    <div style={{ ...cardStyle, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "8px 12px", background: "var(--secondary)", borderRadius: 10 }}>
        <Clock style={{ width: 14, height: 14, color: T.violet, flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: T.muted }}><strong style={{ color: T.text }}>Alert timing:</strong> {ALERT_TIMING_COPY[tier]}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Mail style={{ width: 15, height: 15, color: T.muted }} /><span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Email</span></div>
            <Switch checked={emailEnabled} onCheckedChange={(v) => { setEmailEnabled(v); markDirty(); }} />
          </div>
          {user?.email && <p style={{ fontSize: 12, color: T.muted, marginLeft: 25, marginTop: 4 }}>Alerts sent to {user.email}</p>}
        </div>
        <div style={{ borderTop: `1px solid ${T.border}` }} />
        <PhoneField channel="whatsapp" label="WhatsApp Notifications" icon={MessageSquare} enabled={whatsappEnabled} onToggle={(v) => { setWhatsappEnabled(v); markDirty(); }} phoneNumber={whatsappNumber} onPhoneChange={(v) => { setWhatsappNumber(v); markDirty(); }} verified={prefs?.whatsappVerified ?? false} channelAllowed={isChannelAllowed(user?.subscriptionStatus, "whatsapp")} requiredPlan="Starter" />
        <div style={{ borderTop: `1px solid ${T.border}` }} />
        <PhoneField channel="sms" label="SMS Notifications" icon={Phone} enabled={smsEnabled} onToggle={(v) => { setSmsEnabled(v); markDirty(); }} phoneNumber={smsNumber} onPhoneChange={(v) => { setSmsNumber(v); markDirty(); }} verified={prefs?.smsVerified ?? false} channelAllowed={isChannelAllowed(user?.subscriptionStatus, "sms")} requiredPlan="Pro" />
        <div style={{ borderTop: `1px solid ${T.border}` }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 12, color: T.muted }}>{dirty ? "You have unsaved changes" : "All changes saved"}</p>
          <button onClick={() => saveM.mutate()} disabled={!dirty || saveM.isPending}
            style={{ fontSize: 13, fontWeight: 700, padding: "8px 18px", borderRadius: 99, border: "none", cursor: dirty ? "pointer" : "default", opacity: dirty ? 1 : 0.5, background: "var(--primary)", color: "var(--primary-foreground)" }}>
            {saveM.isPending ? "Saving…" : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertsContent() {
  const { myChanges, jobAlertsEligible, isLoading } = useAccountSummary();
  const needsAttentionCount = myChanges.length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>Alerts</h2>
          <p style={{ fontSize: 14, color: T.sub }}>Sponsor changes, job alerts, and how you're notified</p>
        </div>
        {!isLoading && needsAttentionCount > 0 && (
          <a href="#sponsor-alerts" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: T.amber, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 99, padding: "6px 14px", textDecoration: "none" }}>
            <Bell style={{ width: 13, height: 13 }} /> {needsAttentionCount} needs attention
          </a>
        )}
      </div>

      <JobAlertsSummary jobAlertsEligible={jobAlertsEligible} />

      <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Sponsor Alert Events</p>
      <div style={{ marginBottom: 24 }}>
        <SponsorAlertsSection />
      </div>

      <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Delivery Channels</p>
      <DeliveryChannelsSection />
    </div>
  );
}

export default function Alerts() {
  return <Shell active="alerts"><AlertsContent /></Shell>;
}
