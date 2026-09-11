/**
 * Pro Dashboard — Support
 * Migrated from the old ProDashboard.tsx SupportTab, unchanged behavior.
 */
import { useState, type CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/queryDefaults";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shell, T, cardStyle } from "./index";
import { HelpCircle, MessageSquare, SendHorizonal, Loader2, Clock, CheckCheck } from "lucide-react";

interface SupportTicket {
  id: number; subject: string; message: string;
  status: "open" | "resolved"; adminReply: string | null;
  repliedAt: string | null; createdAt: string;
}

const fmtShort = (s: string) => { const d = new Date(s); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); };

function SupportContent() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<"new" | "history">("new");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: tickets, isLoading } = useQuery<SupportTicket[]>({ queryKey: ["/api/support/tickets"], staleTime: STALE_TIMES.FREQUENT, retry: false });

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

  const openCount = tickets?.filter((t) => t.status === "open").length || 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>Help &amp; Support</h2>
        <p style={{ fontSize: 14, color: T.sub }}>Ask a question or report an issue — our team replies within 24 hours</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["new", "history"] as const).map((v) => (
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
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase" }}>Subject</p>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. I'm not receiving alerts" style={inputStyle} maxLength={120} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase" }}>Message</p>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your issue or question in detail…"
                rows={5} style={{ ...inputStyle, resize: "vertical" as any, fontFamily: "inherit" }} maxLength={2000} />
              <p style={{ fontSize: 11, color: "var(--muted-foreground)", textAlign: "right", marginTop: 4 }}>{message.length}/2000</p>
            </div>
            <button
              onClick={() => submitM.mutate()}
              disabled={submitM.isPending || !subject.trim() || !message.trim()}
              style={{ background: "var(--primary)", color: "var(--primary-foreground)", border: "none", borderRadius: 99, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: submitM.isPending || !subject.trim() || !message.trim() ? "not-allowed" : "pointer", opacity: submitM.isPending || !subject.trim() || !message.trim() ? 0.6 : 1, display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
              {submitM.isPending ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Sending…</> : <><SendHorizonal style={{ width: 14, height: 14 }} /> Send Request</>}
            </button>
          </div>
        </div>
      ) : (
        <div>
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...Array(3)].map((_, i) => <div key={i} style={{ ...cardStyle, height: 80, borderRadius: 14 }} />)}
            </div>
          ) : !tickets || tickets.length === 0 ? (
            <div style={{ ...cardStyle, padding: 48, textAlign: "center", borderStyle: "dashed" }}>
              <HelpCircle style={{ width: 32, height: 32, color: "var(--muted-foreground)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", marginBottom: 6 }}>No tickets yet</p>
              <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>Submit a request and we'll reply here.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tickets.map((t) => (
                <div key={t.id} style={{ ...cardStyle, borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{t.subject}</p>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, textTransform: "uppercase", flexShrink: 0,
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
                        <p style={{ fontSize: 11, fontWeight: 700, color: T.emerald, textTransform: "uppercase" }}>Admin Reply</p>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--foreground)" }}>{t.adminReply}</p>
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 10 }}>
                    <Clock style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
                    {fmtShort(t.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Support() {
  return <Shell active="support"><SupportContent /></Shell>;
}
