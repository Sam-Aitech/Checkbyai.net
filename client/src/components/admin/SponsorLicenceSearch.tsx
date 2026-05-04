import { useState, useRef } from 'react';
import {
  Search, ChevronLeft, ChevronRight, RefreshCw,
  CheckCircle, XCircle, Clock, AlertTriangle, Zap, Building2, HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DirectoryResult {
  fingerprint: string;
  organisationName: string;
  townCity: string | null;
  county: string | null;
  typeRating: string | null;
  route: string | null;
  status: string;
}

interface DirectoryResponse {
  results: DirectoryResult[];
  total: number;
  page: number;
  totalPages: number;
}

function StatusBadge({ status, typeRating }: { status: string; typeRating: string | null }) {
  const isBRated = (typeRating || '').toLowerCase().includes('b');

  if (status === 'REMOVED_REVOKED' || status === 'NOT_LISTED') {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
        <XCircle className="w-3 h-3 mr-1" />
        Removed
      </Badge>
    );
  }
  if (status === 'NEWLY_GRANTED') {
    return (
      <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
        <Zap className="w-3 h-3 mr-1" />
        Newly Granted
      </Badge>
    );
  }
  if (status === 'GRACE_PERIOD') {
    return (
      <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
        <Clock className="w-3 h-3 mr-1" />
        Under Review
      </Badge>
    );
  }
  if (status === 'ACTIVE') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
          <CheckCircle className="w-3 h-3 mr-1" />
          Active
        </Badge>
        {isBRated && (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
            <AlertTriangle className="w-3 h-3 mr-1" />
            B-Rated
          </Badge>
        )}
      </div>
    );
  }
  return (
    <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
      <HelpCircle className="w-3 h-3 mr-1" />
      Unknown
    </Badge>
  );
}

const STATUS_OPTIONS = [
  { value: 'all',             label: 'All statuses'   },
  { value: 'ACTIVE',          label: 'Active'         },
  { value: 'NEWLY_GRANTED',   label: 'Newly Granted'  },
  { value: 'REMOVED_REVOKED', label: 'Removed'        },
  { value: 'GRACE_PERIOD',    label: 'Under Review'   },
];

export default function SponsorLicenceSearch() {
  const [nameInput, setNameInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestName = useRef('');

  const load = async (name: string, status: string, p: number) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: '25' });
      if (name)                    params.set('name',   name);
      if (status && status !== 'all') params.set('status', status);
      const res = await fetch(`/api/sponsors/directory?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setError('The register is temporarily unavailable. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (val: string) => {
    setNameInput(val);
    latestName.current = val;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(latestName.current, statusFilter, 1);
    }, 400);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
    load(nameInput, val, 1);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    load(nameInput, statusFilter, p);
  };

  return (
    <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-cyan-400" />
              GOV.UK Sponsor Licence Search
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-slate-400">
              {data ? `${data.total.toLocaleString()} sponsors found` : 'Search the Home Office register of licensed sponsors'}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => load(nameInput, statusFilter, page)}
            disabled={loading}
            aria-label="Refresh"
            className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
            <Input
              placeholder="Search by organisation name…"
              value={nameInput}
              onChange={(e) => handleNameChange(e.target.value)}
              className="pl-9 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-44 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {/* Error */}
        {error && (
          <div className="flex flex-col gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => load(nameInput, statusFilter, page)}
              disabled={loading}
              className="self-start border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Try again
            </Button>
          </div>
        )}

        {/* Empty / initial state */}
        {!data && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20">
            <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <Search className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Search the Sponsor Register</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 max-w-xs">
              Type an organisation name above to look up their sponsor licence status from the Home Office register.
            </p>
            <Button
              onClick={() => load('', '', 1)}
              className="mt-4 bg-cyan-600 hover:bg-cyan-700 text-white"
              size="sm"
            >
              Load All Sponsors
            </Button>
          </div>
        )}

        {/* Skeleton loading */}
        {loading && (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-2/5" />
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/5" />
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/5" />
                <div className="h-5 bg-gray-200 dark:bg-slate-700 rounded-full w-16 ml-auto" />
              </div>
            ))}
          </div>
        )}

        {/* Results table */}
        {!loading && data && data.results.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    <th className="text-left py-3 px-3 text-gray-500 dark:text-slate-400 font-medium">Organisation</th>
                    <th className="text-left py-3 px-3 text-gray-500 dark:text-slate-400 font-medium hidden sm:table-cell">Town</th>
                    <th className="text-left py-3 px-3 text-gray-500 dark:text-slate-400 font-medium hidden md:table-cell">Type / Rating</th>
                    <th className="text-left py-3 px-3 text-gray-500 dark:text-slate-400 font-medium hidden lg:table-cell">Route</th>
                    <th className="text-left py-3 px-3 text-gray-500 dark:text-slate-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr
                      key={r.fingerprint}
                      className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30"
                    >
                      <td className="py-3 px-3 text-gray-900 dark:text-white font-medium max-w-[220px] truncate" title={r.organisationName}>
                        {r.organisationName}
                      </td>
                      <td className="py-3 px-3 text-gray-500 dark:text-slate-400 hidden sm:table-cell">
                        {r.townCity || '—'}
                      </td>
                      <td className="py-3 px-3 text-gray-500 dark:text-slate-400 hidden md:table-cell">
                        {r.typeRating || '—'}
                      </td>
                      <td className="py-3 px-3 text-gray-500 dark:text-slate-400 hidden lg:table-cell">
                        {r.route || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={r.status} typeRating={r.typeRating} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Page {data.page} of {data.totalPages} &middot; {data.total.toLocaleString()} results
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={data.page === 1}
                    className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={data.page === data.totalPages}
                    className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* No results */}
        {!loading && data && data.results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20">
            <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">No sponsors found</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 max-w-xs">
              No results match your search. Try a different name or clear the status filter.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
