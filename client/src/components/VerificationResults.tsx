import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CheckCircle, XCircle, AlertTriangle, Info, Shield, Copy, ChevronDown, ChevronUp, Lock, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import FeedbackForm from "./FeedbackForm";

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

interface VerificationResultsProps {
  result: {
    type: 'genuine' | 'suspicious' | 'fake' | 'inconclusive';
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
  const shouldReduceMotion = useReducedMotion();
  const entrance = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: spring };

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
      accent: "text-success",
      bg: "bg-success/5",
      border: "border-success/20",
      pillBg: "bg-success/10",
      pillBorder: "border-success/30",
      solid: "bg-success",
      icon: <CheckCircle className="w-5 h-5" aria-hidden="true" />,
    },
    suspicious: {
      label: "Suspicious",
      accent: "text-warning",
      bg: "bg-warning/5",
      border: "border-warning/20",
      pillBg: "bg-warning/10",
      pillBorder: "border-warning/30",
      solid: "bg-warning",
      icon: <AlertTriangle className="w-5 h-5" aria-hidden="true" />,
    },
    fake: {
      label: "Fake",
      accent: "text-destructive",
      bg: "bg-destructive/5",
      border: "border-destructive/20",
      pillBg: "bg-destructive/10",
      pillBorder: "border-destructive/30",
      solid: "bg-destructive",
      icon: <XCircle className="w-5 h-5" aria-hidden="true" />,
    },
    inconclusive: {
      label: "Needs human review",
      accent: "text-info",
      bg: "bg-info/5",
      border: "border-info/20",
      pillBg: "bg-info/10",
      pillBorder: "border-info/30",
      solid: "bg-info",
      icon: <HelpCircle className="w-5 h-5" aria-hidden="true" />,
    },
  };

  // Fail closed to inconclusive — never render an unknown backend value as Fake.
  // Unknown/null/typo verdicts show a neutral "needs review" state and log.
  const config = (statusConfig as Record<string, (typeof statusConfig)['genuine']>)[result.type] || statusConfig.inconclusive;
  if (!(result.type in statusConfig)) {
    console.error('[VerificationResults] Unknown verdict type, showing inconclusive:', (result as { type: string }).type);
  }

  const circumference = 2 * Math.PI * 40;
  const strokeOffset = circumference - (result.confidence * circumference);

  const severityConfig = {
    critical: { color: "text-destructive", bg: "bg-destructive/10", label: "Critical" },
    warning: { color: "text-warning", bg: "bg-warning/10", label: "Warning" },
    info: { color: "text-info", bg: "bg-info/10", label: "Info" },
  };

  const getExplanation = () => {
    switch (result.type) {
      case 'genuine':
        return "No tampering detected in this file. This does not confirm your sponsor licence is still active or your CoS number is valid — check your sponsor on the GOV.UK register and confirm the CoS reference with your sponsor before applying.";
      case 'suspicious':
        return "This document shows some irregularities that warrant caution. While it may still be legitimate, certain checks have flagged potential issues. We recommend verifying this document through official UKVI channels before relying on it for any immigration application.";
      case 'fake':
        return "This is not your fault — scams are common, and checking was the right move. This document has failed critical verification checks and shows strong indicators of being fabricated or heavily altered. Do not submit it to the Home Office. See next steps below.";
      case 'inconclusive':
        return "We couldn't classify this document — do not act on this result alone. Re-upload a clearer PDF, or contact support. This is not a pass or fail.";
    }
  };

  return (
    <motion.div
      initial={entrance.initial}
      animate={entrance.animate}
      transition={entrance.transition}
      className="space-y-4"
    >
      <div className={`border border-border rounded-xl overflow-hidden ${config.bg}`}>
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative flex-shrink-0" role="img" aria-label={`Model certainty ${confidencePercent} out of 100 in ${config.label} verdict`}>
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
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
              <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <span className={`text-xl font-black tracking-tight ${config.accent}`}>{confidencePercent}%</span>
              </div>
            </div>

            <div className="text-center sm:text-left flex-1">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <span className={config.accent} aria-hidden="true">{config.icon}</span>
                <h2 role="status" aria-label={`Verdict: ${config.label}, model certainty ${confidencePercent} out of 100 in this verdict`} className={`text-xl editorial-subheading ${config.accent}`}>
                  Verdict: {config.label}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Model certainty: {confidencePercent}/100 in this verdict (not a genuineness score){totalChecks > 0 ? ` · ${passedCount} of ${totalChecks} checks passed` : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                AI document check only — not a Home Office decision. Only the Home Office can confirm a CoS reference for your visa.
              </p>
            </div>

            <div aria-hidden="true" className={`editorial-caption px-4 py-2 rounded-full border ${config.pillBg} ${config.pillBorder} ${config.accent} flex-shrink-0 relative overflow-hidden`}>
              <div className="relative z-10 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
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
                    <span className="text-xs text-muted-foreground block uppercase tracking-widest">Receipt ID</span>
                    <span className="text-sm font-mono text-foreground">{result.receiptId}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.receiptId!, "Receipt ID")} className="h-8 w-8 p-0 rounded-xl" aria-label={`Copy receipt ID ${result.receiptId}`}>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                </div>
              )}
              {result.receiptId && (
                <a
                  href={`/receipt/${result.receiptId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-info hover:underline px-1 pt-1"
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
                    <span className="text-xs text-muted-foreground block uppercase tracking-widest">Document Hash</span>
                    <span className="text-sm font-mono text-foreground">
                      {result.documentHash.length > 16 ? `${result.documentHash.slice(0, 8)}...${result.documentHash.slice(-8)}` : result.documentHash}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.documentHash!, "Document Hash")} className="h-8 w-8 p-0 rounded-xl" aria-label="Copy full document hash" title={result.documentHash}>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
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
                    className={`border border-border rounded-xl transition-colors ${check.passed ? "bg-success/[0.04]" : "bg-destructive/[0.04]"}`}
                  >
                    <button
                      onClick={() => toggleCheck(index)}
                      aria-expanded={!!isExpanded}
                      aria-controls={`check-panel-${index}`}
                      className="w-full flex items-center justify-between px-4 py-3 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {check.passed ? (
                          <CheckCircle className="w-4 h-4 text-success flex-shrink-0" aria-hidden="true" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive flex-shrink-0" aria-hidden="true" />
                        )}
                        <span className="text-sm font-medium text-foreground truncate">{check.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase flex-shrink-0 ${sev.bg} ${sev.color}`}>
                          {sev.label}
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />}
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          id={`check-panel-${index}`}
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
                    className={`h-full rounded-full ${config.solid}`}
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
                  <CheckCircle className="w-3 h-3 text-success" />
                  <span>{passedCount} passed</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <XCircle className="w-3 h-3 text-destructive" />
                  <span>{totalChecks - passedCount} failed</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result.mismatchedFields && result.mismatchedFields.length > 0 && (
        <Card className="border border-warning/20 rounded-xl shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <h4 className="editorial-caption text-warning">Mismatched Fields</h4>
            </div>
            <ul className="space-y-1.5">
              {result.mismatchedFields.map((field, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <XCircle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
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
            <Info className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <h4 className="editorial-caption text-muted-foreground">What This Means</h4>
          </div>
          <p className="text-sm text-muted-foreground editorial-body">
            {getExplanation()}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(result.type === 'suspicious' || result.type === 'inconclusive') && (
              <>
                <a href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline text-primary">Check sponsor on GOV.UK register</a>
                <a href="/what-to-do-fake-cos" className="text-xs font-semibold underline text-primary">What suspicious means</a>
                <a href="mailto:support@checkbyai.net?subject=Contest%20Verification%20Result" className="text-xs font-semibold underline text-primary">Contest result</a>
              </>
            )}
            {result.type === 'fake' && (
              <>
                <a href="/what-to-do-fake-cos" className="text-xs font-semibold underline text-destructive">What to do if your CoS is fake</a>
                <a href="https://www.actionfraud.police.uk/" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline text-primary">Report to Action Fraud (0300 123 2040)</a>
                <a href="https://www.gov.uk/find-immigration-adviser" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline text-primary">Find an OISC adviser</a>
              </>
            )}
            {result.type === 'genuine' && (
              <a href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline text-primary">Check sponsor on GOV.UK register before applying</a>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="px-4 py-3 bg-info/10 border border-info/20 rounded-xl">
        <div className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-info flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm text-info leading-relaxed font-semibold mb-1">
              Technical Analysis Only — Not Legal or Immigration Advice
            </p>
            <p className="text-sm text-info leading-relaxed">
              CheckByAI is independent and not the Home Office. Only the Home Office can confirm a CoS reference for your visa. This forensic analysis of metadata and structure does not constitute legal advice. If you have concerns, consult an{' '}
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
          <p className="text-xs text-muted-foreground leading-relaxed">
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
