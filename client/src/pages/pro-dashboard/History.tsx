/**
 * Pro Dashboard — History (CoS verification history)
 * Migrated from the old ProDashboard.tsx HistoryTab, unchanged behavior.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { STALE_TIMES } from "@/lib/queryDefaults";
import { useToast } from "@/hooks/use-toast";
import { Shell, T, cardStyle } from "./index";
import { useAccountSummary } from "./hooks/useAccountSummary";
import {
  FileText, Clock, Shield, BarChart3, ChevronDown, Copy,
  CheckCircle2, AlertTriangle, XCircle, Crown,
} from "lucide-react";

interface Verification {
  id: number; receiptId: string | null; documentHash: string | null;
  filename: string; result: "genuine" | "suspicious" | "fake";
  confidence: number; verifiedAt: string; adminStatus: string;
  checks: Array<{ name: string; passed: boolean; severity: string; message: string }>;
}

const fmtShort = (s: string) => { const d = new Date(s); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); };

function HistoryContent() {
  const { toast } = useToast();
  const { hasCosAccess } = useAccountSummary();
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: verifs, isLoading } = useQuery<Verification[]>({ queryKey: ["/api/my-verifications"], staleTime: STALE_TIMES.NORMAL, retry: false, enabled: hasCosAccess });

  const copy = (text: string, label: string) => navigator.clipboard.writeText(text).then(() => toast({ title: "Copied", description: `${label} copied` }));

  const RC = {
    genuine:    { bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.18)", icon: "#6EE7B7", label: "Genuine",    Icon: CheckCircle2 },
    suspicious: { bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.18)", icon: "#FCD34D", label: "Suspicious", Icon: AlertTriangle },
    fake:       { bg: "rgba(239,68,68,0.07)",  border: "rgba(239,68,68,0.18)",  icon: "#FCA5A5", label: "Fake",       Icon: XCircle },
  } as const;

  const total = verifs?.length || 0;
  const genuine = verifs?.filter((v) => v.result === "genuine").length || 0;
  const flagged = verifs?.filter((v) => v.result !== "genuine").length || 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>Verification History</h2>
        <p style={{ fontSize: 14, color: T.sub }}>All CoS documents you've submitted for AI verification</p>
      </div>

      {!hasCosAccess ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", borderStyle: "dashed", borderColor: T.violetBorder }}>
          <Crown style={{ width: 32, height: 32, color: T.violet, margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No CoS verifications yet</p>
          <p style={{ fontSize: 14, color: T.sub, marginBottom: 20 }}>CoS Check is a separate product from Alert Pass — see Account for options.</p>
          <a href="/pro-dashboard/account" style={{ background: "var(--primary)", color: "var(--primary-foreground)", padding: "10px 22px", borderRadius: 99, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>View Account</a>
        </div>
      ) : (
        <>
          {total > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Total Verified", val: total, col: "var(--muted-foreground)", bg: "var(--secondary)" },
                { label: "Genuine", val: genuine, col: T.emerald, bg: "rgba(16,185,129,0.07)" },
                { label: "Flagged", val: flagged, col: T.amber, bg: "rgba(245,158,11,0.07)" },
              ].map((s) => (
                <div key={s.label} style={{ background: s.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px" }}>
                  <p style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>{s.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: s.col }}>{s.val}</p>
                </div>
              ))}
            </div>
          )}

          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...Array(5)].map((_, i) => <div key={i} style={{ ...cardStyle, height: 72, borderRadius: 16 }} />)}
            </div>
          ) : !verifs || verifs.length === 0 ? (
            <div style={{ ...cardStyle, padding: 48, textAlign: "center", borderStyle: "dashed" }}>
              <FileText style={{ width: 32, height: 32, color: T.muted, margin: "0 auto 12px" }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No verifications yet</p>
              <p style={{ fontSize: 14, color: T.sub }}>Your CoS verification history will appear here.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {verifs.map((v) => {
                const rc = RC[v.result] || RC.fake;
                const RI = rc.Icon;
                const pct = Math.round(v.confidence * 100);
                const passed = v.checks?.filter((c) => c.passed).length ?? 0;
                const totalChecks = v.checks?.length ?? 0;
                const isOpen = expanded === v.id;

                return (
                  <div key={v.id} style={{ background: rc.bg, border: `1px solid ${rc.border}`, borderRadius: 16, overflow: "hidden" }}>
                    <button onClick={() => setExpanded(isOpen ? null : v.id)}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer", width: "100%", background: "transparent", border: "none", textAlign: "left" }}>
                      <RI style={{ width: 18, height: 18, color: rc.icon, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {v.filename.length > 48 ? v.filename.slice(0, 45) + "…" : v.filename}
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 3 }}><Clock style={{ width: 11, height: 11 }} />{fmtShort(v.verifiedAt)}</span>
                          {totalChecks > 0 && <span style={{ fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 3 }}><Shield style={{ width: 11, height: 11 }} />{passed}/{totalChecks} checks</span>}
                          <span style={{ fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 3 }}><BarChart3 style={{ width: 11, height: 11 }} />{pct}% confidence</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ background: "var(--secondary)", border: `1px solid ${rc.border}`, color: rc.icon, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, textTransform: "uppercase" }}>{rc.label}</span>
                        <ChevronDown style={{ width: 14, height: 14, color: T.muted, transform: isOpen ? "rotate(180deg)" : "none" }} />
                      </div>
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden", borderTop: `1px solid ${rc.border}` }}>
                          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                            {v.receiptId && (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, color: T.muted }}>Receipt ID:</span>
                                <span style={{ fontSize: 12, fontFamily: "monospace", color: T.sub }}>{v.receiptId}</span>
                                <button onClick={() => copy(v.receiptId!, "Receipt ID")} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 0, display: "flex" }}>
                                  <Copy style={{ width: 12, height: 12 }} />
                                </button>
                              </div>
                            )}
                            {v.checks && v.checks.length > 0 && (
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Check Details</p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                  {v.checks.map((ch, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      {ch.passed ? <CheckCircle2 style={{ width: 13, height: 13, color: T.emerald, flexShrink: 0 }} /> : <XCircle style={{ width: 13, height: 13, color: T.red, flexShrink: 0 }} />}
                                      <span style={{ fontSize: 13, color: ch.passed ? T.sub : T.text, fontWeight: ch.passed ? 400 : 500 }}>{ch.name}</span>
                                      {!ch.passed && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: ch.severity === "critical" ? T.red : ch.severity === "warning" ? T.amber : T.cyan, textTransform: "uppercase" }}>{ch.severity}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function History() {
  return <Shell active="history"><HistoryContent /></Shell>;
}
