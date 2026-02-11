import { useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, Shield, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import FeedbackForm from "./FeedbackForm";

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
      gradient: "from-emerald-500 via-green-500 to-teal-500",
      bgLight: "bg-green-50",
      bgDark: "dark:bg-green-950/30",
      border: "border-green-200 dark:border-green-800",
      textColor: "text-green-700 dark:text-green-300",
      icon: <CheckCircle className="w-6 h-6" />,
      ringColor: "text-emerald-500",
    },
    suspicious: {
      label: "Suspicious",
      gradient: "from-amber-500 via-orange-500 to-yellow-500",
      bgLight: "bg-amber-50",
      bgDark: "dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      textColor: "text-amber-700 dark:text-amber-300",
      icon: <AlertTriangle className="w-6 h-6" />,
      ringColor: "text-amber-500",
    },
    fake: {
      label: "Fake",
      gradient: "from-red-500 via-rose-500 to-pink-500",
      bgLight: "bg-red-50",
      bgDark: "dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-800",
      textColor: "text-red-700 dark:text-red-300",
      icon: <XCircle className="w-6 h-6" />,
      ringColor: "text-red-500",
    },
  };

  const config = statusConfig[result.type] || statusConfig.fake;

  const circumference = 2 * Math.PI * 40;
  const strokeOffset = circumference - (result.confidence * circumference);

  const severityConfig = {
    critical: { color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40", label: "Critical" },
    warning: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40", label: "Warning" },
    info: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/40", label: "Info" },
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
    <div className="space-y-4">
      {/* Result Header */}
      <Card className={`overflow-hidden border ${config.border}`}>
        <div className={`bg-gradient-to-r ${config.gradient} p-1`}>
          <div className={`${config.bgLight} ${config.bgDark} p-5 sm:p-6`}>
            <div className="flex flex-col sm:flex-row items-center gap-5">
              {/* Circular Progress */}
              <div className="relative flex-shrink-0">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" className="text-gray-200 dark:text-gray-700" />
                  <circle
                    cx="50" cy="50" r="40" fill="none" strokeWidth="6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                    className={`${config.ringColor} transition-all duration-1000 ease-out`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xl font-bold ${config.textColor}`}>{confidencePercent}%</span>
                </div>
              </div>

              {/* Status Info */}
              <div className="text-center sm:text-left flex-1">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <div className={config.textColor}>{config.icon}</div>
                  <h3 className={`text-2xl font-bold ${config.textColor}`}>
                    Document is {config.label}
                  </h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  AI confidence: {confidencePercent}% — {totalChecks > 0 ? `${passedCount} of ${totalChecks} checks passed` : "Analysis complete"}
                </p>
              </div>

              {/* Badge */}
              <div className={`px-4 py-2 rounded-full bg-gradient-to-r ${config.gradient} text-white font-semibold text-sm shadow-lg flex-shrink-0`}>
                <div className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4" />
                  {config.label}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Receipt Card */}
      {(result.receiptId || result.documentHash) && (
        <Card className="border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Verification Receipt</h4>
            </div>
            <div className="space-y-2">
              {result.receiptId && (
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Receipt ID</span>
                    <span className="text-sm font-mono text-gray-800 dark:text-gray-200">{result.receiptId}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.receiptId!, "Receipt ID")} className="h-8 w-8 p-0">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              {result.documentHash && (
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Document Hash</span>
                    <span className="text-sm font-mono text-gray-800 dark:text-gray-200">
                      {result.documentHash.length > 16 ? `${result.documentHash.slice(0, 8)}...${result.documentHash.slice(-8)}` : result.documentHash}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.documentHash!, "Document Hash")} className="h-8 w-8 p-0">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Forensic Checks Breakdown */}
      {checks.length > 0 && (
        <Card className="border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Forensic Checks Breakdown</h4>
            </div>
            <div className="space-y-2">
              {checks.map((check, index) => {
                const sev = severityConfig[check.severity] || severityConfig.info;
                const isExpanded = expandedChecks[index];
                return (
                  <div key={index} className={`rounded-lg border transition-colors ${check.passed ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"}`}>
                    <button
                      onClick={() => toggleCheck(index)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {check.passed ? (
                          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{check.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${sev.bg} ${sev.color}`}>
                          {sev.label}
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-0">
                        <p className="text-sm text-gray-600 dark:text-gray-400 ml-8">{check.message}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confidence Score Explanation */}
      {totalChecks > 0 && (
        <Card className="border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Confidence Score Explanation</h4>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${config.gradient} transition-all duration-1000 ease-out`}
                    style={{ width: `${confidencePercent}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-12 text-right">{confidencePercent}%</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {passedCount} out of {totalChecks} forensic checks passed. 
                {passedCount === totalChecks && " All checks passed successfully, indicating a high confidence in document authenticity."}
                {passedCount > 0 && passedCount < totalChecks && ` ${totalChecks - passedCount} check${totalChecks - passedCount > 1 ? "s" : ""} flagged potential issues, reducing overall confidence.`}
                {passedCount === 0 && " No checks passed, indicating significant concerns about this document."}
              </p>
              <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  <span>{passedCount} passed</span>
                </div>
                <div className="flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                  <span>{totalChecks - passedCount} failed</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mismatched Fields */}
      {result.mismatchedFields && result.mismatchedFields.length > 0 && (
        <Card className="border border-amber-200 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300">Mismatched Fields</h4>
            </div>
            <ul className="space-y-1.5">
              {result.mismatchedFields.map((field, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  {field}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* What This Means */}
      <Card className={`border ${config.border}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">What This Means</h4>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {getExplanation()}
          </p>
        </CardContent>
      </Card>

      {/* Feedback Section */}
      <Card className="border border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFeedback(!showFeedback)}
            className="w-full flex items-center justify-center space-x-2"
            data-testid="toggle-feedback"
          >
            <span>Rate this verification</span>
            {showFeedback ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          
          {showFeedback && (
            <div className="mt-4">
              <FeedbackForm 
                verificationId={verificationId}
                onSubmitSuccess={() => setShowFeedback(false)}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
