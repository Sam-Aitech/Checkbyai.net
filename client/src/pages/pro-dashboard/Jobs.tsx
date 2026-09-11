/**
 * Pro Dashboard — Jobs (sponsored job alerts)
 * Ports the existing per-company toggle UI from SponsorMonitor.tsx against
 * the existing GET/POST /api/job-alert-preferences (server/routes/notifications.ts,
 * already gated server-side on pro|unlimited|enterprise). No new backend.
 *
 * "Available" (entitled, not yet opted in) is distinct from "enabled"
 * (preference row exists and enabled:true) — never show one as the other.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/queryDefaults";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shell, T, cardStyle } from "./index";
import { useAccountSummary, type WatchEntry } from "./hooks/useAccountSummary";
import { Switch } from "@/components/ui/switch";
import { Briefcase, Crown, Loader2, Building2 } from "lucide-react";

interface JobAlertPref { fingerprint: string; enabled: boolean }

function JobsContent() {
  const { jobAlertsEligible } = useAccountSummary();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: watches, isLoading: watchesLoading } = useQuery<WatchEntry[]>({
    queryKey: ["/api/watches"], staleTime: STALE_TIMES.FREQUENT, retry: false,
  });

  const { data: jobAlertPrefs, isLoading: prefsLoading } = useQuery<JobAlertPref[]>({
    queryKey: ["/api/job-alert-preferences"],
    enabled: jobAlertsEligible,
    staleTime: STALE_TIMES.FREQUENT,
    retry: false,
  });
  const prefMap = new Map((jobAlertPrefs ?? []).map((p) => [p.fingerprint, p.enabled]));

  const toggleM = useMutation({
    mutationFn: ({ fingerprint, enabled }: { fingerprint: string; enabled: boolean }) =>
      apiRequest("POST", "/api/job-alert-preferences", { fingerprint, enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/job-alert-preferences"] }),
    onError: (err: Error) => toast({ title: "Could not update job alerts", description: err.message, variant: "destructive" }),
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>Sponsored Job Alerts</h2>
        <p style={{ fontSize: 14, color: T.sub }}>Nightly digests of new job openings for the sponsors you watch</p>
      </div>

      {!jobAlertsEligible ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", borderStyle: "dashed", borderColor: T.violetBorder }}>
          <Crown style={{ width: 32, height: 32, color: T.violet, margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>Sponsored job alerts are available on Alert Pass Pro</p>
          <p style={{ fontSize: 14, color: T.sub, marginBottom: 20 }}>Get nightly digests of new openings from your watched sponsors — LinkedIn, Indeed, CV-Library and more.</p>
          <a href="/pricing" style={{ background: "var(--primary)", color: "var(--primary-foreground)", padding: "10px 22px", borderRadius: 99, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>Upgrade to Pro</a>
        </div>
      ) : watchesLoading || prefsLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...Array(3)].map((_, i) => <div key={i} style={{ ...cardStyle, height: 70, borderRadius: 16 }} />)}
        </div>
      ) : !watches || watches.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", borderStyle: "dashed" }}>
          <Building2 style={{ width: 32, height: 32, color: T.muted, margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No sponsors to enable job alerts for yet</p>
          <p style={{ fontSize: 14, color: T.sub }}>Add a sponsor on the Monitor page first — job alerts are available per company.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {watches.filter((w) => !!w.fingerprint).map((w) => {
            const enabled = prefMap.get(w.fingerprint!) ?? false;
            const isPending = toggleM.isPending && (toggleM.variables as any)?.fingerprint === w.fingerprint;
            return (
              <div key={w.id} style={{ ...cardStyle, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Briefcase style={{ width: 16, height: 16, color: T.violet, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.organisationName}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {isPending && <Loader2 style={{ width: 14, height: 14, color: T.muted }} className="animate-spin" />}
                    <Switch checked={enabled} disabled={isPending}
                      onCheckedChange={(v) => toggleM.mutate({ fingerprint: w.fingerprint!, enabled: v })} />
                  </div>
                </div>
                <p style={{ fontSize: 12, color: enabled ? T.emerald : T.muted, marginTop: 8, marginLeft: 26 }}>
                  {enabled ? "Enabled — you'll get nightly emails of new job openings" : "Available — turn on to get nightly digests of new job openings"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20, padding: "12px 16px", background: "var(--secondary)", borderRadius: 12 }}>
        <p style={{ fontSize: 12, color: T.muted }}>
          <strong style={{ color: T.text }}>Why am I seeing this?</strong> This opportunity was surfaced because it is associated with a company you're monitoring and matches the available job data. This does not guarantee sponsorship or visa eligibility.
        </p>
      </div>
    </div>
  );
}

export default function Jobs() {
  return <Shell active="jobs"><JobsContent /></Shell>;
}
