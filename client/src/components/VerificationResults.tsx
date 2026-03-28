import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, AlertTriangle, Info, Shield, Copy, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import FeedbackForm from "./FeedbackForm";

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

interface VerificationResultsProps {
  result: {
    type: 'genuine' | 'suspicious' | 'fake';
    confidence: number;
    mismatchedFields?: string[];
    checks?: Array<{
      name: string;
      passed: boolean;
      severity: 'critical' | 'warning' | 'info';
      message: string;
    }>;
    receiptId?: string;
    documentHash?: string;
  };
  verificationId?: number;
}

export default function VerificationResults({ result, verificationId }: VerificationResultsProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [expandedChecks, setExpandedChecks] = useState<Record<number, boolean>>({});
  const { toast } = useToast();

  const checks = result.checks || [];
  const passedCount = checks.filter(c => c.passed).length;
  const totalChecks = checks.length;
  const confidencePercent = Math.round(result.confidence * 100);

  const toggleCheck = (index: number) => {
    setExpandedChecks(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied", description: `${label} copied to clipboard` });
    });
  };

  const statusConfig = {
    genuine: {
      label: "Genuine",
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/5 dark:bg-emerald-500/10",
      border: "border-emerald-500/20",
      badgeBg: "bg-emerald-500",
      icon: <CheckCircle className="w-5 h-5" />,
    },
    suspicious: {
      label: "Suspicious",
      accent: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/5 dark:bg-amber-500/10",
      border: "border-amber-500/20",
      badgeBg: "bg-amber-500",
      icon: <AlertTriangle className="w-5 h-5" />,
    },
    fake: {
      label: "Fake",
      accent: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/5 dark:bg-red-500/10",
      border: "border-red-500/20",
      badgeBg: "bg-red-500",
      icon: <XCircle className="w-5 h-5" />,
    },
  };

  const config = statusConfig[result.type] || statusConfig.fake;

  const circumference = 2 * Math.PI * 40;
  const strokeOffset = circumference - (result.confidence * circumference);

  const severityConfig = {
    critical: { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", label: "Critical" },
    warning: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", label: "Warning" },
    info: { color: "text-primary", bg: "bg-primary/10", label: "Info" },
  };

  const getExplanation = () => {
    switch (result.type) {
      case 'genuine':
        return "This document has passed our forensic analysis and appears to be authentic. The metadata, structure, and security features are consistent with genuine documents. You can proceed with confidence, but always verify important documents through official channels as well.";
      case 'suspicious':
        return "This document shows some irregularities that warrant caution. While it may still be legitimate, certain checks have flagged potential issues. We recommend verifying this document through official UKVI channels before relying on it for any immigration application.";
      case 'fake':
        return "This document has failed critical verification checks and shows strong indicators of being fabricated or heavily altered. Do not rely on this document for any official purpose. If you received this from an employer or agent, exercise extreme caution and report it to the appropriate authorities.";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="space-y-4"
    >
      <div className={`border border-border rounded-xl overflow-hidden ${config.bg}`}>
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative flex-shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="4" className="text-border" />
                <motion.circle
                  cx="50" cy="50" r="40" fill="none" strokeWidth="4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: strokeOffset }}
                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                  className={config.accent}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xl font-black tracking-tight ${config.accent}`}>{confidencePercent}%</span>
              </div>
            </div>

            <div className="text-center sm:text-left flex-1">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <span className={config.accent}>{config.icon}</span>
                <h3 className={`text-xl editorial-subheading ${config.accent}`}>
                  Document is {config.label}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                AI confidence: {confidencePercent}%, {totalChecks > 0 ? `${passedCount} of ${totalChecks} checks passed` : "Analysis complete"}
              </p>
            </div>

            <div className={`editorial-caption px-4 py-2 rounded-full ${config.badgeBg} text-white flex-shrink-0 relative overflow-hidden`}>
              <div className="relative z-10 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                {config.label}
              </div>
            </div>
          </div>
        </div>
      </div>

      {(result.receiptId || result.documentHash) && (
        <Card className="border border-border rounded-xl shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h4 className="editorial-caption text-muted-foreground">Verification Receipt</h4>
            </div>
            <div className="space-y-2">
              {result.receiptId && (
                <div className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase tracking-widest">Receipt ID</span>
                    <span className="text-sm font-mono text-foreground">{result.receiptId}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.receiptId!, "Receipt ID")} className="h-8 w-8 p-0 rounded-xl">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              {result.receiptId && (
                <a
                  href={`/receipt/${result.receiptId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline px-1 pt-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View shareable receipt page
                </a>
              )}
              {result.documentHash && (
                <div className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase tracking-widest">Document Hash</span>
                    <span className="text-sm font-mono text-foreground">
                      {result.documentHash.length > 16 ? `${result.documentHash.slice(0, 8)}...${result.documentHash.slice(-8)}` : result.documentHash}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.documentHash!, "Document Hash")} className="h-8 w-8 p-0 rounded-xl">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {checks.length > 0 && (
        <Card className="border border-border rounded-xl shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-muted-foreground" />
              <h4 className="editorial-caption text-muted-foreground">Forensic Checks</h4>
            </div>
            <div className="space-y-1.5">
              {checks.map((check, index) => {
                const sev = severityConfig[check.severity] || severityConfig.info;
                const isExpanded = expandedChecks[index];
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...spring, delay: index * 0.05 }}
                    className={`border border-border rounded-xl transition-colors ${check.passed ? "bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04]" : "bg-red-500/[0.02] dark:bg-red-500/[0.04]"}`}
                  >
                    <button
                      onClick={() => toggleCheck(index)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {check.passed ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-foreground truncate">{check.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase flex-shrink-0 ${sev.bg} ${sev.color}`}>
                          {sev.label}
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={spring}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3 pt-0">
                            <p className="text-sm text-muted-foreground ml-7">{check.message}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {totalChecks > 0 && (
        <Card className="border border-border rounded-xl shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h4 className="editorial-caption text-muted-foreground">Confidence Score</h4>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${config.badgeBg}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${confidencePercent}%` }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
                  />
                </div>
                <span className="text-sm font-bold text-foreground w-12 text-right">{confidencePercent}%</span>
              </div>
              <p className="text-sm text-muted-foreground editorial-body">
                {passedCount} out of {totalChecks} forensic checks passed. 
                {passedCount === totalChecks && " All checks passed successfully, indicating a high confidence in document authenticity."}
                {passedCount > 0 && passedCount < totalChecks && ` ${totalChecks - passedCount} check${totalChecks - passedCount > 1 ? "s" : ""} flagged potential issues.`}
                {passedCount === 0 && " No checks passed, indicating significant concerns about this document."}
              </p>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                  <span>{passedCount} passed</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <XCircle className="w-3 h-3 text-red-500" />
                  <span>{totalChecks - passedCount} failed</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result.mismatchedFields && result.mismatchedFields.length > 0 && (
        <Card className="border border-border border-amber-500/20 rounded-xl shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h4 className="editorial-caption text-amber-600 dark:text-amber-400">Mismatched Fields</h4>
            </div>
            <ul className="space-y-1.5">
              {result.mismatchedFields.map((field, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <XCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  {field}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className={`border border-border ${config.border} rounded-xl shadow-none`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-muted-foreground" />
            <h4 className="editorial-caption text-muted-foreground">What This Means</h4>
          </div>
          <p className="text-sm text-muted-foreground editorial-body">
            {getExplanation()}
          </p>
        </CardContent>
      </Card>

      <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl">
        <div className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed font-medium mb-1">
              Technical Analysis Only — Not Legal or Immigration Advice
            </p>
            <p className="text-[11px] text-blue-700 dark:text-blue-400 leading-relaxed">
              This is a forensic analysis of document metadata and structure only. It does not constitute legal or immigration advice and should not be used as the sole basis for any immigration decision. If you have concerns about a document, consult an{' '}
              <a
                href="https://www.gov.uk/find-immigration-adviser"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold"
              >
                OISC-registered adviser or solicitor
              </a>.
              {' '}<a href="mailto:support@checkbyai.net?subject=Contest%20Verification%20Result" className="underline font-semibold">Contest this result</a>.
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 bg-primary/[0.03] dark:bg-primary/[0.06] border border-border rounded-xl">
        <div className="flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            UK GDPR and Data Protection Act 2018: Your original document has been permanently deleted from our servers. Only metadata was processed. Free users: these results will not be saved. Paid account holders: only the verification result is retained for your records.
          </p>
        </div>
      </div>

      <Card className="border border-border rounded-xl shadow-none">
        <CardContent className="p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFeedback(!showFeedback)}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border"
            data-testid="toggle-feedback"
          >
            <span className="text-xs font-medium">Rate this verification</span>
            {showFeedback ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          
          <AnimatePresence>
            {showFeedback && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={spring}
                className="overflow-hidden"
              >
                <div className="mt-4">
                  <FeedbackForm 
                    verificationId={verificationId}
                    onSubmitSuccess={() => setShowFeedback(false)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
