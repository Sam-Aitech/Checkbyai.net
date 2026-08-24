import { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { CheckCircle, XCircle, AlertTriangle, FileText, Hash, Clock, Shield, Copy, Check } from 'lucide-react';

interface ReceiptData {
  receiptId: string;
  documentHash: string;
  result: 'genuine' | 'suspicious' | 'fake';
  confidence: number;
  verifiedAt: string;
  checksPerformed: number;
  integrityHash: string;
}

function ResultBadge({ result }: { result: ReceiptData['result'] }) {
  if (result === 'genuine') {
    return (
      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="w-4 h-4" />
        Genuine
      </span>
    );
  }
  if (result === 'suspicious') {
    return (
      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4" />
        Suspicious
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
      <XCircle className="w-4 h-4" />
      Fake
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
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
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="w-36 flex-shrink-0 text-sm text-gray-500 dark:text-gray-400 pt-0.5">{label}</span>
      <div className="flex items-center flex-1 min-w-0">
        <span className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all">{value}</span>
        <CopyButton value={value} />
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
      .then(json => setData(json?.data ?? json))
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
              <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="w-36 flex-shrink-0 text-sm text-gray-500 dark:text-gray-400">Confidence</span>
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      data.result === 'genuine' ? 'bg-green-500' : data.result === 'suspicious' ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(data.confidence, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 w-12 text-right">{data.confidence}%</span>
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
        <p className="text-center text-xs text-gray-400 dark:text-gray-600">
          This receipt was generated by CheckByAI. The integrity hash proves the result has not been altered.{' '}
          <Link href="/" className="text-blue-500 hover:underline">Verify another document →</Link>
        </p>

      </div>
    </div>
  );
}
