import { useState, useRef, memo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, AnimatePresence } from "framer-motion";
import { useInView } from "react-intersection-observer";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  Copy,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
  LogIn,
  History,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

interface VerificationCheck {
  name: string;
  passed: boolean;
  severity: string;
  message: string;
}

interface Verification {
  id: number;
  receiptId: string | null;
  documentHash: string | null;
  filename: string;
  result: "genuine" | "suspicious" | "fake";
  confidence: number;
  verifiedAt: string;
  adminStatus: string;
  checks: VerificationCheck[];
}

const resultConfig = {
  genuine: {
    label: "Genuine",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/20",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  suspicious: {
    label: "Suspicious",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/20",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  fake: {
    label: "Fake",
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500/20",
    icon: <XCircle className="w-4 h-4" />,
  },
};

function SkeletonCard() {
  return (
    <div className="border border-border rounded-xl bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
    </div>
  );
}

const VerificationCard = memo(function VerificationCard({ v, index }: { v: Verification; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const config = resultConfig[v.result] || resultConfig.fake;
  const confidencePercent = Math.round(v.confidence * 100);
  const date = new Date(v.verifiedAt);
  const passedChecks = v.checks.filter((c) => c.passed).length;
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied", description: `${label} copied to clipboard` });
    });
  };

  const truncatedFilename =
    v.filename.length > 40 ? v.filename.slice(0, 37) + "..." : v.filename;

  const severityStyles: Record<string, { bg: string; text: string }> = {
    critical: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
    warning: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
    info: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  };

  return (
    <motion.div
      ref={ref as any}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ ...spring, delay: Math.min(index * 0.02, 0.3) }}
    >
      <div className="border border-border rounded-xl bg-card p-5 transition-shadow hover:shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <h3 className="font-semibold text-foreground truncate" title={v.filename}>
                {truncatedFilename}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5" />
                {confidencePercent}% confidence
              </span>
              {v.checks.length > 0 && (
                <span className="flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  {passedChecks}/{v.checks.length} checks passed
                </span>
              )}
            </div>

            {v.receiptId && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">Receipt:</span>
                <span className="text-xs font-mono text-foreground">{v.receiptId}</span>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => copyToClipboard(v.receiptId!, "Receipt ID")}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {(v.adminStatus === "approved" || v.adminStatus === "fake") && (
              <span className={`editorial-caption inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${
                v.adminStatus === "approved"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}>
                <Shield className="w-3 h-3" />
                {v.adminStatus === "approved" ? "Admin Approved" : "Admin Flagged"}
              </span>
            )}
            <span className={`editorial-caption inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${config.bg} ${config.text}`}>
              {config.icon}
              {config.label}
            </span>
          </div>
        </div>

        {v.checks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {expanded ? "Hide" : "Show"} check details ({v.checks.length})
            </motion.button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring}
                  className="mt-3 space-y-2 overflow-hidden"
                >
                  {v.checks.map((check, idx) => {
                    const sev = severityStyles[check.severity] || severityStyles.info;
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-3 px-3 py-2 rounded-xl ${
                          check.passed
                            ? "bg-emerald-500/5"
                            : "bg-red-500/5"
                        }`}
                      >
                        {check.passed ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{check.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${sev.bg} ${sev.text}`}>
                              {check.severity}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
});
export default function VerificationHistory() {
  const { data: user, isLoading: userLoading } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const { data: verifications, isLoading: dataLoading } = useQuery<Verification[]>({
    queryKey: ["/api/my-verifications"],
    enabled: !!user,
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({ count: verifications?.length ?? 0, getScrollElement: () => parentRef.current, estimateSize: () => 160, overscan: 5 });
  const [headerRef, headerInView] = useInView({ triggerOnce: true, threshold: 0.1 });

  const genuineCount = verifications?.filter((v) => v.result === "genuine").length ?? 0;
  const suspiciousCount = verifications?.filter((v) => v.result === "suspicious").length ?? 0;
  const fakeCount = verifications?.filter((v) => v.result === "fake").length ?? 0;
  const totalCount = verifications?.length ?? 0;

  if (userLoading) {
    return (
      <PageLayout>
        <SEOHead
          title="Verification History | Your Audit Trail | Check By AI"
          description="View your past Certificate of Sponsorship verifications. Access receipts, confidence scores, and forensic analysis details for every document you've checked."
          keywords="verification history, CoS audit trail, document verification records, verification receipts"
          canonicalUrl="https://checkbyai.net/history"
        />
        <div className="bg-background">
          <div className="max-w-4xl mx-auto px-4 py-12">
            <Skeleton className="h-10 w-48 mb-6" />
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-5 w-80 mb-8" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="border border-border rounded-xl bg-card p-5">
                  <Skeleton className="h-24" />
                </div>
              ))}
            </div>
            {[...Array(3)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    return (
      <PageLayout>
        <SEOHead
          title="Verification History | Your Audit Trail | Check By AI"
          description="View your past Certificate of Sponsorship verifications. Access receipts, confidence scores, and forensic analysis details for every document you've checked."
          keywords="verification history, CoS audit trail, document verification records, verification receipts"
          canonicalUrl="https://checkbyai.net/history"
        />
        <div className="bg-background flex items-center justify-center">
          <div className="border border-border rounded-xl bg-card max-w-md mx-4 p-8 text-center">
            <LogIn className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="editorial-subheading text-xl text-foreground mb-2">Login Required</h2>
            <p className="text-muted-foreground editorial-body mb-6">
              Please log in to view your verification history and audit trail.
            </p>
            <Link href="/login">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full">
                <LogIn className="w-4 h-4 mr-2" />
                Log In
              </Button>
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <SEOHead
        title="Verification History | Your Audit Trail | Check By AI"
        description="View your past Certificate of Sponsorship verifications. Access receipts, confidence scores, and forensic analysis details for every document you've checked."
        keywords="verification history, CoS audit trail, document verification records, verification receipts"
        canonicalUrl="https://checkbyai.net/history"
      />
      <div className="bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <motion.div
            ref={headerRef}
            initial={{ opacity: 0, y: 30 }}
            animate={headerInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={spring}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <History className="w-8 h-8 text-foreground" />
              <h1 className="editorial-heading text-5xl md:text-6xl text-foreground">Verification History</h1>
            </div>
            <p className="text-muted-foreground editorial-body">Your document verification audit trail</p>
          </motion.div>

        {dataLoading ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="border border-border rounded-xl bg-card p-5">
                  <Skeleton className="h-24" />
                </div>
              ))}
            </div>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </>
        ) : verifications && verifications.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="border border-border rounded-xl bg-card p-5 text-center">
                <p className="text-foreground text-2xl font-bold">{totalCount}</p>
                <p className="editorial-caption text-muted-foreground mt-1">Total</p>
              </div>
              <div className="border border-border rounded-xl bg-card p-5 text-center">
                <p className="text-emerald-600 dark:text-emerald-400 text-2xl font-bold">{genuineCount}</p>
                <p className="editorial-caption text-muted-foreground mt-1">Genuine</p>
              </div>
              <div className="border border-border rounded-xl bg-card p-5 text-center">
                <p className="text-amber-600 dark:text-amber-400 text-2xl font-bold">{suspiciousCount}</p>
                <p className="editorial-caption text-muted-foreground mt-1">Suspicious</p>
              </div>
              <div className="border border-border rounded-xl bg-card p-5 text-center">
                <p className="text-red-600 dark:text-red-400 text-2xl font-bold">{fakeCount}</p>
                <p className="editorial-caption text-muted-foreground mt-1">Fake</p>
              </div>
            </div>

            <div ref={parentRef} className="max-h-[720px] overflow-auto">
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const v = verifications![virtualRow.index];
                  return (
                    <div key={v.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, paddingBottom: '12px' }}>
                      <VerificationCard v={v} index={virtualRow.index} />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="border border-border rounded-xl bg-card p-12 text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="editorial-subheading text-xl text-foreground mb-2">No verifications yet</h3>
            <p className="text-muted-foreground editorial-body mb-6 max-w-md mx-auto">
              You haven't verified any documents yet. Upload a document to get started with your first verification.
            </p>
            <Link href="/dashboard">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full">
                <Shield className="w-4 h-4 mr-2" />
                Verify a Document
              </Button>
            </Link>
          </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
