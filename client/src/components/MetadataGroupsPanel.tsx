import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Lock, Calendar, FileText, AlertTriangle, XCircle, Info } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentMetadata {
  // File Format Info
  format?: string | null;
  mimeType?: string | null;
  pdfVersion?: string | null;
  // PDF Properties
  title?: string | null;
  author?: string | null;
  subject?: string | null;
  creator?: string | null;
  producer?: string | null;
  creationDate?: string | null;
  modificationDate?: string | null;
  // Document Statistics
  pageCount?: number | null;
  wordCount?: number | null;
  characterCount?: number | null;
  fontCount?: number;
  fileSize?: number | null;
  // Security
  isEncrypted?: boolean;
  hasDigitalSignature?: boolean;
  // XMP Tags
  xmp_tags?: {
    'dc:date'?: string;
    'dc:format'?: string;
    'dc:language'?: string;
    'pdf:PDFVersion'?: string;
    'pdf:Producer'?: string;
    'xmp:CreateDate'?: string;
    'xmp:CreatorTool'?: string;
    'xmp:MetadataDate'?: string;
    [key: string]: any;
  };
  // Fonts
  fonts?: string[];
}

export interface FieldAnnotation {
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

// keyed by field.key — admin-only overlay
export type AiAnnotations = Record<string, FieldAnnotation>;

interface MetadataField {
  key: string;
  label: string;
  value: string | number | boolean | null | undefined;
  type: 'text' | 'datetime' | 'number' | 'boolean' | 'bytes';
}

interface MetadataGroup {
  id: string;
  label: string;
  readonly: boolean;
  fields: MetadataField[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPdfDate(raw: string | null | undefined): string {
  if (!raw) return 'Not available';
  const pdfMatch = raw.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (pdfMatch) {
    const [, y, mo, d, h, mi, s] = pdfMatch;
    return `${d}-${mo}-${y} ${h}:${mi}:${s}`;
  }
  if (raw.includes('T')) {
    try {
      const dt = new Date(raw);
      if (!isNaN(dt.getTime())) {
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const yyyy = dt.getFullYear();
        const hh = String(dt.getHours()).padStart(2, '0');
        const min = String(dt.getMinutes()).padStart(2, '0');
        const ss = String(dt.getSeconds()).padStart(2, '0');
        return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
      }
    } catch {/* ignore */}
  }
  return raw;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatValue(field: MetadataField): string {
  const v = field.value;
  if (v === null || v === undefined || v === '' || v === 'Not available') return 'Not available';
  if (field.type === 'boolean') return (v as boolean) ? 'Yes' : 'No';
  if (field.type === 'bytes') return formatBytes(v as number);
  if (field.type === 'datetime') return formatPdfDate(v as string);
  if (field.type === 'number') return String(v);
  return String(v);
}

/** Detect legacy (pre-upgrade) metadata that has only 5 fields */
function isLegacyMetadata(meta: DocumentMetadata): boolean {
  return (
    meta.characterCount === undefined &&
    meta.wordCount === undefined &&
    meta.fileSize === undefined &&
    meta.mimeType === undefined
  );
}

function buildGroups(meta: DocumentMetadata): MetadataGroup[] {
  const groups: MetadataGroup[] = [];

  // ── 1. File Format Info ───────────────────────────────────────────────────
  groups.push({
    id: 'file-format',
    label: 'File Format Info',
    readonly: true,
    fields: ([
      { key: 'Format',     label: 'Format',     value: 'Pdf',                              type: 'text' as const },
      { key: 'MimeType',   label: 'MimeType',   value: meta.mimeType || 'application/pdf', type: 'text' as const },
      { key: 'PdfVersion', label: 'PdfVersion', value: meta.pdfVersion || null,             type: 'text' as const },
    ] as MetadataField[]).filter(f => f.value !== null && f.value !== undefined),
  });

  // ── 2. PDF Properties ─────────────────────────────────────────────────────
  const pdfProps: MetadataField[] = ([
    { key: 'creationdate',     label: 'creationdate',     value: meta.creationDate,     type: 'datetime' as const },
    { key: 'creator',          label: 'creator',          value: meta.creator,          type: 'text'     as const },
    { key: 'producer',         label: 'producer',         value: meta.producer,         type: 'text'     as const },
    { key: 'title',            label: 'title',            value: meta.title,            type: 'text'     as const },
    { key: 'author',           label: 'author',           value: meta.author,           type: 'text'     as const },
    { key: 'subject',          label: 'subject',          value: meta.subject,          type: 'text'     as const },
    { key: 'modificationdate', label: 'modificationdate', value: meta.modificationDate, type: 'datetime' as const },
  ] as MetadataField[]).filter(f => f.value !== null && f.value !== undefined && f.value !== '');

  if (pdfProps.length > 0) {
    groups.push({ id: 'pdf-properties', label: 'PDF Properties', readonly: false, fields: pdfProps });
  }

  // ── 3. Document Statistics ────────────────────────────────────────────────
  const statsFields: MetadataField[] = ([
    { key: 'Characters count', label: 'Characters count', value: meta.characterCount ?? null, type: 'number' as const },
    { key: 'Pages count',      label: 'Pages count',      value: meta.pageCount ?? null,      type: 'number' as const },
    { key: 'Words count',      label: 'Words count',      value: meta.wordCount ?? null,       type: 'number' as const },
  ] as MetadataField[]).filter(f => f.value !== null && f.value !== undefined);

  if (statsFields.length > 0) {
    groups.push({ id: 'doc-statistics', label: 'Document Statistics', readonly: true, fields: statsFields });
  }

  // ── 4. XMP Tags ───────────────────────────────────────────────────────────
  const xmp = meta.xmp_tags || {};
  const xmpFields: MetadataField[] = ([
    { key: 'dc:date',          label: 'dc:date',          value: xmp['dc:date'],          type: 'datetime' as const },
    { key: 'dc:format',        label: 'dc:format',        value: xmp['dc:format'],        type: 'text'     as const },
    { key: 'dc:language',      label: 'dc:language',      value: xmp['dc:language'],      type: 'text'     as const },
    { key: 'pdf:PDFVersion',   label: 'pdf:PDFVersion',   value: xmp['pdf:PDFVersion'],   type: 'text'     as const },
    { key: 'pdf:Producer',     label: 'pdf:Producer',     value: xmp['pdf:Producer'],     type: 'text'     as const },
    { key: 'xmp:CreateDate',   label: 'xmp:CreateDate',   value: xmp['xmp:CreateDate'],   type: 'datetime' as const },
    { key: 'xmp:CreatorTool',  label: 'xmp:CreatorTool',  value: xmp['xmp:CreatorTool'],  type: 'text'     as const },
    { key: 'xmp:MetadataDate', label: 'xmp:MetadataDate', value: xmp['xmp:MetadataDate'], type: 'datetime' as const },
  ] as MetadataField[]).filter(f => {
    const v = f.value;
    return v !== null && v !== undefined && v !== '' && v !== 'Not available';
  });

  const listedXmpKeys = new Set(['dc:date','dc:format','dc:language','pdf:PDFVersion','pdf:Producer','xmp:CreateDate','xmp:CreatorTool','xmp:MetadataDate','xmpMM:History']);
  for (const [k, v] of Object.entries(xmp)) {
    if (!listedXmpKeys.has(k) && v !== null && v !== undefined && typeof v !== 'object') {
      xmpFields.push({ key: k, label: k, value: String(v), type: 'text' });
    }
  }

  if (xmpFields.length > 0) {
    groups.push({ id: 'xmp-tags', label: 'XMP Tags', readonly: false, fields: xmpFields });
  }

  // ── 5. Security & Signatures ──────────────────────────────────────────────
  groups.push({
    id: 'security',
    label: 'Security & Signatures',
    readonly: true,
    fields: ([
      { key: 'IsEncrypted',         label: 'IsEncrypted',         value: meta.isEncrypted ?? false,         type: 'boolean' as const },
      { key: 'HasDigitalSignature', label: 'HasDigitalSignature', value: meta.hasDigitalSignature ?? false, type: 'boolean' as const },
      { key: 'FileSize',            label: 'FileSize',            value: meta.fileSize ?? null,             type: 'bytes'   as const },
    ] as MetadataField[]).filter(f => f.value !== null && f.value !== undefined),
  });

  // ── 6. Embedded Fonts ─────────────────────────────────────────────────────
  if (meta.fonts && meta.fonts.length > 0) {
    groups.push({
      id: 'fonts',
      label: 'Embedded Fonts',
      readonly: true,
      fields: meta.fonts.slice(0, 20).map((font, i) => ({
        key: `font-${i}`,
        label: `Font ${i + 1}`,
        value: font,
        type: 'text' as const,
      })),
    });
  }

  return groups.filter(g => g.fields.length > 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReadOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/40 whitespace-nowrap flex-shrink-0">
      <Lock className="w-3 h-3" />
      Read-only
    </span>
  );
}

function FieldTypeIcon({ type }: { type: MetadataField['type'] }) {
  if (type === 'datetime') {
    return <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />;
  }
  if (type === 'number' || type === 'bytes') {
    return (
      <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 flex-shrink-0 select-none leading-none">
        #
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 flex-shrink-0 tracking-wider select-none leading-none">
      ABC
    </span>
  );
}

function AnnotationIndicator({ annotation }: { annotation: FieldAnnotation }) {
  const [open, setOpen] = useState(false);

  const colors = {
    critical: {
      dot: 'bg-red-500',
      icon: <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />,
      banner: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700/40 dark:text-red-400',
    },
    warning: {
      dot: 'bg-amber-500',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />,
      banner: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/40 dark:text-amber-400',
    },
    info: {
      dot: 'bg-blue-400',
      icon: <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />,
      banner: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700/40 dark:text-blue-400',
    },
  }[annotation.severity];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title={`AI flag: ${annotation.severity}`}
      >
        {colors.icon}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className={`absolute right-0 top-full mt-1 z-20 min-w-[220px] max-w-[280px] p-3 rounded-lg border text-xs leading-relaxed shadow-lg ${colors.banner}`}
          >
            <p className="font-semibold capitalize mb-1">{annotation.severity} — AI flag</p>
            <p>{annotation.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetadataFieldRow({
  field,
  isLast,
  groupReadonly,
  annotation,
}: {
  field: MetadataField;
  isLast: boolean;
  groupReadonly: boolean;
  annotation?: FieldAnnotation;
}) {
  const displayValue = formatValue(field);
  const isEmpty = displayValue === 'Not available';

  const annotationBorder = annotation
    ? annotation.severity === 'critical'
      ? 'border-l-4 border-l-red-500'
      : annotation.severity === 'warning'
      ? 'border-l-4 border-l-amber-500'
      : 'border-l-4 border-l-blue-400'
    : '';

  return (
    <div
      className={`flex items-center gap-4 px-5 py-3.5 bg-white dark:bg-gray-900 ${
        !isLast ? 'border-b border-gray-100 dark:border-gray-800' : ''
      } ${annotationBorder} hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors`}
    >
      {/* Label */}
      <div className="w-48 flex-shrink-0">
        <span className="text-sm text-gray-500 dark:text-gray-400 font-normal">{field.label}</span>
      </div>

      {/* Value input box */}
      <div className="flex-1 min-w-0">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-md border min-h-[38px] ${
            annotation
              ? annotation.severity === 'critical'
                ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-700/30'
                : annotation.severity === 'warning'
                ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-700/30'
                : 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-700/30'
              : groupReadonly
              ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600'
          }`}
        >
          <span
            className={`text-sm flex-1 truncate ${
              isEmpty
                ? 'text-gray-400 dark:text-gray-600 italic'
                : annotation
                ? annotation.severity === 'critical'
                  ? 'text-red-700 dark:text-red-400'
                  : annotation.severity === 'warning'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-gray-800 dark:text-gray-200'
                : 'text-gray-800 dark:text-gray-200'
            }`}
          >
            {displayValue}
          </span>
          <FieldTypeIcon type={field.type} />
        </div>
      </div>

      {/* AI annotation indicator (admin-only, shown when present) */}
      {annotation && <AnnotationIndicator annotation={annotation} />}

      {/* Per-row Read-only badge for readonly groups (only when no annotation) */}
      {groupReadonly && !annotation && <ReadOnlyBadge />}
    </div>
  );
}

function MetadataGroupSection({
  group,
  aiAnnotations,
}: {
  group: MetadataGroup;
  aiAnnotations?: AiAnnotations;
}) {
  const [open, setOpen] = useState(true);
  const spring = { type: 'spring' as const, stiffness: 280, damping: 26 };

  // Check if any field in this group has an annotation
  const groupHasFlags = aiAnnotations
    ? group.fields.some(f => aiAnnotations[f.key])
    : false;

  return (
    <div className="mb-10">
      {/* Group Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 mb-4 text-left group"
      >
        <ChevronDown
          className={`w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0 transition-transform duration-200 ${
            open ? 'rotate-0' : '-rotate-90'
          }`}
        />
        <span className="text-[17px] font-bold text-gray-900 dark:text-gray-100 flex-1 leading-tight">
          {group.label}
        </span>
        {/* Flag indicator on collapsed groups */}
        {groupHasFlags && !open && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            Flagged
          </span>
        )}
        {group.readonly && <ReadOnlyBadge />}
      </button>

      {/* Collapsible fields */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
              {group.fields.map((field, i) => (
                <MetadataFieldRow
                  key={field.key}
                  field={field}
                  isLast={i === group.fields.length - 1}
                  groupReadonly={group.readonly}
                  annotation={aiAnnotations?.[field.key]}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface MetadataGroupsPanelProps {
  metadata: DocumentMetadata;
  /** Admin-only: per-field AI forensic flags. Derive via deriveAiAnnotations(checks). */
  aiAnnotations?: AiAnnotations;
}

export default function MetadataGroupsPanel({ metadata, aiAnnotations }: MetadataGroupsPanelProps) {
  const groups = buildGroups(metadata);
  const legacy = isLegacyMetadata(metadata);
  const flagCount = aiAnnotations ? Object.keys(aiAnnotations).length : 0;

  if (groups.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 dark:text-gray-600 text-sm">
        No metadata available for this document.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 16 }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-6 pb-3 border-b border-gray-200 dark:border-gray-700">
        <FileText className="w-4 h-4 text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 tracking-widest uppercase">
          Document Metadata
        </h4>
        <div className="ml-auto flex items-center gap-2">
          {legacy && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700">
              Legacy record — limited fields
            </span>
          )}
          {flagCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-700/40 font-semibold">
              <XCircle className="w-3 h-3" />
              {flagCount} AI flag{flagCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-600">
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {groups.map(group => (
        <MetadataGroupSection key={group.id} group={group} aiAnnotations={aiAnnotations} />
      ))}
    </motion.div>
  );
}

// ─── Helper: derive annotations from AI checks array ─────────────────────────
// Use this in admin contexts: deriveAiAnnotations(selectedLog.analysisDetails?.checks)

export function deriveAiAnnotations(checks?: any[]): AiAnnotations {
  if (!checks?.length) return {};
  const annotations: AiAnnotations = {};

  for (const check of checks) {
    if (check.passed) continue; // only flag failed checks

    const name = (check.name || '').toLowerCase();
    const severity: FieldAnnotation['severity'] =
      check.severity === 'critical' ? 'critical' :
      check.severity === 'warning'  ? 'warning'  : 'info';
    const message = check.message || '';
    const anno: FieldAnnotation = { severity, message };

    if (name.includes('producer')) {
      annotations['producer'] = anno;
      annotations['pdf:Producer'] = anno;
    }
    if (name.includes('creator') || name.includes('tool') || name.includes('software')) {
      annotations['creator'] = anno;
      annotations['xmp:CreatorTool'] = anno;
    }
    if (name.includes('creation') || name.includes('create date') || name.includes('created')) {
      annotations['creationdate'] = anno;
      annotations['xmp:CreateDate'] = anno;
      annotations['dc:date'] = anno;
    }
    if (name.includes('modification') || name.includes('modified') || name.includes('modify')) {
      annotations['modificationdate'] = anno;
      annotations['xmp:MetadataDate'] = anno;
    }
    if (name.includes('version') || name.includes('pdf version')) {
      annotations['PdfVersion'] = anno;
      annotations['pdf:PDFVersion'] = anno;
    }
    if (name.includes('encrypt')) {
      annotations['IsEncrypted'] = anno;
    }
    if (name.includes('signature') || name.includes('sign')) {
      annotations['HasDigitalSignature'] = anno;
    }
    if (name.includes('date') && !name.includes('creation') && !name.includes('modification') && !name.includes('created')) {
      // Generic date check — flag all date fields
      annotations['creationdate'] = annotations['creationdate'] ?? anno;
      annotations['modificationdate'] = annotations['modificationdate'] ?? anno;
      annotations['xmp:CreateDate'] = annotations['xmp:CreateDate'] ?? anno;
    }
    if (name.includes('font')) {
      // Font flags apply to font-0 as a representative field
      annotations['font-0'] = anno;
    }
    if (name.includes('author')) {
      annotations['author'] = anno;
    }
    if (name.includes('title')) {
      annotations['title'] = anno;
    }
  }

  return annotations;
}
