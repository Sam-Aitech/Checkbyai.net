import { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { CheckCircle, XCircle, AlertTriangle, FileText, Hash, Clock, Shield, Copy, Check } from 'lucide-react';
import { unwrapApiEnvelope } from '@/lib/apiEnvelope';

interface ReceiptData {
  receiptId: string;
  documentHash: string;
  result: 'genuine' | 'suspicious' | 'fake' | 'inconclusive';
  confidence: number;
  verifiedAt: string;
  checksPerformed: number;
  integrityHash: string;
}

function normalizeConfidence(c: number): number {
  // Backend may send 0-1 or 0-100 — normalize to 0-100 for display.
  return Math.round(c <= 1 ? c * 100 : c);
}

function ResultBadge({ result }: { result: ReceiptData['result'] }) {
  if (result === 'genuine') {
    return (
      <span role="status" aria-label="Verdict: Genuine" className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="w-4 h-4" aria-hidden="true" />
        Genuine
      </span>
    );
  }
  if (result === 'suspicious') {
    return (
      <span role="status" aria-label="Verdict: Suspicious" className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        Suspicious
      </span>
    );
  }
  if (result === 'inconclusive') {
    return (
      <span role="status" aria-label="Verdict: Needs human review" className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
        <Shield className="w-4 h-4" aria-hidden="true" />
        Needs review
      </span>
    );
  }
  return (
    <span role="status" aria-label="Verdict: Fake" className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
      <XCircle className="w-4 h-4" aria-hidden="true" />
      Fake
    </span>
  );
}

function CopyButton({ value, label }: Readonly<{ value: string; label: string }>) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="ml-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
    </button>
  );
}

function receiptBarClass(result: ReceiptData['result']): string {
  switch (result) {
    case 'genuine':
      return 'bg-green-500';
    case 'suspicious':
      return 'bg-amber-500';
    case 'inconclusive':
      return 'bg-blue-500';
    default:
      return 'bg-red-500';
  }
}

function HashRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="w-36 flex-shrink-0 text-sm text-gray-500 dark:text-gray-400 pt-0.5">{label}</span>
      <div className="flex items-center flex-1 min-w-0">
        <span className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all">{value}</span>
        <CopyButton value={value} label={label} />
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  const params = useParams<{ receiptId: string }>();
  const receiptId = params.receiptId;

  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!receiptId) return;
    setLoading(true);
    fetch(`/api/receipt/${receiptId}`)
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.message || 'Receipt not found');
        }
        return r.json();
      })
      .then(json => setData(unwrapApiEnvelope<ReceiptData>(json)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [receiptId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading receipt…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <XCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Receipt Not Found</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error || 'This receipt ID does not exist or has expired.'}</p>
          <Link href="/" className="inline-block mt-2 text-blue-600 dark:text-blue-400 text-sm hover:underline">
            ← Back to CheckByAI
          </Link>
        </div>
      </div>
    );
  }

  const verifiedDate = new Date(data.verifiedAt);
  const formattedDate = verifiedDate.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            ← CheckByAI
          </Link>
          <span className="text-xs text-gray-400 dark:text-gray-600 font-mono">{data.receiptId}</span>
        </div>

        {/* Main card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

          {/* Top band */}
          <div className={`px-6 py-5 border-b border-gray-100 dark:border-gray-700 ${
            data.result === 'genuine'
              ? 'bg-green-50 dark:bg-green-900/20'
              : data.result === 'suspicious'
              ? 'bg-amber-50 dark:bg-amber-900/20'
              : 'bg-red-50 dark:bg-red-900/20'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Verification Receipt</p>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">UK CoS Document Check</h1>
              </div>
              <ResultBadge result={data.result} />
            </div>
          </div>

          {/* Details */}
          <div className="px-6 py-5 space-y-0">

            {/* Confidence */}
            <div className="flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-800">
              <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span className="w-36 flex-shrink-0 text-sm text-gray-500 dark:text-gray-400">Model certainty</span>
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2" role="progressbar" aria-valuenow={normalizeConfidence(data.confidence)} aria-valuemin={0} aria-valuemax={100} aria-label={`Model certainty ${normalizeConfidence(data.confidence)} out of 100 in ${data.result} verdict`}>
                  <div
                    className={`h-2 rounded-full ${receiptBarClass(data.result)}`}
                    style={{ width: `${Math.min(normalizeConfidence(data.confidence), 100)}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 w-12 text-right">{normalizeConfidence(data.confidence)}%</span>
              </div>
            </div>

            {/* Date */}
            <div className="flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-800">
              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="w-36 flex-shrink-0 text-sm text-gray-500 dark:text-gray-400">Verified at</span>
              <span className="text-sm text-gray-800 dark:text-gray-200">{formattedDate}</span>
            </div>

            {/* Checks performed */}
            <div className="flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-800">
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="w-36 flex-shrink-0 text-sm text-gray-500 dark:text-gray-400">Checks run</span>
              <span className="text-sm text-gray-800 dark:text-gray-200">{data.checksPerformed}</span>
            </div>

            {/* Hashes */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Cryptographic Audit Trail</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl px-4 py-1 border border-gray-100 dark:border-gray-700">
                <HashRow label="Receipt ID" value={data.receiptId} />
                <HashRow label="Document hash" value={data.documentHash} />
                <HashRow label="Integrity hash" value={data.integrityHash} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
          <p className="text-center text-sm text-blue-800 dark:text-blue-300 font-medium">
            Technical analysis only — not a Home Office decision, not legal advice, not proof for a visa application.
          </p>
          <p className="text-center text-xs text-blue-600 dark:text-blue-400 mt-1">
            CheckByAI is independent and not affiliated with the Home Office/UKVI. Verify your sponsor on the{' '}
            <a href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers" target="_blank" rel="noopener noreferrer" className="underline font-semibold">GOV.UK register</a>.
            Result reflects the document as uploaded at the time shown.
          </p>
        </div>
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-3">
          This receipt was generated by CheckByAI. The integrity hash proves the result has not been altered.{' '}
          <Link href="/" className="text-blue-500 hover:underline">Verify another document →</Link>
        </p>

      </div>
    </div>
  );
}
