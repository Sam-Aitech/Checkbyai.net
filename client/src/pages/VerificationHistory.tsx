import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

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
    bg: "bg-green-100 dark:bg-green-900/40",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-200 dark:border-green-800",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  suspicious: {
    label: "Suspicious",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  fake: {
    label: "Fake",
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
    icon: <XCircle className="w-4 h-4" />,
  },
};

function SkeletonCard() {
  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function VerificationCard({ v }: { v: Verification }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const config = resultConfig[v.result] || resultConfig.fake;
  const confidencePercent = Math.round(v.confidence * 100);
  const date = new Date(v.verifiedAt);
  const passedChecks = v.checks.filter((c) => c.passed).length;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied", description: `${label} copied to clipboard` });
    });
  };

  const truncatedFilename =
    v.filename.length > 40 ? v.filename.slice(0, 37) + "..." : v.filename;

  const severityStyles: Record<string, { bg: string; text: string }> = {
    critical: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-600 dark:text-red-400" },
    warning: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-600 dark:text-amber-400" },
    info: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-600 dark:text-blue-400" },
  };

  return (
    <Card className={`border ${config.border} transition-shadow hover:shadow-md`}>
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <h3 className="font-semibold text-gray-900 dark:text-white truncate" title={v.filename}>
                {truncatedFilename}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-2">
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
                <span className="text-xs text-gray-400 dark:text-gray-500">Receipt:</span>
                <span className="text-xs font-mono text-gray-600 dark:text-gray-300">{v.receiptId}</span>
                <button
                  onClick={() => copyToClipboard(v.receiptId!, "Receipt ID")}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {(v.adminStatus === "approved" || v.adminStatus === "fake") && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                v.adminStatus === "approved"
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                  : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
              }`}>
                <Shield className="w-3 h-3" />
                {v.adminStatus === "approved" ? "Admin Approved" : "Admin Flagged"}
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
              {config.icon}
              {config.label}
            </span>
          </div>
        </div>

        {v.checks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {expanded ? "Hide" : "Show"} check details ({v.checks.length})
            </button>

            {expanded && (
              <div className="mt-3 space-y-2">
                {v.checks.map((check, idx) => {
                  const sev = severityStyles[check.severity] || severityStyles.info;
                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 px-3 py-2 rounded-lg ${
                        check.passed
                          ? "bg-green-50/50 dark:bg-green-950/20"
                          : "bg-red-50/50 dark:bg-red-950/20"
                      }`}
                    >
                      {check.passed ? (
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{check.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${sev.bg} ${sev.text}`}>
                            {check.severity}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{check.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerificationHistory() {
  const { data: user, isLoading: userLoading } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const { data: verifications, isLoading: dataLoading } = useQuery<Verification[]>({
    queryKey: ["/api/my-verifications"],
    enabled: !!user,
  });

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
        <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="max-w-4xl mx-auto px-4 py-12">
            <Skeleton className="h-10 w-48 mb-6" />
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-5 w-80 mb-8" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
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
        <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
          <Card className="max-w-md mx-4 border border-gray-200 dark:border-gray-700">
            <CardContent className="p-8 text-center">
              <LogIn className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Login Required</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Please log in to view your verification history and audit trail.
              </p>
              <Link href="/login">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  <LogIn className="w-4 h-4 mr-2" />
                  Log In
                </Button>
              </Link>
            </CardContent>
          </Card>
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
      <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <History className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Verification History</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">Your document verification audit trail</p>
        </div>

        {dataLoading ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
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
              <Card className="border border-gray-200 dark:border-gray-700">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total</p>
                </CardContent>
              </Card>
              <Card className="border border-green-200 dark:border-green-800">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{genuineCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Genuine</p>
                </CardContent>
              </Card>
              <Card className="border border-amber-200 dark:border-amber-800">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{suspiciousCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Suspicious</p>
                </CardContent>
              </Card>
              <Card className="border border-red-200 dark:border-red-800">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{fakeCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Fake</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {verifications.map((v) => (
                <VerificationCard key={v.id} v={v} />
              ))}
            </div>
          </>
        ) : (
          <Card className="border border-gray-200 dark:border-gray-700">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No verifications yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                You haven't verified any documents yet. Upload a document to get started with your first verification.
              </p>
              <Link href="/dashboard">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Shield className="w-4 h-4 mr-2" />
                  Verify a Document
                </Button>
              </Link>
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
