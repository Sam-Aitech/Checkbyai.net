import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Upload, FileText, CheckCircle, AlertTriangle, XCircle, LogOut, Trash2, Eye,
  RefreshCw, Search, Filter, ChevronLeft, ChevronRight, Activity, Database, Clock,
  Sparkles, X, Download, ChevronDown, Users, TrendingUp, Cpu, HardDrive, Brain, Plus, Power, Radio, Play, Bell, BarChart3, History, Info,
  Building2, FileCheck
} from 'lucide-react';
import { useLocation } from 'wouter';
import { unwrapApiEnvelope } from '@/lib/apiEnvelope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import SponsorLicenceSearch from '@/components/admin/SponsorLicenceSearch';
import MetadataGroupsPanel, { deriveAiAnnotations } from '@/components/MetadataGroupsPanel';

interface AdminUser {
  id: string;
  email: string;
  role: string;
}

interface TrustedPattern {
  id: number;
  filename: string;
  uploadedAt: string;
  metadata?: {
    producer?: string;
    creator?: string;
    creationDate?: string;
    modificationDate?: string;
    pdfVersion?: string;
    fontCount?: number;
    fonts?: string[];
    forensic?: {
      producer: string;
      creator: string;
      created: string;
      modified: string;
      softwareAgent: string;
      fontCount: number;
      suspiciousIndicators: string[];
    };
  };
}

interface VerificationLog {
  id: number;
  userId?: string;
  userEmail?: string | null;
  filename: string;
  result: 'genuine' | 'suspicious' | 'fake';
  confidence: number;
  metadata: any;
  analysisDetails: any;
  ipAddress?: string;
  verifiedAt: string;
  adminStatus?: 'pending' | 'approved' | 'fake';
  adminFeedback?: string | null;
}

interface Stats {
  trustedPatterns: number;
  verificationsToday: number;
  suspiciousDetected: number;
  genuineVerified: number;
}

interface SystemHealth {
  memory: { heapUsed: number; heapTotal: number; rss: number };
  uptime: number;
  database: { status: string; connections: number };
  stats: { trustedPatterns: number; verificationsToday: number; totalUsers: number; proUsers: number };
  timestamp: string;
}

interface PaginatedLogs {
  data: VerificationLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UserRecord {
  id: string;
  email?: string;
  role: string;
  subscriptionStatus: string;
  isRestricted?: boolean;
  restrictionReason?: string;
  cosCheckApproved?: boolean;
  cosBetaEnabled?: boolean;
  cosBetaLimit?: number | null;
  createdAt: string;
  dailyVerificationsUsed?: number;
  verificationLimit?: number | null;
}

interface PaginatedUsers {
  data: UserRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface GlobalAiRule {
  id: number;
  category: string;
  ruleText: string;
  priority: number;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UploadPreview {
  file: File;
  metadata: any;
}

// ─── Enrichment Queue Tab ─────────────────────────────────────────────────────
interface EnrichmentQueueStats {
  statusCounts:   Array<{ status: string; count: number }>;
  jobTypeCounts:  Array<{ job_type: string; status: string; count: number }>;
  recentFailures: Array<{ fingerprint: string; job_type: string; status: string; attempt_count: number; error_message: string | null; last_attempted_at: string | null; updated_at: string }>;
  stalled:        Array<{ fingerprint: string; job_type: string; locked_by: string | null; locked_at: string }>;
  total:          number;
  completed:      number;
}

const STATUS_COLORS: Record<string, string> = {
  pending:         'bg-blue-500/20 text-blue-400 border-blue-500/30',
  in_progress:     'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  completed:       'bg-green-500/20 text-green-400 border-green-500/30',
  failed:          'bg-red-500/20 text-red-400 border-red-500/30',
  rate_limited:    'bg-amber-500/20 text-amber-400 border-amber-500/30',
  captcha_blocked: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  no_match:        'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

function EnrichmentQueueTab() {
  const [data, setData] = useState<EnrichmentQueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/enrichment-queue', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to fetch');
      setData(await r.json());
    } catch {
      setError('Failed to load enrichment queue stats.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const progressPct = data && data.total > 0
    ? Math.round((data.completed / data.total) * 100)
    : 0;

  // Aggregate pending + rate_limited as "awaiting"
  const awaiting = (data?.statusCounts ?? [])
    .filter(r => ['pending', 'rate_limited'].includes(r.status))
    .reduce((s, r) => s + r.count, 0);
  const inProgress = data?.statusCounts.find(r => r.status === 'in_progress')?.count ?? 0;
  const failed     = data?.statusCounts.find(r => r.status === 'failed')?.count ?? 0;
  const blocked    = data?.statusCounts.find(r => r.status === 'captcha_blocked')?.count ?? 0;

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-violet-400" />
                Enrichment Queue
              </CardTitle>
              <CardDescription className="text-gray-500 dark:text-slate-400">
                Companies House &amp; Licence History async pipeline
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}
              className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700">
              <RefreshCw className={`w-4 h-4 sm:mr-1 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 py-4">
              <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              Loading queue stats…
            </div>
          ) : error ? (
            <p className="text-red-400 text-sm py-4">{error}</p>
          ) : data && (
            <div className="space-y-6">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 mb-1">
                  <span>Overall enrichment progress</span>
                  <span>{data.completed.toLocaleString()} / {data.total.toLocaleString()} ({progressPct}%)</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              {/* Status stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Awaiting',   value: awaiting,    color: 'text-blue-400'   },
                  { label: 'In Progress',value: inProgress,  color: 'text-cyan-400'   },
                  { label: 'Failed',     value: failed,      color: 'text-red-400'    },
                  { label: 'CF Blocked', value: blocked,     color: 'text-orange-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-100 dark:bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {/* Full status breakdown */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">All statuses</p>
                <div className="flex flex-wrap gap-2">
                  {data.statusCounts.map(({ status, count }) => (
                    <Badge key={status} variant="outline" className={STATUS_COLORS[status] ?? 'bg-slate-500/20 text-slate-400 border-slate-500/30'}>
                      {status}: {count.toLocaleString()}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Job type breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {['companies_house', 'licence_history'].map(jobType => {
                  const rows = data.jobTypeCounts.filter(r => r.job_type === jobType);
                  const total = rows.reduce((s, r) => s + r.count, 0);
                  return (
                    <div key={jobType} className="bg-gray-100 dark:bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-2">
                        {jobType === 'companies_house' ? 'Companies House' : 'Licence History'} ({total.toLocaleString()})
                      </p>
                      <div className="flex flex-col gap-1">
                        {rows.map(({ status, count }) => (
                          <div key={status} className="flex justify-between items-center text-xs">
                            <Badge variant="outline" className={`${STATUS_COLORS[status] ?? ''} text-[10px] py-0`}>{status}</Badge>
                            <span className="text-gray-500 dark:text-slate-400">{count.toLocaleString()}</span>
                          </div>
                        ))}
                        {rows.length === 0 && <p className="text-xs text-gray-400 dark:text-slate-500">No items</p>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stalled items */}
              {data.stalled.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Stalled (in_progress &gt; 30 min)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400">
                          <th className="text-left py-2 px-3">Fingerprint</th>
                          <th className="text-left py-2 px-3">Job Type</th>
                          <th className="text-left py-2 px-3">Locked At</th>
                          <th className="text-left py-2 px-3">Locked By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.stalled.map((row, i) => (
                          <tr key={i} className="border-b border-gray-100 dark:border-slate-700/50">
                            <td className="py-2 px-3 font-mono text-[10px] max-w-[160px] truncate text-gray-700 dark:text-slate-300">{row.fingerprint}</td>
                            <td className="py-2 px-3 text-gray-600 dark:text-slate-400">{row.job_type}</td>
                            <td className="py-2 px-3 text-amber-500">{new Date(row.locked_at).toLocaleString()}</td>
                            <td className="py-2 px-3 text-gray-400 dark:text-slate-500 truncate max-w-[120px]">{row.locked_by ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent failures */}
              {data.recentFailures.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Recent Failures</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400">
                          <th className="text-left py-2 px-3">Fingerprint</th>
                          <th className="text-left py-2 px-3">Type</th>
                          <th className="text-left py-2 px-3">Status</th>
                          <th className="text-left py-2 px-3">Attempts</th>
                          <th className="text-left py-2 px-3">Last Error</th>
                          <th className="text-left py-2 px-3">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentFailures.map((row, i) => (
                          <tr key={i} className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/20">
                            <td className="py-2 px-3 font-mono text-[10px] max-w-[140px] truncate text-gray-700 dark:text-slate-300">{row.fingerprint}</td>
                            <td className="py-2 px-3 text-gray-600 dark:text-slate-400">{row.job_type}</td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className={`${STATUS_COLORS[row.status] ?? ''} text-[10px] py-0`}>{row.status}</Badge>
                            </td>
                            <td className="py-2 px-3 text-gray-500 dark:text-slate-400">{row.attempt_count}</td>
                            <td className="py-2 px-3 text-red-400 max-w-[200px] truncate" title={row.error_message ?? ''}>{row.error_message ?? '—'}</td>
                            <td className="py-2 px-3 text-gray-400 dark:text-slate-500 whitespace-nowrap">{new Date(row.updated_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SimpleAdmin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [loginStep, setLoginStep] = useState<'email' | 'verify'>('email');
  const [loginError, setLoginError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  
  const [stats, setStats] = useState<Stats | null>(null);
  const [patterns, setPatterns] = useState<TrustedPattern[]>([]);
  const [uploading, setUploading] = useState(false);
  
  // Verification logs state
  const [logs, setLogs] = useState<PaginatedLogs | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsFilter, setLogsFilter] = useState<'all' | 'genuine' | 'suspicious' | 'fake'>('all');
  const [logsSearch, setLogsSearch] = useState('');
  const [logsSearchInput, setLogsSearchInput] = useState('');
  const logsSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logsStartDate, setLogsStartDate] = useState('');
  const [logsEndDate, setLogsEndDate] = useState('');
  const [logsPeriod, setLogsPeriod] = useState<'today' | '7d' | '30d' | '90d' | ''>('');
  const [selectedLog, setSelectedLog] = useState<VerificationLog | null>(null);
  
  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  
  // System health state
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  
  // User management state
  const [users, setUsers] = useState<PaginatedUsers | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersSearchInput, setUsersSearchInput] = useState('');
  const usersSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [usersPaidOnly, setUsersPaidOnly] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [cosBetaDialog, setCosBetaDialog] = useState<{ open: boolean; userId: string; currentLimit: number | null } | null>(null);
  const [cosBetaLimitInput, setCosBetaLimitInput] = useState<string>('');

  // ── Notification Portal state ──────────────────────────────────────────────
  const [notifPaused, setNotifPaused] = useState<boolean | null>(null);
  const [notifPausedLoading, setNotifPausedLoading] = useState(false);
  const [notifUsers, setNotifUsers] = useState<any[]>([]);
  const [notifUsersTotal, setNotifUsersTotal] = useState(0);
  const [notifUsersPage, setNotifUsersPage] = useState(1);
  const [notifUsersSearch, setNotifUsersSearch] = useState('');
  const [notifUsersLoading, setNotifUsersLoading] = useState(false);
  const [expandedNotifUser, setExpandedNotifUser] = useState<string | null>(null);
  const [notifLogEntries, setNotifLogEntries] = useState<any[]>([]);
  const [notifLogTotal, setNotifLogTotal] = useState(0);
  const [notifLogPage, setNotifLogPage] = useState(1);
  const [notifLogLoading, setNotifLogLoading] = useState(false);

  // Domain-level navigation — synced to /admin/sponsor or /admin/cos via Wouter
  const [location, setLocation] = useLocation();
  const domain = location.startsWith('/admin/sponsor') ? 'sponsor' : 'cos';

  // Tab state — initialised from URL so direct navigation and refresh work correctly
  const [activeTab, setActiveTab] = useState(domain === 'sponsor' ? 'licenceCheck' : 'patterns');

  const handleDomainChange = (newDomain: string) => {
    setLocation(`/admin/${newDomain}`);
    setActiveTab(newDomain === 'sponsor' ? 'licenceCheck' : 'patterns');
  };
  
  // Global AI rules state
  const [globalRules, setGlobalRules] = useState<GlobalAiRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [newRuleCategory, setNewRuleCategory] = useState('');
  const [newRuleText, setNewRuleText] = useState('');
  const [newRulePriority, setNewRulePriority] = useState(0);
  // Inline-edit state
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editText, setEditText] = useState('');
  const [editPriority, setEditPriority] = useState(0);
  // Drag-to-reorder state
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  
  // Upload preview state (two-step upload with AI instructions)
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);
  const [aiInstructions, setAiInstructions] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Teach AI state
  const [teachAiInput, setTeachAiInput] = useState('');
  const [teachAiCategory, setTeachAiCategory] = useState('red_flag');
  const [teachingAi, setTeachingAi] = useState(false);
  
  // HITL (Human-in-the-Loop) feedback state
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackLog, setFeedbackLog] = useState<VerificationLog | null>(null);
  const [feedbackReasoning, setFeedbackReasoning] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [deleteConfirmLog, setDeleteConfirmLog] = useState<VerificationLog | null>(null);

  // Recent Activity widget state
  const [recentActivity, setRecentActivity] = useState<VerificationLog[]>([]);
  const [recentActivityLoading, setRecentActivityLoading] = useState(false);
  const [deleteConfirmActivity, setDeleteConfirmActivity] = useState<VerificationLog | null>(null);

  // Sponsor Monitor state
  const [sponsorStatus, setSponsorStatus] = useState<any>(null);
  const [sponsorStatusLoading, setSponsorStatusLoading] = useState(false);
  const [recentChanges, setRecentChanges] = useState<any[]>([]);
  const [recentChangesLoading, setRecentChangesLoading] = useState(false);
  const [topWatched, setTopWatched] = useState<any[]>([]);
  const [topWatchedLoading, setTopWatchedLoading] = useState(false);
  const [notifStats, setNotifStats] = useState<any[]>([]);
  const [notifStatsLoading, setNotifStatsLoading] = useState(false);
  const [runningJob, setRunningJob] = useState(false);
  const [runConfirmOpen, setRunConfirmOpen] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runElapsed, setRunElapsed] = useState(0);
  const [initConfirmOpen, setInitConfirmOpen] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [initJobId, setInitJobId] = useState<string | null>(null);
  const [initProgress, setInitProgress] = useState<{
    stage: string;
    progressPct: number;
    rowsInserted: number;
    elapsedMs: number;
    error: string | null;
  } | null>(null);
  const [migratingCanonical, setMigratingCanonical] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ inserted?: number; message: string; error?: boolean; deprecated?: boolean } | null>(null);
  const [releasingLock, setReleasingLock] = useState(false);
  const [confirmReleaseLock, setConfirmReleaseLock] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollMaxRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [jobHistory, setJobHistory] = useState<any[]>([]);
  const [jobHistoryLoading, setJobHistoryLoading] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  // Refresh stats cards every 5 minutes so counts don't go stale during a long session
  useEffect(() => {
    if (!isAuthenticated) return;
    const statsTimer = setInterval(() => loadData(), 5 * 60 * 1000);
    return () => clearInterval(statsTimer);
  }, [isAuthenticated]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/user', {
        credentials: 'include',
      });
      if (response.ok) {
        const userData = await response.json();
        if (userData.role === 'admin') {
          setUser(userData);
          setIsAuthenticated(true);
          loadData();
          loadSystemHealth();
        } else {
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [statsRes, patternsRes] = await Promise.all([
        fetch('/api/stats', { credentials: 'include' }),
        fetch('/api/admin/trusted-patterns', { credentials: 'include' }),
      ]);
      
      if (statsRes.ok) {
        const envelope = await statsRes.json();
        setStats(unwrapApiEnvelope(envelope));
      }
      if (patternsRes.ok) {
        setPatterns(await patternsRes.json());
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        page: logsPage.toString(),
        limit: '25',
        status: logsFilter,
        search: logsSearch,
      });
      
      if (logsPeriod) {
        params.set('period', logsPeriod);
      } else {
        if (logsStartDate) params.set('startDate', logsStartDate);
        if (logsEndDate) params.set('endDate', logsEndDate);
      }

      const res = await fetch(`/api/admin/verification-logs?${params}`, {
        credentials: 'include',
      });

      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLogsLoading(false);
    }
  }, [logsPage, logsFilter, logsSearch, logsStartDate, logsEndDate, logsPeriod]);

  const loadRecentActivity = useCallback(async () => {
    setRecentActivityLoading(true);
    try {
      const res = await fetch('/api/admin/recent-activity', { credentials: 'include' });
      if (res.ok) {
        setRecentActivity(await res.json());
      }
    } catch (error) {
      console.error('Failed to load recent activity:', error);
    } finally {
      setRecentActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'logs') {
      loadLogs();
      loadRecentActivity();
    }
  }, [isAuthenticated, loadLogs, loadRecentActivity, activeTab]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        page: usersPage.toString(),
        limit: '25',
        search: usersSearch,
        ...(usersPaidOnly ? { paidOnly: 'true' } : {}),
      });
      
      const res = await fetch(`/api/admin/users?${params}`, {
        credentials: 'include',
      });
      
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, [usersPage, usersSearch, usersPaidOnly]);

  // ── Notification Portal loaders ────────────────────────────────────────────

  const loadNotifStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/notifications/status', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setNotifPaused(d.paused); }
    } catch { /* silent */ }
  }, []);

  const toggleNotifPaused = async () => {
    setNotifPausedLoading(true);
    try {
      const endpoint = notifPaused ? '/api/admin/notifications/resume' : '/api/admin/notifications/pause';
      const r = await fetch(endpoint, { method: 'POST', credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setNotifPaused(d.paused);
        toast({ title: d.paused ? 'Notifications paused' : 'Notifications resumed', description: d.paused ? 'No alerts will be sent until resumed.' : 'All alerts are now active.' });
      }
    } catch { toast({ title: 'Error', description: 'Failed to toggle notification state', variant: 'destructive' }); }
    finally { setNotifPausedLoading(false); }
  };

  const loadNotifUsers = useCallback(async () => {
    setNotifUsersLoading(true);
    try {
      const params = new URLSearchParams({ page: notifUsersPage.toString(), limit: '20', search: notifUsersSearch });
      const r = await fetch(`/api/admin/notifications/users?${params}`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setNotifUsers(d.data); setNotifUsersTotal(d.total); }
    } catch { /* silent */ }
    finally { setNotifUsersLoading(false); }
  }, [notifUsersPage, notifUsersSearch]);

  const loadNotifLog = useCallback(async () => {
    setNotifLogLoading(true);
    try {
      const params = new URLSearchParams({ page: notifLogPage.toString(), limit: '25' });
      const r = await fetch(`/api/admin/notifications/log?${params}`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setNotifLogEntries(d.data); setNotifLogTotal(d.total); }
    } catch { /* silent */ }
    finally { setNotifLogLoading(false); }
  }, [notifLogPage]);

  const handleDeleteUser = async (userId: string) => {
    setDeletingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toast({ title: 'User deleted', description: 'The account has been deactivated and the user logged out.' });
        loadUsers();
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ title: body.message || 'Delete failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleCosBetaEnable = async (limit: number | null) => {
    if (!cosBetaDialog) return;
    try {
      const res = await fetch(`/api/admin/users/${cosBetaDialog.userId}/cos-beta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: true, limit }),
      });
      if (res.ok) {
        toast({ title: 'COS Beta enabled', description: 'Access granted' + (limit ? ` with a limit of ${limit}/day` : '') + '.' });
        loadUsers();
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ title: body.message || 'Failed to enable COS Beta', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to enable COS Beta', variant: 'destructive' });
    } finally {
      setCosBetaDialog(null);
      setCosBetaLimitInput('');
    }
  };

  const handleCosBetaDisable = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/cos-beta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: false, limit: null }),
      });
      if (res.ok) {
        toast({ title: 'COS Beta disabled' });
        loadUsers();
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ title: body.message || 'Failed to disable COS Beta', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to disable COS Beta', variant: 'destructive' });
    }
  };

  // Load users when Users tab is selected
  useEffect(() => {
    if (isAuthenticated && activeTab === 'users') {
      loadUsers();
    }
  }, [isAuthenticated, activeTab, loadUsers]);

  // Load global rules when Knowledge tab is selected
  const loadGlobalRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const res = await fetch('/api/admin/global-rules', { credentials: 'include' });
      if (res.ok) {
        setGlobalRules(await res.json());
      }
    } catch (error) {
      console.error('Failed to load global rules:', error);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const loadSponsorMonitorData = useCallback(async () => {
    setSponsorStatusLoading(true);
    setRecentChangesLoading(true);
    setTopWatchedLoading(true);
    setNotifStatsLoading(true);
    try {
      const [statusRes, changesRes, watchedRes, statsRes] = await Promise.all([
        fetch('/api/admin/sponsor-monitor/status', { credentials: 'include' }),
        fetch('/api/admin/sponsor-monitor/recent-changes', { credentials: 'include' }),
        fetch('/api/admin/sponsor-monitor/top-watched', { credentials: 'include' }),
        fetch('/api/admin/sponsor-monitor/notification-stats', { credentials: 'include' }),
      ]);
      if (statusRes.ok) setSponsorStatus(await statusRes.json());
      if (changesRes.ok) setRecentChanges(await changesRes.json());
      if (watchedRes.ok) setTopWatched(await watchedRes.json());
      if (statsRes.ok) setNotifStats(await statsRes.json());
    } catch (error) {
      console.error('Failed to load sponsor monitor data:', error);
      toast({ title: "Error", description: "Failed to load sponsor monitor data", variant: "destructive" });
    } finally {
      setSponsorStatusLoading(false);
      setRecentChangesLoading(false);
      setTopWatchedLoading(false);
      setNotifStatsLoading(false);
    }
  }, []);

  const loadJobHistory = useCallback(async () => {
    setJobHistoryLoading(true);
    try {
      const res = await fetch('/api/admin/sponsor-monitor/job-history', { credentials: 'include' });
      if (res.ok) setJobHistory(await res.json());
    } catch {
      // non-critical — silently skip
    } finally {
      setJobHistoryLoading(false);
    }
  }, []);

  const stopPolling = () => {
    if (pollRef.current)    { clearInterval(pollRef.current);    pollRef.current    = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    if (pollMaxRef.current) { clearTimeout(pollMaxRef.current);  pollMaxRef.current  = null; }
  };

  const stopInitPolling = () => {
    if (initPollRef.current) { clearInterval(initPollRef.current); initPollRef.current = null; }
  };

  const handleRunSponsorJob = async () => {
    setRunConfirmOpen(false);
    setRunResult(null);
    setRunError(null);
    setRunElapsed(0);
    setRunningJob(true);
    stopPolling();
    try {
      const res = await fetch('/api/admin/sponsor-monitor/run', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (res.status === 202) {
        // Handle accepted job
        const data = await res.json();
        setRunResult(data.message);
        toast({ title: "Job Accepted", description: data.message });

        // Elapsed timer: tick every second
        elapsedRef.current = setInterval(() => setRunElapsed(s => s + 1), 1000);

        // Auto-stop polling after 30 minutes — prevents infinite spinner if job crashes silently
        pollMaxRef.current = setTimeout(() => {
          stopPolling();
          setRunningJob(false);
          setRunError('Job timed out after 30 minutes — check server logs or Force Release Lock.');
          toast({ title: "Job Timed Out", description: "No response after 30 min. Check server logs.", variant: "destructive" });
        }, 30 * 60 * 1000);

        // Poll status every 5 seconds until job finishes
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch('/api/admin/sponsor-monitor/status', { credentials: 'include' });
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();
            
            // Check if the job is still running by looking at the actual running status
            const isActuallyRunning = statusData.jobRunning;
            
            setSponsorStatus(statusData);
            
            if (!isActuallyRunning) {
              stopPolling();
              setRunningJob(false);
              loadJobHistory();
              if (statusData.lastRun?.success === false) {
                setRunError(statusData.lastRun?.error || 'Job failed — check server logs.');
                toast({ title: "Job Failed", description: statusData.lastRun?.error || 'Run failed', variant: "destructive" });
              } else {
                setRunResult(`Job completed. ${statusData.lastRun?.changesDetected ?? 0} changes detected.`);
                toast({ title: "Job Completed", description: `${statusData.lastRun?.recordsProcessed?.toLocaleString() ?? '?'} records processed.` });
                loadSponsorMonitorData();
              }
            }
          } catch { /* network blip — keep polling */ }
        }, 5000);
      } else if (res.status === 409) {
        // Conflict - already running
        const data = await res.json();
        setRunError(data.message);
        toast({ title: "Conflict", description: data.message, variant: "destructive" });
        setRunningJob(false);
      } else {
        // Other error
        const data = await res.json();
        setRunError(data.message || 'Failed to start job');
        toast({ title: "Error", description: data.message, variant: "destructive" });
        setRunningJob(false);
      }
    } catch (error) {
      setRunError('Network error — could not reach server.');
      toast({ title: "Error", description: "Failed to trigger job", variant: "destructive" });
      setRunningJob(false);
    }
  };

  const startInitPolling = (jobId: string) => {
    stopInitPolling();
    initPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/sponsor-monitor/init-progress/${jobId}`, {
          credentials: 'include',
        });
        if (!res.ok) return; // transient network blip — keep polling
        const data = await res.json();

        setInitProgress({
          stage: data.stage,
          progressPct: data.progressPct,
          rowsInserted: data.rowsInserted,
          elapsedMs: data.elapsedMs,
          error: data.error,
        });

        if (data.done) {
          stopInitPolling();
          setInitializing(false);
          if (data.stage === 'done') {
            toast({
              title: "Initialized",
              description: `Loaded ${data.rowsInserted?.toLocaleString()} records for ${data.snapshotDate}`,
            });
            loadSponsorMonitorData();
            loadStorageStats();
            loadJobHistory();
            setInitProgress(null);
          } else {
            // stage === 'failed'
            toast({
              title: "Initialization Failed",
              description: data.error || "Unknown error — check server logs.",
              variant: "destructive",
            });
          }
        }
      } catch {
        // network blip — keep polling
      }
    }, 3000);
  };

  const handleInitialize = async () => {
    setInitConfirmOpen(false);
    setInitializing(true);
    setInitProgress(null);
    setInitJobId(null);
    stopInitPolling();

    try {
      const res = await fetch('/api/admin/sponsor-monitor/initialize', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();

      if (res.status === 409) {
        if (data.jobId) {
          // A job is already in flight — resume polling it
          setInitJobId(data.jobId);
          toast({ title: "Job In Progress", description: "An initialization is already running. Tracking it now." });
          startInitPolling(data.jobId);
          return;
        }
        // Snapshot already exists
        toast({ title: "Already Initialized", description: data.message });
        setInitializing(false);
        return;
      }

      if (!res.ok) {
        toast({ title: "Error", description: data.message || "Failed to start initialization", variant: "destructive" });
        setInitializing(false);
        return;
      }

      // 202 Accepted — job started
      const { jobId } = data;
      setInitJobId(jobId);
      toast({ title: "Initialization Started", description: "Downloading sponsor register in the background…" });
      startInitPolling(jobId);

    } catch {
      toast({ title: "Error", description: "Failed to reach server", variant: "destructive" });
      setInitializing(false);
    }
  };

  const handleMigrateCanonical = async () => {
    setMigratingCanonical(true);
    setMigrateResult(null);
    try {
      const res = await fetch('/api/admin/sponsor-monitor/rebuild-index', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setMigrateResult({ inserted: data.count, message: data.message });
        toast({ title: "Search Index Rebuilt", description: data.message });
        loadSponsorMonitorData();
      } else {
        setMigrateResult({ message: data.message || 'Failed to rebuild index', error: true });
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch {
      setMigrateResult({ message: 'Network error', error: true });
      toast({ title: "Error", description: "Failed to rebuild search index", variant: "destructive" });
    } finally {
      setMigratingCanonical(false);
    }
  };

  const handleReleaseLock = async () => {
    setReleasingLock(true);
    try {
      const res = await fetch('/api/admin/sponsor-monitor/release-lock', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      toast({ title: res.ok ? "Lock Released" : "Error", description: data.message, variant: res.ok ? "default" : "destructive" });
      if (res.ok) { stopPolling(); setRunningJob(false); loadSponsorMonitorData(); }
    } catch {
      toast({ title: "Error", description: "Failed to release lock", variant: "destructive" });
    } finally {
      setReleasingLock(false);
    }
  };

  const loadStorageStats = useCallback(async () => {
    setStorageLoading(true);
    try {
      const res = await fetch('/api/admin/sponsor-monitor/storage', { credentials: 'include' });
      if (res.ok) setStorageStats(await res.json());
    } catch (error) {
      console.error('Failed to load storage stats:', error);
    } finally {
      setStorageLoading(false);
    }
  }, []);

  const handleCleanup = async () => {
    setCleanupConfirmOpen(false);
    setCleaningUp(true);
    try {
      const res = await fetch('/api/admin/sponsor-monitor/cleanup', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Cleanup Complete", description: data.message });
        loadStorageStats();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to clean up", variant: "destructive" });
    } finally {
      setCleaningUp(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && activeTab === 'knowledge') {
      loadGlobalRules();
    }
    if (isAuthenticated && activeTab === 'sponsor') {
      loadSponsorMonitorData();
      loadStorageStats();
      loadJobHistory();
    }
  }, [isAuthenticated, activeTab, loadGlobalRules, loadSponsorMonitorData, loadStorageStats, loadJobHistory]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'notifications') {
      loadNotifStatus();
      loadNotifUsers();
      loadNotifLog();
    }
  }, [isAuthenticated, activeTab, loadNotifStatus, loadNotifUsers, loadNotifLog]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'notifications') loadNotifUsers();
  }, [isAuthenticated, notifUsersPage, notifUsersSearch]); // eslint-disable-line

  useEffect(() => {
    if (isAuthenticated && activeTab === 'notifications') loadNotifLog();
  }, [isAuthenticated, notifLogPage]); // eslint-disable-line

  // Keep activeTab in sync when user navigates via browser back/forward
  useEffect(() => {
    if (domain === 'sponsor' && activeTab !== 'sponsor' && activeTab !== 'licenceCheck') {
      setActiveTab('licenceCheck');
    } else if (domain === 'cos' && (activeTab === 'sponsor' || activeTab === 'licenceCheck')) {
      setActiveTab('patterns');
    }
  }, [domain]); // eslint-disable-line react-hooks/exhaustive-deps

  const createGlobalRule = async () => {
    if (!newRuleCategory || !newRuleText) {
      toast({ title: 'Missing fields', description: 'Category and rule text are required', variant: 'destructive' });
      return;
    }

    try {
      const res = await fetch('/api/admin/global-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newRuleCategory, ruleText: newRuleText, priority: newRulePriority }),
        credentials: 'include',
      });

      if (res.ok) {
        toast({ title: 'Rule created', description: 'AI will now follow this rule during analysis' });
        setNewRuleCategory('');
        setNewRuleText('');
        setNewRulePriority(0);
        loadGlobalRules();
      }
    } catch (error) {
      toast({ title: 'Failed to create rule', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
    }
  };

  const toggleRule = async (id: number, isActive: boolean) => {
    try {
      await fetch(`/api/admin/global-rules/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
        credentials: 'include',
      });
      loadGlobalRules();
    } catch (error) {
      toast({ title: 'Failed to toggle rule', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
    }
  };

  const deleteRule = async (id: number) => {
    try {
      await fetch(`/api/admin/global-rules/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      toast({ title: 'Rule deleted' });
      loadGlobalRules();
    } catch (error) {
      toast({ title: 'Failed to delete rule', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
    }
  };

  const updateRule = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/global-rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ category: editCategory, ruleText: editText, priority: editPriority }),
      });
      if (res.ok) {
        toast({ title: 'Rule updated' });
        setEditingRuleId(null);
        loadGlobalRules();
      } else {
        toast({ title: 'Failed to update rule', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to update rule', variant: 'destructive' });
    }
  };

  const handleRuleDrop = async (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    const ordered = [...globalRules];
    const fromIdx = ordered.findIndex(r => r.id === dragId);
    const toIdx = ordered.findIndex(r => r.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    // Assign priorities: highest index → highest priority
    const updates = ordered.map((r, i) => ({ id: r.id, priority: (ordered.length - i) * 10 }));
    setGlobalRules(ordered.map((r, i) => ({ ...r, priority: updates[i].priority })));
    setDragId(null); setDragOverId(null);
    try {
      await Promise.all(updates.map(({ id, priority }) =>
        fetch(`/api/admin/global-rules/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ priority }),
        })
      ));
    } catch {
      toast({ title: 'Failed to save order', variant: 'destructive' });
      loadGlobalRules();
    }
  };

  const teachAi = async () => {
    if (!teachAiInput || !selectedLog) return;
    
    setTeachingAi(true);
    try {
      const res = await fetch('/api/admin/teach-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationId: selectedLog.id,
          category: teachAiCategory,
          ruleText: teachAiInput,
          priority: 10,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        toast({ 
          title: 'AI trained successfully', 
          description: 'This pattern has been added to the knowledge base' 
        });
        setTeachAiInput('');
        loadGlobalRules(); // Refresh rules list
      } else {
        const error = await res.json();
        toast({ 
          title: 'Failed to teach AI', 
          description: error.message || 'Please check your rule text',
          variant: 'destructive' 
        });
      }
    } catch (error) {
      toast({ title: 'Failed to teach AI', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
    } finally {
      setTeachingAi(false);
    }
  };

  // HITL: Approve a verification log
  const handleApproveLog = async (log: VerificationLog) => {
    setFeedbackLoading(true);
    try {
      const res = await fetch(`/api/logs/${log.id}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminStatus: 'approved' }),
        credentials: 'include',
      });

      if (res.ok) {
        toast({ title: 'Verification approved', description: 'The AI result has been confirmed' });
        loadLogs(); // Refresh logs
      } else {
        const error = await res.json();
        toast({ title: 'Failed to approve', description: error.message, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Failed to approve', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
    } finally {
      setFeedbackLoading(false);
    }
  };

  // HITL: Open feedback modal for marking as fake
  const handleOpenFeedbackModal = (log: VerificationLog) => {
    setFeedbackLog(log);
    setFeedbackReasoning('');
    setFeedbackModalOpen(true);
  };

  // HITL: Submit fake feedback with reasoning
  const handleSubmitFakeFeedback = async () => {
    if (!feedbackLog || !feedbackReasoning.trim()) {
      toast({ title: 'Please provide reasoning', description: 'Explain why you believe this document is fake', variant: 'destructive' });
      return;
    }

    setFeedbackLoading(true);
    try {
      const res = await fetch(`/api/logs/${feedbackLog.id}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminStatus: 'fake',
          adminFeedback: feedbackReasoning,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        toast({ 
          title: 'Result overridden to Fake', 
          description: 'The verification result has been updated and the admin reasoning has been added to the AI knowledge base permanently.', 
        });
        setFeedbackModalOpen(false);
        loadLogs(); // Refresh logs
      } else {
        const error = await res.json();
        toast({ title: 'Failed to submit feedback', description: error.message, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Failed to submit feedback', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
    } finally {
      setFeedbackLoading(false);
    }
  };

  // Delete a verification log entry
  const handleDeleteLog = async (log: VerificationLog) => {
    try {
      const res = await fetch(`/api/logs/${log.id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        toast({ title: 'Log deleted' });
        setDeleteConfirmLog(null);
        setDeleteConfirmActivity(null);
        loadLogs();
        loadRecentActivity();
      } else {
        const err = await res.json();
        toast({ title: 'Failed to delete', description: err.message, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Failed to delete', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
    }
  };

  // Get admin status badge with conflict detection
  const getAdminStatusBadge = (log: VerificationLog) => {
    const adminStatus = (log as any).adminStatus || 'pending';
    const aiResult = log.result;
    const isConflict =
      (adminStatus === 'fake' && aiResult === 'genuine') ||
      (adminStatus === 'approved' && aiResult === 'suspicious');

    if (adminStatus === 'pending') {
      return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">Pending Review</Badge>;
    }
    if (isConflict) {
      return (
        <Badge className="bg-orange-500/20 text-orange-400 border-2 border-orange-500 ring-1 ring-orange-400/40" title={`AI said ${aiResult} but admin marked ${adminStatus}`}>
          ⚠ Overridden
        </Badge>
      );
    }
    if (adminStatus === 'approved') {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500">Approved</Badge>;
    }
    if (adminStatus === 'fake') {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500">Marked Fake</Badge>;
    }
    return null;
  };

  const loadSystemHealth = async () => {
    try {
      const res = await fetch('/api/admin/system-health', { credentials: 'include' });
      if (res.ok) {
        setSystemHealth(await res.json());
      }
    } catch (error) {
      console.error('Failed to load system health:', error);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginSuccess('');
    setLoginLoading(true);

    try {
      const response = await fetch('/api/auth/admin/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to send code');
      }

      setLoginSuccess('Verification code sent to your email');
      setLoginStep('verify');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginSuccess('');
    setLoginLoading(true);

    try {
      const response = await fetch('/api/auth/admin/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, code: loginOtp }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Verification failed');
      }

      setUser(data.user);
      setIsAuthenticated(true);
      loadData();
      loadSystemHealth();
      toast({ title: 'Login successful', description: 'Welcome to the admin portal' });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoginError('');
    setLoginSuccess('');
    setLoginLoading(true);

    try {
      const response = await fetch('/api/auth/admin/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend code');
      }

      setLoginSuccess('New verification code sent');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include' 
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    setIsAuthenticated(false);
    setUser(null);
    setStats(null);
    setPatterns([]);
    setLogs(null);
    window.location.href = '/';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreviewLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/extract-metadata', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUploadPreview({
          file,
          metadata: data.metadata || {},
        });
        setAiInstructions('');
      } else {
        toast({ title: 'Failed to extract metadata', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Failed to preview file', variant: 'destructive' });
    } finally {
      setPreviewLoading(false);
      e.target.value = '';
    }
  };

  const confirmUpload = async () => {
    if (!uploadPreview) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', uploadPreview.file);
    if (aiInstructions) {
      formData.append('aiInstructions', aiInstructions);
    }

    try {
      const response = await fetch('/api/admin/trusted-patterns', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Server error ${response.status}`);
      }

      toast({ title: 'Upload successful', description: 'Document added to trusted patterns with AI instructions' });
      setUploadPreview(null);
      setAiInstructions('');
      loadData();
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const cancelUpload = () => {
    setUploadPreview(null);
    setAiInstructions('');
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/trusted-patterns/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Server error ${response.status}`);
      }

      toast({ title: 'Deleted', description: 'Pattern removed successfully' });
      loadData();
    } catch (error) {
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
    }
  };

  const trustProducer = async (producer: string, verificationId: number) => {
    try {
      const response = await fetch('/api/admin/trust-producer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producer, verificationId }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to trust producer');
      }

      toast({ title: 'Producer Trusted', description: `"${producer}" is now a trusted producer` });
      loadData();
    } catch (error) {
      toast({ title: 'Error', description: 'Could not trust producer', variant: 'destructive' });
    }
  };

  const toggleUserRestriction = async (userId: string, restricted: boolean, reason?: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/restrict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restricted, reason }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to update user');
      }

      toast({ 
        title: restricted ? 'User Restricted' : 'Restriction Removed',
        description: restricted ? 'User can no longer verify documents' : 'User access has been restored'
      });
      loadUsers();
    } catch (error) {
      toast({ title: 'Error', description: 'Could not update user', variant: 'destructive' });
    }
  };

  const runAiAnalysis = async (log: VerificationLog) => {
    setSelectedLog(log);
    setAiPanelOpen(true);
    setAiAnalysis('');
    setAiLoading(true);

    try {
      const response = await fetch(`/api/admin/analyze-reasoning/${log.id}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.provider) {
                setAiAnalysis(prev => prev + `*Using ${data.provider} AI*\n\n`);
              }
              if (data.content) {
                setAiAnalysis(prev => prev + data.content);
              }
              if (data.done) {
                setAiLoading(false);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      toast({ title: 'Analysis failed', description: 'Could not analyze verification', variant: 'destructive' });
      setAiLoading(false);
    }
  };

  const getStatusBadge = (result: string, confidence: number) => {
    switch (result) {
      case 'genuine':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50"><CheckCircle className="w-3 h-3 mr-1" /> Genuine ({confidence}%)</Badge>;
      case 'suspicious':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50"><AlertTriangle className="w-3 h-3 mr-1" /> Suspicious ({confidence}%)</Badge>;
      case 'fake':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50"><XCircle className="w-3 h-3 mr-1" /> Fake ({confidence}%)</Badge>;
      default:
        return <Badge variant="outline">{result}</Badge>;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="bg-red-500/10 p-4 rounded-full">
                <Shield className="w-12 h-12 text-red-500" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Forensic Command Center</h1>
            <p className="text-gray-500 dark:text-slate-400">Secure OTP login for administrators</p>
          </div>

          <Card className="border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">
                {loginStep === 'email' ? 'Admin Sign In' : 'Verify Your Identity'}
              </CardTitle>
              <CardDescription className="text-gray-500 dark:text-slate-400">
                {loginStep === 'email' 
                  ? 'Enter your admin email to receive a verification code'
                  : `Enter the 6-digit code sent to ${loginEmail}`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loginStep === 'email' ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  {loginError && (
                    <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                      <AlertDescription>{loginError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-700 dark:text-slate-200">Admin Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Enter admin email address"
                      required
                      className="bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                      data-testid="input-admin-email"
                      autoComplete="email"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
                    data-testid="button-send-otp"
                  >
                    {loginLoading ? 'Sending...' : 'Send Verification Code'}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  {loginError && (
                    <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                      <AlertDescription>{loginError}</AlertDescription>
                    </Alert>
                  )}
                  
                  {loginSuccess && (
                    <Alert className="bg-green-500/10 border-green-500/50">
                      <AlertDescription className="text-green-400">{loginSuccess}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="otp" className="text-gray-700 dark:text-slate-200">Verification Code</Label>
                    <Input
                      id="otp"
                      type="text"
                      value={loginOtp}
                      onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter 6-digit code"
                      required
                      maxLength={6}
                      className="bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white text-center text-xl tracking-widest"
                      data-testid="input-otp-code"
                      autoComplete="one-time-code"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loginLoading || loginOtp.length !== 6}
                    className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
                    data-testid="button-verify-otp"
                  >
                    {loginLoading ? 'Verifying...' : 'Verify & Sign In'}
                  </Button>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginStep('email');
                        setLoginOtp('');
                        setLoginError('');
                        setLoginSuccess('');
                      }}
                      className="text-sm text-gray-500 dark:text-slate-400 hover:text-white transition-colors"
                    >
                      Change email
                    </button>
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={loginLoading}
                      className="text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      Resend code
                    </button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
          
          <p className="text-center text-gray-400 dark:text-slate-500 text-sm mt-6">
            Authorized personnel only. Unauthorized access is prohibited.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* System Health Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm px-3 sm:px-6 py-2 sm:py-3 sticky top-0 z-10">
        <div className="flex justify-between items-center max-w-[1800px] mx-auto">
          <div className="flex items-center gap-2 sm:gap-3">
            <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-red-500 shrink-0" />
            <div>
              <h1 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white leading-tight">Forensic Command Center</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 hidden sm:block">COS Verification Management</p>
            </div>
          </div>
          
          {/* System Health Stats */}
          {systemHealth && (
            <div className="hidden lg:flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${systemHealth.database.status === 'healthy' ? 'text-green-400' : 'text-red-400'}`} />
                <span className="text-gray-500 dark:text-slate-400">DB:</span>
                <span className="text-gray-700 dark:text-slate-200">{systemHealth.database.connections} conn</span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span className="text-gray-500 dark:text-slate-400">Memory:</span>
                <span className="text-gray-700 dark:text-slate-200">{systemHealth.memory.heapUsed}MB / {systemHealth.memory.heapTotal}MB</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <span className="text-gray-500 dark:text-slate-400">Uptime:</span>
                <span className="text-gray-700 dark:text-slate-200">{formatUptime(systemHealth.uptime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <span className="text-gray-500 dark:text-slate-400">Users:</span>
                <span className="text-gray-700 dark:text-slate-200">{systemHealth.stats.totalUsers} ({systemHealth.stats.proUsers} pro)</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-gray-600 dark:text-slate-300 hidden sm:inline text-sm truncate max-w-[160px]">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout} className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700" data-testid="button-logout">
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto p-3 sm:p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 sm:p-3 bg-blue-500/10 rounded-lg shrink-0">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 truncate">Trusted Patterns</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{stats?.trustedPatterns || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 sm:p-3 bg-green-500/10 rounded-lg shrink-0">
                  <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 truncate">Genuine Today</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{stats?.genuineVerified || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 sm:p-3 bg-yellow-500/10 rounded-lg shrink-0">
                  <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 truncate">Suspicious</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{stats?.suspiciousDetected || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 sm:p-3 bg-purple-500/10 rounded-lg shrink-0">
                  <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 truncate">Total Today</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{stats?.verificationsToday || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Top-level domain navigation ── */}
        <Tabs value={domain} onValueChange={handleDomainChange} className="mb-4 sm:mb-6">
          <TabsList className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm p-1">
            <TabsTrigger value="cos" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-900/30 dark:data-[state=active]:text-indigo-400">
              <FileCheck className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">COS Document Verification</span>
            </TabsTrigger>
            <TabsTrigger value="sponsor" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-700 dark:data-[state=active]:bg-cyan-900/30 dark:data-[state=active]:text-cyan-400">
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">Sponsor Licence Tools</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ── Section tabs (inner) ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
          <div className="overflow-x-auto -mx-3 sm:-mx-0 px-3 sm:px-0 scrollbar-hide">
            <TabsList className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm p-1 flex w-max min-w-full sm:w-auto sm:min-w-0">
              {domain === 'sponsor' ? (
                <>
                  <TabsTrigger value="licenceCheck" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-400">
                    <Search className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm">Licence Check</span>
                  </TabsTrigger>
                  <TabsTrigger value="sponsor" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-700 dark:data-[state=active]:bg-cyan-900/30 dark:data-[state=active]:text-cyan-400">
                    <Radio className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm">Sponsor Monitor</span>
                  </TabsTrigger>
                  <TabsTrigger value="enrichment" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-900/30 dark:data-[state=active]:text-violet-400">
                    <TrendingUp className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm">Enrichment Queue</span>
                  </TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger value="patterns" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-900/30 dark:data-[state=active]:text-emerald-400">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm">Patterns</span>
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 dark:data-[state=active]:bg-orange-900/30 dark:data-[state=active]:text-orange-400">
                    <Upload className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm">Upload</span>
                  </TabsTrigger>
                  <TabsTrigger value="users" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 dark:data-[state=active]:bg-purple-900/30 dark:data-[state=active]:text-purple-400">
                    <Users className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm">Users</span>
                  </TabsTrigger>
                  <TabsTrigger value="logs" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-400">
                    <Eye className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm">Verification Logs</span>
                  </TabsTrigger>
                  <TabsTrigger value="knowledge" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap data-[state=active]:bg-pink-50 data-[state=active]:text-pink-700 dark:data-[state=active]:bg-pink-900/30 dark:data-[state=active]:text-pink-400">
                    <Brain className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm">AI Rules</span>
                  </TabsTrigger>
                  <TabsTrigger value="notifications" className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-900/30 dark:data-[state=active]:text-amber-400">
                    <Bell className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm">Notifications</span>
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </div>

          {/* ── Phase 3: Verification Logs Explorer ── */}
          <TabsContent value="logs">
            <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Recent Activity
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-slate-400">
                      Last {recentActivity.length} verifications
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={loadRecentActivity}
                    disabled={recentActivityLoading}
                    aria-label="Refresh recent activity"
                    title="Refresh recent activity"
                    className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <RefreshCw className={`w-4 h-4 ${recentActivityLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-slate-400">No recent activity.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-700">
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-slate-400">Time</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-slate-400">Document</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-slate-400">Result</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-slate-400">Confidence</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-slate-400">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentActivity.map((activity) => (
                          <tr key={activity.id} className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                            <td className="py-2 px-3 text-gray-600 dark:text-slate-400 whitespace-nowrap">
                              {new Date(activity.verifiedAt).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-gray-900 dark:text-white max-w-xs truncate" title={activity.filename}>
                              {activity.filename}
                            </td>
                            <td className="py-2 px-3">
                              <Badge
                                className={
                                  activity.result === 'genuine' ? 'bg-green-500/20 text-green-400 border-green-500' :
                                  activity.result === 'suspicious' ? 'bg-amber-500/20 text-amber-400 border-amber-500' :
                                  'bg-red-500/20 text-red-400 border-red-500'
                                }
                              >
                                {activity.result.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-gray-600 dark:text-slate-400">{activity.confidence}%</td>
                            <td className="py-2 px-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmActivity(activity)}
                                aria-label={`Delete ${activity.filename}`}
                                title="Delete this activity entry"
                                className="text-gray-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                      <CardTitle className="text-gray-900 dark:text-white">Verification Logs</CardTitle>
                      <CardDescription className="text-gray-500 dark:text-slate-400">
                        {logs?.total || 0} total verifications
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                        <Input
                          placeholder="Search filename..."
                          value={logsSearchInput}
                          onChange={(e) => {
                            setLogsSearchInput(e.target.value);
                            if (logsSearchDebounceRef.current) clearTimeout(logsSearchDebounceRef.current);
                            logsSearchDebounceRef.current = setTimeout(() => { setLogsSearch(e.target.value); setLogsPage(1); }, 400);
                          }}
                          className="pl-9 w-48 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                        />
                      </div>
                      <Select value={logsFilter} onValueChange={(v) => { setLogsFilter(v as any); setLogsPage(1); }}>
                        <SelectTrigger className="w-32 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white">
                          <Filter className="w-4 h-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="genuine">Genuine</SelectItem>
                          <SelectItem value="suspicious">Suspicious</SelectItem>
                          <SelectItem value="fake">Fake</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={loadLogs}
                        disabled={logsLoading}
                        aria-label="Refresh logs"
                        title="Refresh logs"
                        className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                      >
                        <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  {/* Period shortcuts + Date Range Filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    {(['today', '7d', '30d', '90d'] as const).map((p) => (
                      <Button
                        key={p}
                        size="sm"
                        variant={logsPeriod === p ? 'default' : 'outline'}
                        onClick={() => { setLogsPeriod(logsPeriod === p ? '' : p); setLogsStartDate(''); setLogsEndDate(''); setLogsPage(1); }}
                        className={`text-xs ${logsPeriod !== p ? 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700' : ''}`}
                      >
                        {p === 'today' ? 'Today' : p}
                      </Button>
                    ))}
                    <span className="text-gray-300 dark:text-slate-600">|</span>
                    <Label className="text-gray-500 dark:text-slate-400 text-sm">From:</Label>
                    <Input
                      type="date"
                      value={logsStartDate}
                      onChange={(e) => { setLogsStartDate(e.target.value); setLogsPeriod(''); setLogsPage(1); }}
                      className="w-40 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                    />
                    <Label className="text-gray-500 dark:text-slate-400 text-sm">To:</Label>
                    <Input
                      type="date"
                      value={logsEndDate}
                      onChange={(e) => { setLogsEndDate(e.target.value); setLogsPeriod(''); setLogsPage(1); }}
                      className="w-40 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                    />
                    {(logsStartDate || logsEndDate || logsPeriod) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setLogsStartDate(''); setLogsEndDate(''); setLogsPeriod(''); setLogsPage(1); }}
                        className="text-gray-500 dark:text-slate-400 hover:text-white"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {logsLoading && !logs ? (
                  <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  </div>
                ) : logs?.data.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 mt-4">
                    <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700 relative">
                      <div className="absolute inset-0 bg-slate-100 dark:bg-slate-800 rounded-full animate-ping opacity-20" />
                      <Eye className="w-10 h-10 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Verification Logs Found</h3>
                    <p className="text-gray-500 dark:text-slate-400 max-w-sm mx-auto mb-6">
                      Adjust your date range filters or wait for new verifications to be processed by users.
                    </p>
                    {(logsStartDate || logsEndDate || logsPeriod) && (
                      <Button variant="outline" onClick={() => { setLogsStartDate(''); setLogsEndDate(''); setLogsPeriod(''); setLogsPage(1); }} className="rounded-full">
                        Clear Current Filters
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-slate-700">
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Time</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium hidden md:table-cell">User</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Filename</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Result</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Admin Review</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium hidden sm:table-cell">Producer</th>
                            <th className="text-right py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs?.data.map((log) => (
                            <tr
                              key={log.id}
                              className={`border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer ${
                                (log as any).adminStatus === 'fake'
                                  ? 'bg-red-50/40 dark:bg-red-900/10'
                                  : (log as any).adminStatus === 'approved'
                                  ? 'bg-green-50/30 dark:bg-green-900/10'
                                  : 'bg-amber-50/20 dark:bg-amber-900/5'
                              }`}
                              onClick={() => setSelectedLog(log)}
                            >
                              <td className="py-3 px-4 text-gray-600 dark:text-slate-300 text-sm whitespace-nowrap">
                                {new Date(log.verifiedAt).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-gray-600 dark:text-slate-300 text-xs max-w-[160px] truncate hidden md:table-cell">
                                {log.userEmail ?? (log.userId ? log.userId.slice(0, 8) + '…' : <span className="text-gray-400 dark:text-slate-500">anon</span>)}
                              </td>
                              <td className="py-3 px-4 text-gray-900 dark:text-white font-medium max-w-[200px] truncate">
                                {log.filename}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-col gap-1">
                                  {getStatusBadge(log.result, log.confidence)}
                                  {(log as any).adminStatus === 'fake' && (
                                    <span className="text-[10px] font-medium text-red-500 dark:text-red-400 uppercase tracking-wide">Admin override</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {getAdminStatusBadge(log)}
                              </td>
                              <td className="py-3 px-4 text-gray-600 dark:text-slate-300 text-sm max-w-[150px] truncate hidden sm:table-cell">
                                {log.metadata?.producer || 'Unknown'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => { e.stopPropagation(); handleApproveLog(log); }}
                                    disabled={feedbackLoading}
                                    className={(log as any).adminStatus === 'approved'
                                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                      : 'text-gray-400 hover:bg-green-500/20 hover:text-green-400'}
                                    title={(log as any).adminStatus === 'approved' ? 'Approved — click to undo' : 'Approve AI result'}
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => { e.stopPropagation(); handleOpenFeedbackModal(log); }}
                                    disabled={feedbackLoading}
                                    className={(log as any).adminStatus === 'fake'
                                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                      : 'text-gray-400 hover:bg-red-500/20 hover:text-red-400'}
                                    title={(log as any).adminStatus === 'fake' ? 'Marked fake — click to override' : 'Mark as fake'}
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => { e.stopPropagation(); runAiAnalysis(log); }}
                                    className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                                    title="AI analysis"
                                  >
                                    <Sparkles className="w-4 h-4 sm:mr-1" />
                                    <span className="hidden sm:inline">Analyze</span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmLog(log); }}
                                    className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                                    title="Delete log"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {logs && logs.totalPages > 1 && (
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                          Page {logs.page} of {logs.totalPages} &middot; {logs.total.toLocaleString()} entries
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLogsPage(p => Math.max(1, p - 1))}
                            disabled={logs.page === 1}
                            className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLogsPage(p => Math.min(logs.totalPages, p + 1))}
                            disabled={logs.page === logs.totalPages}
                            className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                  <div>
                    <CardTitle className="text-gray-900 dark:text-white">User Management</CardTitle>
                    <CardDescription className="text-gray-500 dark:text-slate-400">
                      {users?.total || 0} {usersPaidOnly ? 'paid' : 'registered'} users
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={usersPaidOnly ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setUsersPaidOnly(v => !v); setUsersPage(1); }}
                      className={usersPaidOnly
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                        : "border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"}
                    >
                      Paid Only
                    </Button>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                      <Input
                        placeholder="Search users..."
                        value={usersSearchInput}
                        onChange={(e) => {
                          setUsersSearchInput(e.target.value);
                          if (usersSearchDebounceRef.current) clearTimeout(usersSearchDebounceRef.current);
                          usersSearchDebounceRef.current = setTimeout(() => { setUsersSearch(e.target.value); setUsersPage(1); }, 400);
                        }}
                        className="pl-9 w-48 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={loadUsers}
                      disabled={usersLoading}
                      aria-label="Refresh users"
                      title="Refresh users"
                      className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                    >
                      <RefreshCw className={`w-4 h-4 ${usersLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {usersLoading && !users ? (
                  <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  </div>
                ) : users?.data.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 mt-4">
                    <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700">
                      <Users className="w-10 h-10 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Users Found</h3>
                    <p className="text-gray-500 dark:text-slate-400 max-w-sm mx-auto">
                      Try adjusting your search terminology or clear the current search query.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-slate-700">
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Email</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Role</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Status</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">CoS Beta</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Limit</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Joined</th>
                            <th className="text-right py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users?.data.map((u) => (
                            <tr key={u.id} className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                              <td className="py-3 px-4 text-gray-900 dark:text-white font-medium max-w-[140px] sm:max-w-none">
                                <span className="block truncate" title={u.email || 'N/A'}>{u.email || 'N/A'}</span>
                              </td>
                              <td className="py-3 px-4">
                                <Badge className={
                                  u.role === 'admin'
                                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                }>
                                  {u.role}
                                </Badge>
                              </td>
                              <td className="py-3 px-4">
                                {u.isRestricted ? (
                                  <Badge className="bg-red-500/20 text-red-400">Restricted</Badge>
                                ) : u.role === 'admin' ? (
                                  <Badge className="bg-purple-500/20 text-purple-400">Admin</Badge>
                                ) : (
                                  <select
                                    className="bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white text-sm rounded px-2 py-1"
                                    value={u.subscriptionStatus === 'unlimited' || u.subscriptionStatus === 'enterprise' ? 'pro' : u.subscriptionStatus || 'free'}
                                    onChange={async (e) => {
                                      const plan = e.target.value as 'free' | 'starter' | 'pro';
                                      try {
                                        const r = await fetch(`/api/admin/users/${u.id}/sponsor-monitor-plan`, {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ plan }),
                                          credentials: 'include',
                                        });
                                        if (r.ok) {
                                          toast({ title: 'Plan updated', description: `${u.email} → ${plan.charAt(0).toUpperCase() + plan.slice(1)}` });
                                          loadUsers();
                                        } else {
                                          const body = await r.json().catch(() => ({}));
                                          toast({ title: body.message || 'Failed to update plan', variant: 'destructive' });
                                        }
                                      } catch {
                                        toast({ title: 'Failed to update plan', variant: 'destructive' });
                                      }
                                    }}
                                  >
                                    <option value="free">Free</option>
                                    <option value="starter">Starter</option>
                                    <option value="pro">Pro</option>
                                  </select>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {u.cosCheckApproved ? (
                                  <Badge className="bg-green-500/20 text-green-400">Approved</Badge>
                                ) : (
                                  <Badge className="bg-slate-500/20 text-gray-500 dark:text-slate-400">Pending</Badge>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  className="bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white text-sm rounded px-2 py-1"
                                  value={u.verificationLimit === null ? 'default' : u.verificationLimit === -1 ? 'unlimited' : String(u.verificationLimit)}
                                  onChange={async (e) => {
                                    const val = e.target.value;
                                    const limit = val === 'default' ? null : val === 'unlimited' ? -1 : parseInt(val);
                                    try {
                                      await fetch(`/api/admin/users/${u.id}/limit`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ limit }),
                                        credentials: 'include'
                                      });
                                      toast({ title: 'Limit updated', description: val === 'unlimited' ? 'User has unlimited verifications' : val === 'default' ? 'User has default limit (1/day)' : `User has ${val} verifications` });
                                      loadUsers();
                                    } catch {
                                      toast({ title: 'Failed to update limit', variant: 'destructive' });
                                    }
                                  }}
                                >
                                  <option value="default">Default (1/day)</option>
                                  <option value="unlimited">Unlimited</option>
                                  <option value="10">10 total</option>
                                  <option value="25">25 total</option>
                                  <option value="50">50 total</option>
                                  <option value="100">100 total</option>
                                </select>
                              </td>
                              <td className="py-3 px-4 text-gray-500 dark:text-slate-400 text-sm">
                                {new Date(u.createdAt).toLocaleDateString()}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {u.role !== 'admin' && (
                                  <div className="flex gap-2 justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={async () => {
                                        try {
                                          await fetch(`/api/admin/users/${u.id}/cos-approval`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ approved: !u.cosCheckApproved }),
                                            credentials: 'include',
                                          });
                                          toast({
                                            title: u.cosCheckApproved ? 'Beta access revoked' : 'Beta access approved',
                                            description: u.cosCheckApproved ? 'User can no longer verify documents' : 'User will receive an email confirmation',
                                          });
                                          loadUsers();
                                        } catch {
                                          toast({ title: 'Failed to update beta access', variant: 'destructive' });
                                        }
                                      }}
                                      className={u.cosCheckApproved ? 'border-red-500 text-red-400 hover:bg-red-500/10' : 'border-green-600 text-green-400 hover:bg-green-500/10'}
                                    >
                                      {u.cosCheckApproved ? 'Revoke' : 'Approve'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={u.isRestricted ? 'outline' : 'destructive'}
                                      onClick={() => toggleUserRestriction(u.id, !u.isRestricted, 'Admin restriction')}
                                      className={u.isRestricted ? 'border-green-600 text-green-400 hover:bg-green-500/10' : ''}
                                    >
                                      {u.isRestricted ? 'Unrestrict' : 'Restrict'}
                                    </Button>
                                    <div className="flex items-center gap-1.5">
                                      <Switch
                                        checked={!!u.cosBetaEnabled}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setCosBetaLimitInput('');
                                            setCosBetaDialog({ open: true, userId: u.id, currentLimit: u.cosBetaLimit ?? null });
                                          } else {
                                            handleCosBetaDisable(u.id);
                                          }
                                        }}
                                        aria-label="COS Beta"
                                      />
                                      <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">Beta</span>
                                    </div>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="destructive"
                                          disabled={deletingUserId === u.id}
                                        >
                                          <Trash2 size={14} className="mr-1" />
                                          Delete
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete {u.email ?? u.id}?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will immediately deactivate the account and log the user out. Their email remains intact so they can re-register, but this session and all data access will be revoked. This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            onClick={() => handleDeleteUser(u.id)}
                                          >
                                            Delete Account
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {users && users.totalPages > 1 && (
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                          Page {users.page} of {users.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                            disabled={users.page === 1}
                            className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUsersPage(p => Math.min(users.totalPages, p + 1))}
                            disabled={users.page === users.totalPages}
                            className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Notification Portal ── */}
          <TabsContent value="notifications">
            <div className="space-y-6">

              {/* Section 1: Global Kill Switch */}
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                        <Bell className="w-5 h-5" />
                        Global Notification Control
                      </CardTitle>
                      <CardDescription className="text-gray-500 dark:text-slate-400 mt-1">
                        Pause all outbound alerts (email, SMS) instantly. Use when testing or updating the system.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      {notifPaused === null ? (
                        <span className="text-sm text-gray-400">Loading…</span>
                      ) : (
                        <>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${notifPaused ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                            <span className={`w-2 h-2 rounded-full ${notifPaused ? 'bg-red-500' : 'bg-emerald-500'}`} />
                            {notifPaused ? 'PAUSED' : 'ACTIVE'}
                          </span>
                          <Button
                            variant={notifPaused ? 'default' : 'destructive'}
                            size="sm"
                            onClick={toggleNotifPaused}
                            disabled={notifPausedLoading}
                            className={notifPaused ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                          >
                            {notifPausedLoading ? 'Saving…' : notifPaused ? 'Resume Notifications' : 'Pause All Notifications'}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {notifPaused && (
                  <CardContent>
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                      Notifications are currently <strong>paused</strong>. No email or SMS alerts will be sent to any user until you resume.
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Section 2: Per-User Notification Matrix */}
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle className="text-gray-900 dark:text-white">User Notification Preferences</CardTitle>
                      <CardDescription className="text-gray-500 dark:text-slate-400">
                        {notifUsersTotal} users · Click a row to view or edit their event/channel settings
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search users..."
                          value={notifUsersSearch}
                          onChange={(e) => { setNotifUsersSearch(e.target.value); setNotifUsersPage(1); }}
                          className="pl-8 w-48 text-sm"
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={loadNotifUsers}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {notifUsersLoading ? (
                    <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-gray-400" /></div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400">Email</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400">Plan</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400 hidden md:table-cell">Events enabled</th>
                          </tr>
                        </thead>
                        <tbody>
                          {notifUsers.map((u: any) => {
                            const prefs = u.notifPrefs ?? {};
                            const EVENT_LABELS: Record<string, string> = {
                              licence_revoked: 'Revoked',
                              rating_downgraded: 'Downgraded',
                              licence_reinstated: 'Reinstated',
                              rating_upgraded: 'Upgraded',
                              route_added: 'Route+',
                              route_removed: 'Route−',
                              weekly_digest: 'Digest',
                            };
                            const enabledEvents = Object.entries(EVENT_LABELS)
                              .filter(([k]) => prefs[k]?.enabled !== false)
                              .map(([, label]) => label);

                            return (
                              <>
                                <tr
                                  key={u.id}
                                  className="border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer"
                                  onClick={() => setExpandedNotifUser(expandedNotifUser === u.id ? null : u.id)}
                                >
                                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800 dark:text-slate-200">{u.email}</td>
                                  <td className="px-4 py-2.5">
                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.subscriptionStatus === 'pro' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : u.subscriptionStatus === 'starter' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {u.subscriptionStatus ?? 'free'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 hidden md:table-cell">
                                    <div className="flex flex-wrap gap-1">
                                      {enabledEvents.map(label => (
                                        <span key={label} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded text-xs">{label}</span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                                {expandedNotifUser === u.id && (
                                  <tr key={`${u.id}-expanded`} className="bg-amber-50/50 dark:bg-amber-900/10">
                                    <td colSpan={3} className="px-4 py-4">
                                      <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-3">Edit notification preferences for <strong>{u.email}</strong></div>
                                      <div className="overflow-x-auto">
                                        <table className="text-xs border-collapse">
                                          <thead>
                                            <tr>
                                              <th className="text-left pr-6 pb-2 font-medium text-gray-500">Event</th>
                                              <th className="pr-4 pb-2 font-medium text-gray-500">Enabled</th>
                                              <th className="pr-4 pb-2 font-medium text-gray-500">Email</th>
                                              <th className="pr-4 pb-2 font-medium text-gray-500">In-App</th>
                                              <th className="pr-4 pb-2 font-medium text-gray-500">SMS</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {Object.entries(EVENT_LABELS).map(([key, label]) => {
                                              const eventPrefs = prefs[key] ?? { enabled: true, channels: { email: true, inApp: true, sms: false } };
                                              const save = async (patch: any) => {
                                                const r = await fetch(`/api/admin/notifications/users/${u.id}/prefs`, {
                                                  method: 'PATCH',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  credentials: 'include',
                                                  body: JSON.stringify({ [key]: patch }),
                                                });
                                                if (r.ok) {
                                                  const d = await r.json();
                                                  setNotifUsers(prev => prev.map(uu => uu.id === u.id ? { ...uu, notifPrefs: d.notifPrefs } : uu));
                                                  toast({ title: 'Prefs saved', description: `${label} updated for ${u.email}` });
                                                }
                                              };
                                              return (
                                                <tr key={key} className="border-b border-amber-100 dark:border-amber-900/20">
                                                  <td className="pr-6 py-1.5 font-medium text-gray-700 dark:text-slate-300">{label}</td>
                                                  <td className="pr-4 py-1.5 text-center">
                                                    <Switch checked={eventPrefs.enabled} onCheckedChange={(v) => save({ ...eventPrefs, enabled: v })} />
                                                  </td>
                                                  <td className="pr-4 py-1.5 text-center">
                                                    <Switch checked={eventPrefs.channels?.email ?? true} onCheckedChange={(v) => save({ ...eventPrefs, channels: { ...eventPrefs.channels, email: v } })} />
                                                  </td>
                                                  <td className="pr-4 py-1.5 text-center">
                                                    <Switch checked={eventPrefs.channels?.inApp ?? true} onCheckedChange={(v) => save({ ...eventPrefs, channels: { ...eventPrefs.channels, inApp: v } })} />
                                                  </td>
                                                  <td className="pr-4 py-1.5 text-center">
                                                    <Switch checked={eventPrefs.channels?.sms ?? false} onCheckedChange={(v) => save({ ...eventPrefs, channels: { ...eventPrefs.channels, sms: v } })} />
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                      {/* Pagination */}
                      {notifUsersTotal > 20 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-slate-700">
                          <span className="text-sm text-gray-500">{notifUsersTotal} users</span>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={notifUsersPage <= 1} onClick={() => setNotifUsersPage(p => p - 1)}>
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm px-2 py-1">{notifUsersPage}</span>
                            <Button variant="outline" size="sm" disabled={notifUsersPage * 20 >= notifUsersTotal} onClick={() => setNotifUsersPage(p => p + 1)}>
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Section 3: Notification Activity Log */}
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-gray-900 dark:text-white">Notification Activity Log</CardTitle>
                      <CardDescription className="text-gray-500 dark:text-slate-400">
                        {notifLogTotal} total events · Recent outbound alerts
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadNotifLog}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {notifLogLoading ? (
                    <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-gray-400" /></div>
                  ) : notifLogEntries.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">No notification activity yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400">User</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400 hidden sm:table-cell">Company</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400">Event</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400 hidden md:table-cell">Channel</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400">Status</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-slate-400 hidden lg:table-cell">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {notifLogEntries.map((entry: any) => (
                            <tr key={entry.id} className="border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                              <td className="px-4 py-2 font-mono text-xs text-gray-700 dark:text-slate-300 max-w-[140px] truncate">{entry.userEmail ?? entry.userId}</td>
                              <td className="px-4 py-2 text-gray-600 dark:text-slate-400 hidden sm:table-cell max-w-[160px] truncate">{entry.companyName}</td>
                              <td className="px-4 py-2">
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded text-xs">{entry.eventType}</span>
                              </td>
                              <td className="px-4 py-2 text-gray-500 dark:text-slate-500 text-xs hidden md:table-cell">{entry.channel}</td>
                              <td className="px-4 py-2">
                                {entry.success ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle className="w-3 h-3" />sent</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400" title={entry.errorDetails ?? ''}><XCircle className="w-3 h-3" />failed</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-400 hidden lg:table-cell">
                                {entry.sentAt ? new Date(entry.sentAt).toLocaleString() : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {notifLogTotal > 25 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-slate-700">
                          <span className="text-sm text-gray-500">{notifLogTotal} total</span>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={notifLogPage <= 1} onClick={() => setNotifLogPage(p => p - 1)}>
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm px-2 py-1">{notifLogPage}</span>
                            <Button variant="outline" size="sm" disabled={notifLogPage * 25 >= notifLogTotal} onClick={() => setNotifLogPage(p => p + 1)}>
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* COS Beta Enable Dialog */}
          {cosBetaDialog && (
            <Dialog open={cosBetaDialog.open} onOpenChange={(open) => { if (!open) { setCosBetaDialog(null); setCosBetaLimitInput(''); } }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enable COS Beta Access</DialogTitle>
                  <DialogDescription>
                    Grant this user COS Beta access. Optionally set a daily verification limit. Paid users will receive a notification email.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <Label htmlFor="beta-limit" className="text-sm font-medium">Daily Limit (optional)</Label>
                  <Input
                    id="beta-limit"
                    type="number"
                    min={1}
                    placeholder="Leave blank for no limit"
                    value={cosBetaLimitInput}
                    onChange={(e) => setCosBetaLimitInput(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setCosBetaDialog(null); setCosBetaLimitInput(''); }}>Cancel</Button>
                  <Button
                    onClick={() => {
                      const parsed = cosBetaLimitInput ? parseInt(cosBetaLimitInput) : null;
                      handleCosBetaEnable(parsed && parsed > 0 ? parsed : null);
                    }}
                  >
                    Enable Beta Access
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Trusted Patterns Tab */}
          <TabsContent value="patterns">
            <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white">Trusted COS Patterns</CardTitle>
                <CardDescription className="text-gray-500 dark:text-slate-400">
                  These documents are used as reference for verification
                </CardDescription>
              </CardHeader>
              <CardContent>
                {patterns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 mt-4">
                    <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-blue-500/10 dark:shadow-none border border-blue-100 dark:border-slate-700 relative">
                      <div className="absolute inset-0 bg-blue-100 dark:bg-slate-800 rounded-full blur-md opacity-50" />
                      <FileText className="w-10 h-10 text-blue-500 relative z-10" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Trusted Patterns</h3>
                    <p className="text-gray-500 dark:text-slate-400 max-w-md mx-auto mb-6">
                      Upload genuine Certificate of Sponsorship documents to establish a baseline. The AI uses these patterns to detect anomalies in user submissions.
                    </p>
                    <Button onClick={() => setActiveTab('upload')} className="rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 font-medium px-6">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload First Pattern
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {patterns.map((pattern) => (
                      <div
                        key={pattern.id}
                        className="p-4 bg-gray-100 dark:bg-slate-700/50 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-blue-400" />
                            <div>
                              <p className="text-gray-900 dark:text-white font-medium">{pattern.filename}</p>
                              <p className="text-sm text-gray-500 dark:text-slate-400">
                                Uploaded: {new Date(pattern.uploadedAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(pattern.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            data-testid={`button-delete-pattern-${pattern.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        {pattern.metadata && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600">
                            <p className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-2">Forensic Metadata</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                              <div>
                                <p className="text-gray-500 dark:text-slate-400">Producer</p>
                                <p className="text-gray-700 dark:text-slate-200 truncate">{pattern.metadata.forensic?.producer || pattern.metadata.producer || 'Unknown'}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 dark:text-slate-400">Creator</p>
                                <p className="text-gray-700 dark:text-slate-200 truncate">{pattern.metadata.forensic?.creator || pattern.metadata.creator || 'Unknown'}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 dark:text-slate-400">Created</p>
                                <p className="text-gray-700 dark:text-slate-200 truncate">{pattern.metadata.forensic?.created || pattern.metadata.creationDate || 'Unknown'}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 dark:text-slate-400">Fonts</p>
                                <p className="text-gray-700 dark:text-slate-200">{pattern.metadata.forensic?.fontCount || pattern.metadata.fontCount || 0} fonts</p>
                              </div>
                            </div>
                            {pattern.metadata.forensic?.suspiciousIndicators && pattern.metadata.forensic.suspiciousIndicators.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs text-yellow-400">Warnings: {pattern.metadata.forensic.suspiciousIndicators.join(', ')}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload">
            <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white">Upload Genuine COS Document</CardTitle>
                <CardDescription className="text-gray-500 dark:text-slate-400">
                  Upload a genuine Certificate of Sponsorship with optional AI instructions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!uploadPreview ? (
                  <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-8 text-center">
                    <Upload className="w-12 h-12 text-gray-400 dark:text-slate-500 mx-auto mb-4" />
                    <p className="text-gray-900 dark:text-white mb-2">Drop a PDF file here or click to browse</p>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Only PDF files are accepted</p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileSelect}
                      disabled={previewLoading}
                      className="hidden"
                      id="file-upload"
                      data-testid="input-file-upload"
                    />
                    <Button asChild disabled={previewLoading}>
                      <label htmlFor="file-upload" className="cursor-pointer">
                        {previewLoading ? 'Extracting metadata...' : 'Select File'}
                      </label>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-gray-900 dark:text-white font-medium">{uploadPreview.file.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400">{(uploadPreview.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={cancelUpload}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="bg-gray-100 dark:bg-slate-900 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        Extracted Metadata
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-400 dark:text-slate-500">Producer:</span>
                          <span className="ml-2 text-gray-900 dark:text-white">{uploadPreview.metadata?.producer || 'Unknown'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 dark:text-slate-500">Creator:</span>
                          <span className="ml-2 text-gray-900 dark:text-white">{uploadPreview.metadata?.creator || 'Unknown'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 dark:text-slate-500">Created:</span>
                          <span className="ml-2 text-gray-900 dark:text-white">{uploadPreview.metadata?.creationDate || 'Unknown'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 dark:text-slate-500">Modified:</span>
                          <span className="ml-2 text-gray-900 dark:text-white">{uploadPreview.metadata?.modificationDate || 'Unknown'}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        Forensic Instructions for AI (Optional)
                      </Label>
                      <textarea
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                        placeholder="Add specific notes about this document pattern. E.g., 'This department always uses Microsoft Word 365 as the producer' or 'Documents from this employer are always created on weekdays only.'"
                        className="w-full h-32 p-3 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-slate-500 resize-none"
                      />
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                        These instructions will be used by AI during document analysis to detect forgeries more accurately.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Button onClick={confirmUpload} disabled={uploading} className="flex-1">
                        {uploading ? 'Uploading...' : 'Confirm & Add to Trusted Patterns'}
                      </Button>
                      <Button variant="outline" onClick={cancelUpload} className="border-gray-300 dark:border-slate-600">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Phase 4: Global AI Rules ── */}
          <TabsContent value="knowledge">
            <div className="space-y-4">

              {/* ── Create new rule ── */}
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                    <Brain className="w-5 h-5 text-pink-400" />
                    Global AI Rules
                  </CardTitle>
                  <CardDescription className="text-gray-500 dark:text-slate-400">
                    Rules applied to every AI analysis — define categories, criteria, and priority weighting.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
                    {/* Category */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wide">Category</Label>
                      <Input
                        placeholder="e.g. Font Consistency"
                        value={newRuleCategory}
                        onChange={(e) => setNewRuleCategory(e.target.value)}
                        className="bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                      />
                    </div>
                    {/* Rule text */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wide">Rule</Label>
                      <Input
                        placeholder="e.g. Flag if font changes mid-document"
                        value={newRuleText}
                        onChange={(e) => setNewRuleText(e.target.value)}
                        className="bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                      />
                    </div>
                    {/* Priority */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wide">Priority</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="0"
                        value={newRulePriority === 0 ? '' : newRulePriority}
                        onChange={(e) => setNewRulePriority(Number(e.target.value) || 0)}
                        className="w-20 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                      />
                    </div>
                    {/* Add button */}
                    <Button
                      onClick={createGlobalRule}
                      disabled={!newRuleCategory || !newRuleText}
                      className="bg-pink-600 hover:bg-pink-700 text-white gap-1.5 self-end"
                    >
                      <Plus className="w-4 h-4" />
                      Add Rule
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ── Rules list ── */}
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-gray-900 dark:text-white text-base">
                        Rules
                        {globalRules.length > 0 && (
                          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-slate-400">
                            ({globalRules.filter(r => r.isActive).length} active / {globalRules.length} total)
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription className="text-gray-500 dark:text-slate-400 text-xs mt-0.5">
                        Drag to reorder priority. Click the pencil to edit inline.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={loadGlobalRules}
                      disabled={rulesLoading}
                      aria-label="Refresh rules"
                      className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 shrink-0"
                    >
                      <RefreshCw className={`w-4 h-4 ${rulesLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Loading */}
                  {rulesLoading && (
                    <div className="flex justify-center py-12">
                      <div className="w-8 h-8 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
                    </div>
                  )}

                  {/* Empty state */}
                  {!rulesLoading && globalRules.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20">
                      <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100 dark:border-slate-700">
                        <Brain className="w-7 h-7 text-slate-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No rules yet</h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400 max-w-xs">
                        Add your first rule above to start guiding AI analysis decisions.
                      </p>
                    </div>
                  )}

                  {/* Rules cards — drag-to-reorder */}
                  {!rulesLoading && globalRules.length > 0 && (
                    <div className="space-y-2">
                      {globalRules.map((rule) => (
                        <div
                          key={rule.id}
                          draggable
                          onDragStart={() => setDragId(rule.id)}
                          onDragOver={(e) => { e.preventDefault(); setDragOverId(rule.id); }}
                          onDrop={() => handleRuleDrop(rule.id)}
                          onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                          className={`rounded-lg border transition-all ${
                            dragOverId === rule.id && dragId !== rule.id
                              ? 'border-pink-400 bg-pink-50/30 dark:bg-pink-900/10'
                              : rule.isActive
                              ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60'
                              : 'border-gray-200 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-900/30 opacity-60'
                          } ${dragId === rule.id ? 'opacity-40 scale-95' : ''}`}
                        >
                          {editingRuleId === rule.id ? (
                            /* ── Edit mode ── */
                            <div className="p-3 space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                                <Input
                                  value={editCategory}
                                  onChange={(e) => setEditCategory(e.target.value)}
                                  placeholder="Category"
                                  className="text-sm bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600"
                                />
                                <Input
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  placeholder="Rule text"
                                  className="text-sm bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600"
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editPriority}
                                  onChange={(e) => setEditPriority(Number(e.target.value) || 0)}
                                  placeholder="Priority"
                                  className="w-20 text-sm bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600"
                                />
                              </div>
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="outline" onClick={() => setEditingRuleId(null)} className="text-xs">Cancel</Button>
                                <Button size="sm" onClick={() => updateRule(rule.id)} className="text-xs bg-pink-600 hover:bg-pink-700 text-white">Save</Button>
                              </div>
                            </div>
                          ) : (
                            /* ── View mode ── */
                            <div className="flex items-start gap-3 p-3">
                              {/* Drag handle */}
                              <div className="mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 dark:text-slate-600 shrink-0 select-none">
                                ⠿
                              </div>
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                  <Badge className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
                                    {rule.category}
                                  </Badge>
                                  {rule.isActive ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
                                      <CheckCircle className="w-3 h-3 mr-1 inline" />Active
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-gray-400/10 text-gray-500 dark:text-slate-500 border-gray-400/20 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
                                      <XCircle className="w-3 h-3 mr-1 inline" />Disabled
                                    </Badge>
                                  )}
                                  <span className="font-mono text-[10px] text-gray-400 dark:text-slate-500">p={rule.priority}</span>
                                </div>
                                <p className="text-sm text-gray-700 dark:text-slate-300 leading-snug">{rule.ruleText}</p>
                              </div>
                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Edit rule"
                                  className="w-7 h-7 text-gray-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                                  onClick={() => {
                                    setEditingRuleId(rule.id);
                                    setEditCategory(rule.category);
                                    setEditText(rule.ruleText);
                                    setEditPriority(rule.priority);
                                  }}
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => toggleRule(rule.id, !rule.isActive)}
                                  title={rule.isActive ? 'Disable rule' : 'Enable rule'}
                                  className={`w-7 h-7 ${
                                    rule.isActive
                                      ? 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteRule(rule.id)}
                                  title="Delete rule"
                                  className="w-7 h-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Enrichment Queue Tab */}
          <TabsContent value="enrichment">
            <EnrichmentQueueTab />
          </TabsContent>

          {/* Licence Check Tab */}
          <TabsContent value="licenceCheck">
            <SponsorLicenceSearch />
          </TabsContent>

          {/* Sponsor Monitor Tab */}
          <TabsContent value="sponsor">
            <div className="space-y-6">
              {/* Status Card */}
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                        <Radio className="w-5 h-5 text-blue-400" />
                        Sponsor Monitor Status
                      </CardTitle>
                      <CardDescription className="text-gray-500 dark:text-slate-400">
                        UK Home Office Register monitoring dashboard
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={loadSponsorMonitorData}
                        disabled={sponsorStatusLoading}
                        aria-label="Refresh sponsor monitor status"
                        title="Refresh sponsor monitor status"
                        className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                      >
                        <RefreshCw className={`w-4 h-4 sm:mr-1 ${sponsorStatusLoading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setRunConfirmOpen(true)}
                        disabled={runningJob || sponsorStatus?.jobRunning}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {runningJob || sponsorStatus?.jobRunning ? (
                          <>
                            <div className="w-4 h-4 sm:mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span className="hidden sm:inline">Running...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 sm:mr-1" />
                            <span className="hidden sm:inline">Run Now</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {sponsorStatusLoading && !sponsorStatus ? (
                    <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 py-4">
                      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Loading status...
                    </div>
                  ) : sponsorStatus ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-gray-100 dark:bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Last Run</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {sponsorStatus.lastRun?.date
                            ? new Date(sponsorStatus.lastRun.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : 'Never'}
                        </p>
                        {sponsorStatus.lastRun?.date && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                            {new Date(sponsorStatus.lastRun.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <div className="bg-gray-100 dark:bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Last Result</p>
                        <Badge className={sponsorStatus.lastRun?.success !== false ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                          {sponsorStatus.lastRun?.success !== false ? 'Success' : 'Failed'}
                        </Badge>
                      </div>
                      <div className="bg-gray-100 dark:bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Snapshot Records</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{(sponsorStatus.snapshotRecordCount || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-gray-100 dark:bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Active Watches</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{sponsorStatus.activeWatchCount || 0}</p>
                      </div>
                      <div className="bg-gray-100 dark:bg-slate-700/50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Notifications (24h)</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{sponsorStatus.notificationsSent24h || 0}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-slate-400 text-sm">No status data available.</p>
                  )}
                  {(runningJob || sponsorStatus?.jobRunning) && (
                    <div className="mt-4 flex items-center gap-3 text-sm text-blue-300">
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      <span>Running… {runElapsed > 0 && `(${Math.floor(runElapsed / 60)}m ${runElapsed % 60}s)`}</span>
                      {confirmReleaseLock ? (
                        <Button size="sm" variant="destructive" className="ml-auto h-7 text-xs" disabled={releasingLock} onClick={() => { setConfirmReleaseLock(false); handleReleaseLock(); }}>
                          {releasingLock ? 'Releasing…' : 'Confirm Release?'}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="ml-auto h-7 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => { setConfirmReleaseLock(true); setTimeout(() => setConfirmReleaseLock(false), 4000); }} title="Only use if job is genuinely stuck">
                          Force Release Lock
                        </Button>
                      )}
                    </div>
                  )}
                  {runResult && !runError && !(runningJob || sponsorStatus?.jobRunning) && (
                    <Alert className="mt-4 bg-blue-500/10 border-blue-500/30">
                      <AlertDescription className="text-blue-300">{runResult}</AlertDescription>
                    </Alert>
                  )}
                  {runError && (
                    <Alert className="mt-4 bg-red-500/10 border-red-500/30">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <AlertDescription className="text-red-300 text-xs font-mono break-all">{runError}</AlertDescription>
                    </Alert>
                  )}
                  {!runError && sponsorStatus?.lastRun?.success === false && sponsorStatus?.lastRun?.error && (
                    <Alert className="mt-4 bg-red-500/10 border-red-500/30">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <AlertDescription className="text-red-300 text-xs font-mono break-all">
                        Last run failed: {sponsorStatus.lastRun.error}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Run History Card */}
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-gray-900 dark:text-white text-base flex items-center gap-2">
                      <History className="w-4 h-4 text-blue-400" />
                      Run History
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={loadJobHistory}
                      disabled={jobHistoryLoading}
                      className="h-7 px-2 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${jobHistoryLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <CardDescription className="text-gray-500 dark:text-slate-400">
                    Last {jobHistory.length || '…'} nightly sponsor monitor job runs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {jobHistoryLoading && jobHistory.length === 0 ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-7 bg-gray-100 dark:bg-slate-700 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : jobHistory.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-slate-400">No runs recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700">
                            <th className="text-left py-1.5 pr-3 font-medium">Date</th>
                            <th className="text-left py-1.5 pr-3 font-medium">Source</th>
                            <th className="text-left py-1.5 pr-3 font-medium">Status</th>
                            <th className="text-right py-1.5 pr-3 font-medium">Records</th>
                            <th className="text-right py-1.5 pr-3 font-medium">Changes</th>
                            <th className="text-right py-1.5 font-medium">Duration</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                          {jobHistory.map((run: any) => (
                            <tr key={run.id} title={run.errorMessage || undefined}>
                              <td className="py-1.5 pr-3 text-gray-700 dark:text-slate-300 font-mono">{run.runDate}</td>
                              <td className="py-1.5 pr-3 text-gray-500 dark:text-slate-400 capitalize">{run.source}</td>
                              <td className="py-1.5 pr-3">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium
                                  ${run.status === 'success'
                                    ? 'bg-green-500/10 text-green-500 dark:text-green-400'
                                    : 'bg-red-500/10 text-red-500 dark:text-red-400'}`}>
                                  {run.status}
                                </span>
                              </td>
                              <td className="py-1.5 pr-3 text-right text-gray-700 dark:text-slate-300 tabular-nums">
                                {run.recordsProcessed != null ? run.recordsProcessed.toLocaleString() : '—'}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">
                                {run.status === 'success' && run.changesDetected === 0 && run.recordsProcessed > 100000 ? (
                                  <span
                                    className="inline-flex items-center justify-end gap-1 text-amber-400"
                                    title="0 changes on 100k+ records — likely a gap-day fallback run (archive missing from disk). Trigger 'Run Now' to pick up missed changes."
                                  >
                                    0
                                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                  </span>
                                ) : (
                                  <span className="text-gray-700 dark:text-slate-300">
                                    {run.changesDetected ?? '—'}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 text-right text-gray-500 dark:text-slate-400 tabular-nums">
                                {run.durationMs != null
                                  ? run.durationMs < 60000
                                    ? `${Math.round(run.durationMs / 1000)}s`
                                    : `${Math.floor(run.durationMs / 60000)}m ${Math.round((run.durationMs % 60000) / 1000)}s`
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {jobHistory.some((r: any) => r.errorMessage) && (
                        <div className="mt-3 space-y-1 border-t border-gray-100 dark:border-slate-700 pt-2">
                          {jobHistory.filter((r: any) => r.errorMessage).slice(0, 3).map((r: any) => (
                            <p key={r.id} className="text-[11px] text-red-400 font-mono truncate">
                              {r.runDate}: {r.errorMessage}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Initialize / Storage Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Initialize Card */}
                <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-gray-900 dark:text-white text-base flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      Initialize Register
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-slate-400">
                      First-time setup: download the full sponsor register as baseline
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {sponsorStatus?.latestSnapshot && !initializing ? (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-green-400">Initialized on {sponsorStatus.latestSnapshot}</span>
                      </div>
                    ) : initializing && initProgress ? (
                      // ── Live progress bar (shown once first poll arrives) ──
                      <div className="space-y-3">
                        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5">
                          <div
                            className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${initProgress.progressPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                          <span>
                            {initProgress.stage === 'downloading' && 'Downloading CSV from gov.uk…'}
                            {initProgress.stage === 'inserting' && `Storing records… ${initProgress.rowsInserted.toLocaleString()} rows`}
                            {initProgress.stage === 'rebuilding_index' && 'Building search index…'}
                            {initProgress.stage === 'pending' && 'Starting…'}
                            {initProgress.stage === 'done' && 'Complete'}
                            {initProgress.stage === 'failed' && 'Failed'}
                          </span>
                          <span className="font-medium">{initProgress.progressPct}%</span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-slate-500">
                          Elapsed: {Math.round(initProgress.elapsedMs / 1000)}s
                        </p>
                        {initProgress.error && (
                          <Alert className="bg-red-500/10 border-red-500/30">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            <AlertDescription className="text-red-300 text-xs">{initProgress.error}</AlertDescription>
                          </Alert>
                        )}
                      </div>
                    ) : initializing ? (
                      // ── Spinner before first poll arrives ──
                      <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>Starting initialization…</span>
                      </div>
                    ) : (
                      // ── Not yet initialized ──
                      <div className="space-y-3">
                        <Alert className="bg-amber-500/10 border-amber-500/30">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <AlertDescription className="text-amber-300 text-sm">
                            No baseline snapshot exists. Initialize to download the full Home Office register (this may take a few minutes).
                          </AlertDescription>
                        </Alert>
                        <Button
                          onClick={() => setInitConfirmOpen(true)}
                          disabled={initializing}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Initialize Baseline
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Bootstrap Canonical / Search Index Card */}
                <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-gray-900 dark:text-white text-base flex items-center gap-2">
                      <Search className="w-4 h-4 text-violet-400" />
                      Populate Search Index
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-slate-400">
                      Copy snapshot data into the live search table (sponsor_canonical). Run once after Initialize.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {migrateResult && !migrateResult.error && !migrateResult.deprecated ? (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-green-400">{migrateResult.message}</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {migrateResult?.deprecated && (
                          <Alert className="bg-amber-500/10 border-amber-500/30">
                            <Info className="w-4 h-4 text-amber-400" />
                            <AlertDescription className="text-amber-300 text-xs">{migrateResult.message}</AlertDescription>
                          </Alert>
                        )}
                        {migrateResult?.error && (
                          <Alert className="bg-red-500/10 border-red-500/30">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            <AlertDescription className="text-red-300 text-xs">{migrateResult.message}</AlertDescription>
                          </Alert>
                        )}
                        <Button
                          onClick={handleMigrateCanonical}
                          disabled={migratingCanonical || !sponsorStatus?.latestSnapshot}
                          className="bg-violet-600 hover:bg-violet-700"
                        >
                          {migratingCanonical ? (
                            <><div className="w-4 h-4 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />Indexing…</>
                          ) : (
                            <><Database className="w-4 h-4 mr-1" />Build Search Index</>
                          )}
                        </Button>
                        {!sponsorStatus?.latestSnapshot && (
                          <p className="text-xs text-amber-400">Run Initialize first to download the snapshot.</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Storage Stats Card */}
                <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-gray-900 dark:text-white text-base flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-cyan-400" />
                      Database Storage
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-slate-400">Sponsor register data usage</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {storageLoading && !storageStats ? (
                      <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 py-2">
                        <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </div>
                    ) : storageStats ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gray-100 dark:bg-slate-700/30 rounded-lg p-2.5">
                            <p className="text-xs text-gray-500 dark:text-slate-400">Total Records</p>
                            <p className="text-base font-bold text-gray-900 dark:text-white">{(storageStats.totalRecords || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-gray-100 dark:bg-slate-700/30 rounded-lg p-2.5">
                            <p className="text-xs text-gray-500 dark:text-slate-400">Snapshots</p>
                            <p className="text-base font-bold text-gray-900 dark:text-white">{storageStats.snapshotCount || 0}</p>
                          </div>
                        </div>
                        {storageStats.earliestSnapshot && (
                          <div className="text-xs text-gray-500 dark:text-slate-400">
                            Date range: <span className="text-gray-600 dark:text-slate-300">{storageStats.earliestSnapshot}</span> to <span className="text-gray-600 dark:text-slate-300">{storageStats.latestSnapshot}</span>
                          </div>
                        )}
                        {storageStats.snapshotCount > 1 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCleanupConfirmOpen(true)}
                            disabled={cleaningUp}
                            className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            {cleaningUp ? (
                              <>
                                <div className="w-3 h-3 mr-1 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                                Cleaning...
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-3 h-3 mr-1" />
                                Clean Up Old Snapshots
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-400 dark:text-slate-500 text-sm">No data available.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Changes Table */}
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900 dark:text-white text-base">Recent Changes</CardTitle>
                  <CardDescription className="text-gray-500 dark:text-slate-400">Last {recentChanges.length || '…'} detected changes across all companies</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentChangesLoading ? (
                    <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 py-4">
                      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Loading changes...
                    </div>
                  ) : recentChanges.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/20 my-4">
                       <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-3 shadow-sm border border-slate-100 dark:border-slate-700">
                         <Activity className="w-6 h-6 text-slate-400" />
                       </div>
                       <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No Changes Detected</h4>
                       <p className="text-xs text-gray-500 dark:text-slate-400 max-w-[250px]">All monitored companies are currently stable without any recent licence downgrades or revocations.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-slate-700">
                              <th className="text-left text-gray-500 dark:text-slate-400 font-medium py-2 px-2">Date</th>
                              <th className="text-left text-gray-500 dark:text-slate-400 font-medium py-2 px-2">Company</th>
                              <th className="text-left text-gray-500 dark:text-slate-400 font-medium py-2 px-2">Change</th>
                              <th className="text-left text-gray-500 dark:text-slate-400 font-medium py-2 px-2">Previous</th>
                              <th className="text-left text-gray-500 dark:text-slate-400 font-medium py-2 px-2">New</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentChanges.map((change: any) => (
                              <tr key={change.id} className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                                <td className="py-2 px-2 text-gray-600 dark:text-slate-300 whitespace-nowrap">
                                  {change.detectedAt ? new Date(change.detectedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : change.snapshotDate}
                                </td>
                                <td className="py-2 px-2 text-gray-900 dark:text-white font-medium max-w-[200px] truncate" title={change.organisationName}>
                                  {change.organisationName}
                                </td>
                                <td className="py-2 px-2">
                                  <Badge className={
                                    change.changeType === 'REMOVED' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                    change.changeType === 'DOWNGRADED' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                    change.changeType === 'UPGRADED' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                    change.changeType === 'ADDED' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                    'bg-slate-500/20 text-gray-500 dark:text-slate-400 border-slate-500/30'
                                  }>
                                    {change.changeType}
                                  </Badge>
                                </td>
                                <td className="py-2 px-2 text-gray-500 dark:text-slate-400 max-w-[150px] truncate" title={change.previousValue || '-'}>
                                  {change.previousValue || '-'}
                                </td>
                                <td className="py-2 px-2 text-gray-500 dark:text-slate-400 max-w-[150px] truncate" title={change.newValue || '-'}>
                                  {change.newValue || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Watched Companies */}
                <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-gray-900 dark:text-white text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-amber-400" />
                      Top Watched Companies
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-slate-400">Companies with the most watchers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topWatchedLoading ? (
                      <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 py-4">
                        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </div>
                    ) : topWatched.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center my-2">
                        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center mb-4">
                          <TrendingUp className="w-8 h-8 text-amber-500/50" />
                        </div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No Active Watchers</h4>
                        <p className="text-xs text-gray-500 dark:text-slate-400 max-w-[220px]">Users haven't added any companies to their monitoring watchlists yet.</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {topWatched.map((company: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between py-2 px-3 bg-gray-100 dark:bg-slate-700/30 rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-400 dark:text-slate-500 w-5 text-right">#{idx + 1}</span>
                                <span className="text-sm text-gray-900 dark:text-white font-medium truncate max-w-[200px]" title={company.organisationName}>
                                  {company.organisationName}
                                </span>
                              </div>
                              <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                                {company.watcherCount} {company.watcherCount === 1 ? 'watcher' : 'watchers'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* Notification Delivery Summary */}
                <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-gray-900 dark:text-white text-base flex items-center gap-2">
                      <Bell className="w-4 h-4 text-purple-400" />
                      Notification Delivery (7 days)
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-slate-400">Sent vs failed by channel</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {notifStatsLoading ? (
                      <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 py-4">
                        <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </div>
                    ) : notifStats.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center my-2">
                        <div className="w-16 h-16 bg-purple-50 dark:bg-purple-950/30 rounded-full flex items-center justify-center mb-4">
                          <Bell className="w-8 h-8 text-purple-500/50" />
                        </div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No Notifications Sent</h4>
                        <p className="text-xs text-gray-500 dark:text-slate-400 max-w-[220px]">No alerts have been dispatched across any communication channels in the last 7 days.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(() => {
                          const channelSummary: Record<string, { sent: number; failed: number }> = {};
                          notifStats.forEach((row: any) => {
                            if (!channelSummary[row.channel]) channelSummary[row.channel] = { sent: 0, failed: 0 };
                            if (row.status === 'sent' || row.status === 'delivered') {
                              channelSummary[row.channel].sent += row.count;
                            } else if (row.status === 'failed') {
                              channelSummary[row.channel].failed += row.count;
                            }
                          });
                          return Object.entries(channelSummary).map(([channel, counts]) => {
                            const total = counts.sent + counts.failed;
                            const successRate = total > 0 ? Math.round((counts.sent / total) * 100) : 0;
                            return (
                              <div key={channel} className="bg-gray-100 dark:bg-slate-700/30 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{channel}</span>
                                  <span className="text-xs text-gray-500 dark:text-slate-400">{successRate}% success</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2 mb-2">
                                  <div
                                    className="bg-green-500 h-2 rounded-full transition-all"
                                    style={{ width: `${successRate}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-green-400">{counts.sent} sent</span>
                                  <span className="text-red-400">{counts.failed} failed</span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* AI Analysis Side Panel */}
      <Sheet open={aiPanelOpen} onOpenChange={setAiPanelOpen}>
        <SheetContent className="w-full sm:max-w-xl bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI Forensic Analysis
            </SheetTitle>
            <SheetDescription className="text-gray-500 dark:text-slate-400">
              {selectedLog?.filename} - {selectedLog?.result} ({selectedLog?.confidence}%)
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6">
            {aiLoading && !aiAnalysis && (
              <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400">
                <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Analyzing document...</span>
              </div>
            )}
            
            {aiAnalysis && (
              <div className="prose dark:prose-invert prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-gray-600 dark:text-slate-300 leading-relaxed">
                  {aiAnalysis}
                  {aiLoading && <span className="animate-pulse">|</span>}
                </div>
              </div>
            )}
          </div>

          {selectedLog && (
            <>
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-700">
                <MetadataGroupsPanel
                  metadata={selectedLog.metadata || {}}
                  aiAnnotations={deriveAiAnnotations(selectedLog.analysisDetails?.checks)}
                />
              </div>

              {/* Teach AI Section */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  Teach AI from This Document
                </h4>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                  Create a rule from this {selectedLog.result} document to help AI detect similar patterns.
                </p>
                <div className="space-y-3">
                  <Select value={teachAiCategory} onValueChange={setTeachAiCategory}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white">
                      <SelectValue placeholder="Rule category" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                      <SelectItem value="red_flag">Red Flag</SelectItem>
                      <SelectItem value="date_check">Date Check</SelectItem>
                      <SelectItem value="producer_check">Producer Check</SelectItem>
                      <SelectItem value="metadata_check">Metadata Check</SelectItem>
                      <SelectItem value="trusted_marker">Trusted Marker</SelectItem>
                    </SelectContent>
                  </Select>
                  <textarea
                    value={teachAiInput}
                    onChange={(e) => setTeachAiInput(e.target.value)}
                    placeholder={`E.g., "Flag documents where producer is '${selectedLog.metadata?.producer || 'unknown'}' as ${selectedLog.result}"`}
                    className="w-full h-20 p-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder-slate-500 resize-none"
                  />
                  <Button 
                    onClick={teachAi} 
                    disabled={!teachAiInput || teachingAi}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    <Brain className="w-4 h-4 mr-2" />
                    {teachingAi ? 'Teaching...' : 'Teach AI This Pattern'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Detail Modal for Log */}
      <Sheet open={selectedLog !== null && !aiPanelOpen} onOpenChange={(open) => { if (!open) { setSelectedLog(null); setFeedbackReasoning(''); } }}>
        <SheetContent className="w-full sm:max-w-lg bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-gray-900 dark:text-white">Verification Details</SheetTitle>
            <SheetDescription className="text-gray-500 dark:text-slate-400">
              {selectedLog?.filename}
            </SheetDescription>
          </SheetHeader>
          
          {selectedLog && (
            <div className="mt-6 space-y-6">
              <div className="flex flex-wrap justify-between items-center gap-2">
                {getStatusBadge(selectedLog.result, selectedLog.confidence)}
                <div className="flex gap-2">
                  {selectedLog.metadata?.producer && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { 
                        trustProducer(selectedLog.metadata.producer, selectedLog.id);
                        setSelectedLog(null);
                      }}
                      className="border-green-600 text-green-400 hover:bg-green-500/10"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Trust Producer
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => runAiAnalysis(selectedLog)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Sparkles className="w-4 h-4 mr-1" />
                    AI Analysis
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Verified At</p>
                  <p className="text-gray-700 dark:text-slate-200">{new Date(selectedLog.verifiedAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">IP Address</p>
                  <p className="text-gray-700 dark:text-slate-200 font-mono text-sm">{selectedLog.ipAddress || 'N/A'}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-2">Analysis Details</h4>
                <div className="space-y-2">
                  {selectedLog.analysisDetails?.checks?.map((check: any, idx: number) => (
                    <div 
                      key={idx} 
                      className={`p-2 rounded text-sm ${
                        check.passed 
                          ? 'bg-green-500/10 border border-green-500/30' 
                          : check.severity === 'critical' 
                            ? 'bg-red-500/10 border border-red-500/30'
                            : 'bg-yellow-500/10 border border-yellow-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {check.passed ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : check.severity === 'critical' ? (
                          <XCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        )}
                        <span className="text-gray-700 dark:text-slate-200 font-medium">{check.name}</span>
                      </div>
                      <p className="text-gray-500 dark:text-slate-400 mt-1 ml-6">{check.message}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Admin Verdict ─────────────────────────────────────── */}
              <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 bg-gray-50 dark:bg-slate-900/50">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  Admin Verdict
                </h4>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                  Override the AI result with your human review. This is stored permanently and fed back to the AI.
                </p>

                {/* Current status */}
                {selectedLog.adminStatus && selectedLog.adminStatus !== 'pending' && (
                  <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-sm font-medium ${
                    selectedLog.adminStatus === 'approved'
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
                  }`}>
                    {selectedLog.adminStatus === 'approved'
                      ? <CheckCircle className="w-4 h-4" />
                      : <XCircle className="w-4 h-4" />}
                    {selectedLog.adminStatus === 'approved'
                      ? 'You marked this as Genuine'
                      : `You marked this as Fake/Edited${selectedLog.adminFeedback ? ': ' + selectedLog.adminFeedback : ''}`}
                  </div>
                )}

                {/* Note textarea */}
                <textarea
                  value={feedbackReasoning}
                  onChange={(e) => setFeedbackReasoning(e.target.value)}
                  placeholder="Add a review note (required when marking as Fake/Edited)…"
                  rows={3}
                  className="w-full p-3 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 resize-none mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />

                {/* Verdict buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { handleApproveLog(selectedLog); setSelectedLog(null); }}
                    disabled={feedbackLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    ✓ Genuine
                  </button>
                  <button
                    onClick={() => {
                      if (!feedbackReasoning.trim()) {
                        toast({ title: 'Note required', description: 'Please add a review note before marking as fake.', variant: 'destructive' });
                        return;
                      }
                      setFeedbackLog(selectedLog);
                      handleSubmitFakeFeedback();
                      setSelectedLog(null);
                    }}
                    disabled={feedbackLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    ✗ Fake / Edited
                  </button>
                </div>
              </div>

              {/* ── Metadata panel ────────────────────────────────────── */}
              <div>
                <MetadataGroupsPanel
                  metadata={selectedLog.metadata || {}}
                  aiAnnotations={deriveAiAnnotations(selectedLog.analysisDetails?.checks)}
                />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmLog} onOpenChange={() => setDeleteConfirmLog(null)}>
        <DialogContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Delete verification log
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-slate-400">
              This will permanently remove the log for{' '}
              <strong className="text-gray-900 dark:text-white">{deleteConfirmLog?.filename}</strong>.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmLog(null)}
              className="border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmLog && handleDeleteLog(deleteConfirmLog)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog — Recent Activity widget */}
      <Dialog open={!!deleteConfirmActivity} onOpenChange={() => setDeleteConfirmActivity(null)}>
        <DialogContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Delete verification log
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-slate-400">
              This will permanently remove the log for{' '}
              <strong className="text-gray-900 dark:text-white">{deleteConfirmActivity?.filename}</strong>.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmActivity(null)}
              className="border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmActivity && handleDeleteLog(deleteConfirmActivity)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HITL Feedback Modal */}
      <Dialog open={feedbackModalOpen} onOpenChange={setFeedbackModalOpen}>
        <DialogContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <XCircle className="w-5 h-5" />
              Mark as Fake
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-slate-400">
              You're overriding the AI's assessment. Please provide detailed reasoning so the AI can learn from this correction.
            </DialogDescription>
          </DialogHeader>
          
          {feedbackLog && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-100 dark:bg-slate-700/50 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-slate-400">Document</p>
                <p className="text-gray-900 dark:text-white font-medium">{feedbackLog.filename}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-gray-500 dark:text-slate-400">AI said:</span>
                  {getStatusBadge(feedbackLog.result, feedbackLog.confidence)}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reasoning" className="text-gray-700 dark:text-slate-200">
                  Reasoning Points <span className="text-red-400">*</span>
                </Label>
                <Textarea
                  id="reasoning"
                  placeholder="e.g., The font style on the header doesn't match official CoS templates. The producer field shows evidence of PDF editing software..."
                  value={feedbackReasoning}
                  onChange={(e) => setFeedbackReasoning(e.target.value)}
                  className="min-h-[120px] bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white placeholder:text-slate-500"
                />
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  Your feedback will be used to train the AI and prevent future false positives.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setFeedbackModalOpen(false)}
              className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitFakeFeedback}
              disabled={feedbackLoading || !feedbackReasoning.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {feedbackLoading ? 'Submitting...' : 'Confirm as Fake'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sponsor Monitor Run Confirmation */}
      <Dialog open={runConfirmOpen} onOpenChange={setRunConfirmOpen}>
        <DialogContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-400">
              <Radio className="w-5 h-5" />
              Run Sponsor Monitor
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-slate-400">
              This will download the latest Home Office register, compare it against the previous snapshot, and send real notifications to all users watching affected companies. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRunConfirmOpen(false)}
              className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRunSponsorJob}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Play className="w-4 h-4 mr-1" />
              Confirm & Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Initialize Confirmation */}
      <Dialog open={initConfirmOpen} onOpenChange={setInitConfirmOpen}>
        <DialogContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <Database className="w-5 h-5" />
              Initialize Sponsor Register
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-slate-400">
              This will download the complete UK Home Office Register of Licensed Sponsors and store it as the baseline snapshot. This is a one-time operation and may take several minutes depending on the file size.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setInitConfirmOpen(false)}
              className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleInitialize}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Download className="w-4 h-4 mr-1" />
              Confirm & Initialize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleanup Confirmation */}
      <Dialog open={cleanupConfirmOpen} onOpenChange={setCleanupConfirmOpen}>
        <DialogContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Trash2 className="w-5 h-5" />
              Clean Up Old Snapshots
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-slate-400">
              This will delete all old sponsor register snapshots, keeping only the latest one. This frees up database storage but removes historical snapshot data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCleanupConfirmOpen(false)}
              className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCleanup}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Confirm Cleanup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
