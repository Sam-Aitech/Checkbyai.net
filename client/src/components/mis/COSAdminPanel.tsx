import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Shield, FileText, BarChart3, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { COSCheckResult } from "../../../../shared/mis-types";

const spring = { type: "spring" as const, stiffness: 120, damping: 18 };

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, icon, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CheckRow({ check }: { check: COSCheckResult["checks"][number] }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      {check.passed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{check.name}</span>
        <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
      </div>
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-sm font-mono break-all">
        {value !== null && value !== undefined ? String(value) : (
          <span className="text-muted-foreground/60 italic">—</span>
        )}
      </span>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

interface COSAdminPanelProps {
  result: COSCheckResult;
}

export default function COSAdminPanel({ result }: COSAdminPanelProps) {
  const passedCount = result.checks.filter(c => c.passed).length;

  const consistencyBadge = {
    MATCH: { label: "MATCH", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    MISMATCH: { label: "MISMATCH", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    XMP_ABSENT: { label: "XMP ABSENT", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  };
  const consistency = consistencyBadge[result.forensic.infoXmpConsistency];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.1 }}
      className="space-y-3 mt-4"
    >
      {/* Forensic summary bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Checks passed</span>
              <p className="font-semibold">{passedCount} / {result.checks.length}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Incremental updates</span>
              <p className="font-semibold">{result.forensic.incrementalUpdates}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Info/XMP consistency</span>
              <p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${consistency.cls}`}>
                  {consistency.label}
                </span>
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Tool fingerprint</span>
              <p className="font-semibold text-xs font-mono">{result.forensic.toolFingerprint}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checks */}
      <Section title="Authenticity Checks" icon={<Shield className="w-4 h-4" />} defaultOpen>
        {result.checks.map((check, i) => (
          <CheckRow key={i} check={check} />
        ))}
      </Section>

      {/* XMP Tags */}
      <Section title="XMP Tags" icon={<Tag className="w-4 h-4" />}>
        <KVRow label="dc:date"          value={result.xmpTags["dc:date"]} />
        <KVRow label="dc:format"        value={result.xmpTags["dc:format"]} />
        <KVRow label="dc:language"      value={result.xmpTags["dc:language"]} />
        <KVRow label="pdf:PDFVersion"   value={result.xmpTags["pdf:PDFVersion"]} />
        <KVRow label="pdf:Producer"     value={result.xmpTags["pdf:Producer"]} />
        <KVRow label="xmp:CreateDate"   value={result.xmpTags["xmp:CreateDate"]} />
        <KVRow label="xmp:CreatorTool"  value={result.xmpTags["xmp:CreatorTool"]} />
        <KVRow label="xmp:MetadataDate" value={result.xmpTags["xmp:MetadataDate"]} />
      </Section>

      {/* PDF Properties */}
      <Section title="PDF Properties" icon={<FileText className="w-4 h-4" />}>
        <KVRow label="Author"        value={result.pdfProperties.author} />
        <KVRow label="Title"         value={result.pdfProperties.title} />
        <KVRow label="Subject"       value={result.pdfProperties.subject} />
        <KVRow label="Creator"       value={result.pdfProperties.creator} />
        <KVRow label="Producer"      value={result.pdfProperties.producer} />
        <KVRow label="Creation Date" value={result.pdfProperties.creationDate} />
        <KVRow label="Mod Date"      value={result.pdfProperties.modDate} />
      </Section>

      {/* Doc Stats */}
      <Section title="Document Statistics" icon={<BarChart3 className="w-4 h-4" />}>
        <KVRow label="Pages"      value={result.docStats.pages} />
        <KVRow label="Words"      value={result.docStats.words.toLocaleString()} />
        <KVRow label="Characters" value={result.docStats.characters.toLocaleString()} />
        <KVRow label="File Size"  value={formatBytes(result.docStats.fileSizeBytes)} />
      </Section>

      {/* Suspicious indicators */}
      {result.forensic.suspiciousIndicators.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">Suspicious Indicators</p>
          <ul className="space-y-1">
            {result.forensic.suspiciousIndicators.map((s, i) => (
              <li key={i} className="text-xs text-amber-800 dark:text-amber-200 flex items-start gap-1">
                <span className="mt-0.5">•</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
