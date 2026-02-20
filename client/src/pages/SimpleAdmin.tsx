import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Shield, Upload, FileText, CheckCircle, AlertTriangle, XCircle, LogOut, Trash2, Eye, 
  RefreshCw, Search, Filter, ChevronLeft, ChevronRight, Activity, Database, Clock,
  Sparkles, X, Download, ChevronDown, Users, TrendingUp, Cpu, HardDrive, Brain, Plus, Power, Radio, Play, Bell, BarChart3
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

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
  filename: string;
  result: 'genuine' | 'suspicious' | 'fake';
  confidence: number;
  metadata: any;
  analysisDetails: any;
  ipAddress?: string;
  verifiedAt: string;
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
  createdAt: string;
  updatedAt: string;
}

interface UploadPreview {
  file: File;
  metadata: any;
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
  const [logsStartDate, setLogsStartDate] = useState('');
  const [logsEndDate, setLogsEndDate] = useState('');
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
  
  // Tab state for triggering data loads
  const [activeTab, setActiveTab] = useState('logs');
  
  // Global AI rules state
  const [globalRules, setGlobalRules] = useState<GlobalAiRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [newRuleCategory, setNewRuleCategory] = useState('');
  const [newRuleText, setNewRuleText] = useState('');
  const [newRulePriority, setNewRulePriority] = useState(0);
  
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
  const [initConfirmOpen, setInitConfirmOpen] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

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
        setStats(await statsRes.json());
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
      
      if (logsStartDate) params.set('startDate', logsStartDate);
      if (logsEndDate) params.set('endDate', logsEndDate);
      
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
  }, [logsPage, logsFilter, logsSearch, logsStartDate, logsEndDate]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'logs') {
      loadLogs();
    }
  }, [isAuthenticated, loadLogs, activeTab]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        page: usersPage.toString(),
        limit: '25',
        search: usersSearch,
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
  }, [usersPage, usersSearch]);

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

  const handleRunSponsorJob = async () => {
    setRunConfirmOpen(false);
    setRunningJob(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/admin/sponsor-monitor/run', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setRunResult(data.message);
        toast({ title: "Job Started", description: data.message });
        setTimeout(() => loadSponsorMonitorData(), 30000);
      } else {
        setRunResult(data.message || 'Failed to start job');
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      setRunResult('Network error');
      toast({ title: "Error", description: "Failed to trigger job", variant: "destructive" });
    } finally {
      setRunningJob(false);
    }
  };

  const handleInitialize = async () => {
    setInitConfirmOpen(false);
    setInitializing(true);
    try {
      const res = await fetch('/api/admin/sponsor-monitor/initialize', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Initialized", description: `Loaded ${data.recordCount?.toLocaleString()} records for ${data.snapshotDate}` });
        loadSponsorMonitorData();
        loadStorageStats();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to initialize", variant: "destructive" });
    } finally {
      setInitializing(false);
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
    }
  }, [isAuthenticated, activeTab, loadGlobalRules, loadSponsorMonitorData, loadStorageStats]);

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
      toast({ title: 'Failed to create rule', variant: 'destructive' });
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
      toast({ title: 'Failed to toggle rule', variant: 'destructive' });
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
      toast({ title: 'Failed to delete rule', variant: 'destructive' });
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
      toast({ title: 'Failed to teach AI', variant: 'destructive' });
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
      toast({ title: 'Failed to approve', variant: 'destructive' });
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
        const data = await res.json();
        if (data.isConflict) {
          toast({ 
            title: 'Conflict recorded', 
            description: 'AI said Genuine, but you marked as Fake. This will train the AI.', 
          });
        } else {
          toast({ title: 'Marked as fake', description: 'Your feedback has been recorded' });
        }
        setFeedbackModalOpen(false);
        loadLogs(); // Refresh logs
      } else {
        const error = await res.json();
        toast({ title: 'Failed to submit feedback', description: error.message, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Failed to submit feedback', variant: 'destructive' });
    } finally {
      setFeedbackLoading(false);
    }
  };

  // Get admin status badge with conflict detection
  const getAdminStatusBadge = (log: VerificationLog) => {
    const adminStatus = (log as any).adminStatus || 'pending';
    const aiResult = log.result;
    const isConflict = adminStatus === 'fake' && aiResult === 'genuine';

    if (adminStatus === 'pending') {
      return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">Pending Review</Badge>;
    }
    if (isConflict) {
      return (
        <Badge className="bg-red-500/20 text-red-400 border-2 border-red-500 animate-pulse">
          Admin Overridden
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
        throw new Error('Upload failed');
      }

      toast({ title: 'Upload successful', description: 'Document added to trusted patterns with AI instructions' });
      setUploadPreview(null);
      setAiInstructions('');
      loadData();
    } catch (error) {
      toast({ title: 'Upload failed', description: 'Could not upload document', variant: 'destructive' });
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
        throw new Error('Delete failed');
      }

      toast({ title: 'Deleted', description: 'Pattern removed successfully' });
      loadData();
    } catch (error) {
      toast({ title: 'Delete failed', description: 'Could not delete pattern', variant: 'destructive' });
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
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm px-6 py-3">
        <div className="flex justify-between items-center max-w-[1800px] mx-auto">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-red-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Forensic Command Center</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400">COS Verification Management</p>
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

          <div className="flex items-center gap-4">
            <span className="text-gray-600 dark:text-slate-300 hidden sm:inline">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout} className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700" data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <FileText className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Trusted Patterns</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.trustedPatterns || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Genuine Today</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.genuineVerified || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-yellow-500/10 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Suspicious</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.suspiciousDetected || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Total Today</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.verificationsToday || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm p-1">
            <TabsTrigger value="logs" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-400">
              <Eye className="w-4 h-4 mr-2" />
              Verification Logs
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 dark:data-[state=active]:bg-purple-900/30 dark:data-[state=active]:text-purple-400">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="patterns" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-900/30 dark:data-[state=active]:text-emerald-400">
              <FileText className="w-4 h-4 mr-2" />
              Trusted Patterns
            </TabsTrigger>
            <TabsTrigger value="upload" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 dark:data-[state=active]:bg-orange-900/30 dark:data-[state=active]:text-orange-400">
              <Upload className="w-4 h-4 mr-2" />
              Upload Pattern
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="data-[state=active]:bg-pink-50 data-[state=active]:text-pink-700 dark:data-[state=active]:bg-pink-900/30 dark:data-[state=active]:text-pink-400">
              <Brain className="w-4 h-4 mr-2" />
              AI Knowledge
            </TabsTrigger>
            <TabsTrigger value="sponsor" className="data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-700 dark:data-[state=active]:bg-cyan-900/30 dark:data-[state=active]:text-cyan-400">
              <Radio className="w-4 h-4 mr-2" />
              Sponsor Monitor
            </TabsTrigger>
          </TabsList>

          {/* Verification Logs Tab */}
          <TabsContent value="logs">
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
                          value={logsSearch}
                          onChange={(e) => { setLogsSearch(e.target.value); setLogsPage(1); }}
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
                        className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                      >
                        <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  {/* Date Range Filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-gray-500 dark:text-slate-400 text-sm">From:</Label>
                    <Input
                      type="date"
                      value={logsStartDate}
                      onChange={(e) => { setLogsStartDate(e.target.value); setLogsPage(1); }}
                      className="w-40 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                    />
                    <Label className="text-gray-500 dark:text-slate-400 text-sm">To:</Label>
                    <Input
                      type="date"
                      value={logsEndDate}
                      onChange={(e) => { setLogsEndDate(e.target.value); setLogsPage(1); }}
                      className="w-40 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                    />
                    {(logsStartDate || logsEndDate) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setLogsStartDate(''); setLogsEndDate(''); setLogsPage(1); }}
                        className="text-gray-500 dark:text-slate-400 hover:text-white"
                      >
                        Clear Dates
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {logsLoading && !logs ? (
                  <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  </div>
                ) : logs?.data.length === 0 ? (
                  <div className="text-center py-12">
                    <Eye className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-slate-400">No verification logs found</p>
                    <p className="text-sm text-gray-400 dark:text-slate-500">Adjust your filters or wait for verifications</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-slate-700">
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Time</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Filename</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">AI Status</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Admin Review</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Producer</th>
                            <th className="text-right py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs?.data.map((log) => (
                            <tr 
                              key={log.id} 
                              className={`border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer ${
                                (log as any).adminStatus === 'fake' && log.result === 'genuine' 
                                  ? 'ring-2 ring-red-500/50 bg-red-900/10' 
                                  : ''
                              }`}
                              onClick={() => setSelectedLog(log)}
                            >
                              <td className="py-3 px-4 text-gray-600 dark:text-slate-300 text-sm">
                                {new Date(log.verifiedAt).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-gray-900 dark:text-white font-medium max-w-[200px] truncate">
                                {log.filename}
                              </td>
                              <td className="py-3 px-4">
                                {getStatusBadge(log.result, log.confidence)}
                              </td>
                              <td className="py-3 px-4">
                                {getAdminStatusBadge(log)}
                              </td>
                              <td className="py-3 px-4 text-gray-600 dark:text-slate-300 text-sm max-w-[150px] truncate">
                                {log.metadata?.producer || 'Unknown'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {(log as any).adminStatus === 'pending' && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => { e.stopPropagation(); handleApproveLog(log); }}
                                        disabled={feedbackLoading}
                                        className="text-green-400 hover:bg-green-500/20 hover:text-green-300"
                                        title="Approve AI result"
                                      >
                                        <CheckCircle className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => { e.stopPropagation(); handleOpenFeedbackModal(log); }}
                                        disabled={feedbackLoading}
                                        className="text-red-400 hover:bg-red-500/20 hover:text-red-300"
                                        title="Mark as fake"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => { e.stopPropagation(); runAiAnalysis(log); }}
                                    className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                                  >
                                    <Sparkles className="w-4 h-4 mr-1" />
                                    Analyze
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
                          Page {logs.page} of {logs.totalPages}
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
                      {users?.total || 0} registered users
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                      <Input
                        placeholder="Search users..."
                        value={usersSearch}
                        onChange={(e) => { setUsersSearch(e.target.value); setUsersPage(1); }}
                        className="pl-9 w-48 bg-gray-50 dark:bg-slate-700/50 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={loadUsers}
                      disabled={usersLoading}
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
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-slate-400">No users found</p>
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
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Limit</th>
                            <th className="text-left py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Joined</th>
                            <th className="text-right py-3 px-4 text-gray-500 dark:text-slate-400 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users?.data.map((u) => (
                            <tr key={u.id} className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                              <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">
                                {u.email || 'N/A'}
                              </td>
                              <td className="py-3 px-4">
                                <Badge className={u.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-gray-500 dark:text-slate-400'}>
                                  {u.role}
                                </Badge>
                              </td>
                              <td className="py-3 px-4">
                                {u.isRestricted ? (
                                  <Badge className="bg-red-500/20 text-red-400">Restricted</Badge>
                                ) : u.subscriptionStatus === 'unlimited' || u.subscriptionStatus === 'enterprise' ? (
                                  <Badge className="bg-purple-500/20 text-purple-400">Unlimited</Badge>
                                ) : u.subscriptionStatus === 'pro' ? (
                                  <Badge className="bg-green-500/20 text-green-400">Pro</Badge>
                                ) : u.subscriptionStatus === 'starter' ? (
                                  <Badge className="bg-blue-500/20 text-blue-400">Starter</Badge>
                                ) : (
                                  <Badge className="bg-slate-500/20 text-gray-500 dark:text-slate-400">Free</Badge>
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
                                  <Button
                                    size="sm"
                                    variant={u.isRestricted ? 'outline' : 'destructive'}
                                    onClick={() => toggleUserRestriction(u.id, !u.isRestricted, 'Admin restriction')}
                                    className={u.isRestricted ? 'border-green-600 text-green-400 hover:bg-green-500/10' : ''}
                                  >
                                    {u.isRestricted ? 'Unrestrict' : 'Restrict'}
                                  </Button>
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
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-slate-400">No trusted patterns uploaded yet</p>
                    <p className="text-sm text-gray-400 dark:text-slate-500">Upload genuine COS documents to establish patterns</p>
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

          {/* AI Knowledge Tab */}
          <TabsContent value="knowledge">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                    <Plus className="w-5 h-5 text-green-400" />
                    Add Global AI Rule
                  </CardTitle>
                  <CardDescription className="text-gray-500 dark:text-slate-400">
                    Create rules that apply to ALL document verifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-gray-900 dark:text-white">Category</Label>
                    <Select value={newRuleCategory} onValueChange={setNewRuleCategory}>
                      <SelectTrigger className="bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                        <SelectItem value="date_check">Date Check</SelectItem>
                        <SelectItem value="producer_check">Producer Check</SelectItem>
                        <SelectItem value="metadata_check">Metadata Check</SelectItem>
                        <SelectItem value="pattern_check">Pattern Check</SelectItem>
                        <SelectItem value="red_flag">Red Flag</SelectItem>
                        <SelectItem value="trusted_marker">Trusted Marker</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-gray-900 dark:text-white">Rule Text</Label>
                    <textarea
                      value={newRuleText}
                      onChange={(e) => setNewRuleText(e.target.value)}
                      placeholder="E.g., 'Always flag any document where the ModDate is on a Sunday as suspicious' or 'Trust documents with producer containing gov.uk'"
                      className="w-full h-24 p-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-slate-500 resize-none"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-900 dark:text-white">Priority (higher = more important)</Label>
                    <Input
                      type="number"
                      value={newRulePriority}
                      onChange={(e) => setNewRulePriority(parseInt(e.target.value) || 0)}
                      className="bg-gray-50 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white"
                    />
                  </div>

                  <Button onClick={createGlobalRule} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Rule
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                        <Brain className="w-5 h-5 text-purple-400" />
                        Active Rules
                      </CardTitle>
                      <CardDescription className="text-gray-500 dark:text-slate-400">
                        {globalRules.length} rules configured
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="icon" onClick={loadGlobalRules} disabled={rulesLoading} className="border-gray-300 dark:border-slate-600">
                      <RefreshCw className={`w-4 h-4 ${rulesLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    {globalRules.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                        <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No global rules configured yet</p>
                        <p className="text-sm">Add rules to train the AI</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {globalRules.map((rule) => (
                          <div key={rule.id} className={`p-3 rounded-lg border ${rule.isActive ? 'bg-gray-50 dark:bg-slate-700/50 border-gray-200 dark:border-slate-600' : 'bg-gray-100 dark:bg-slate-900/50 border-gray-300 dark:border-slate-700 opacity-60'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">{rule.category}</Badge>
                                  <span className="text-xs text-gray-400 dark:text-slate-500">Priority: {rule.priority}</span>
                                </div>
                                <p className="text-sm text-gray-900 dark:text-white">{rule.ruleText}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => toggleRule(rule.id, !rule.isActive)}
                                  className={rule.isActive ? 'text-green-400' : 'text-slate-500'}
                                >
                                  <Power className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)} className="text-red-400 hover:text-red-300">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Sponsor Monitor Tab */}
          <TabsContent value="sponsor">
            <div className="space-y-6">
              {/* Status Card */}
              <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                        <Radio className="w-5 h-5 text-blue-400" />
                        Sponsor Monitor Status
                      </CardTitle>
                      <CardDescription className="text-gray-500 dark:text-slate-400">
                        UK Home Office Register monitoring dashboard
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={loadSponsorMonitorData}
                        disabled={sponsorStatusLoading}
                        className="border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                      >
                        <RefreshCw className={`w-4 h-4 mr-1 ${sponsorStatusLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setRunConfirmOpen(true)}
                        disabled={runningJob || sponsorStatus?.jobRunning}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {runningJob || sponsorStatus?.jobRunning ? (
                          <>
                            <div className="w-4 h-4 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-1" />
                            Run Now
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
                  {runResult && (
                    <Alert className="mt-4 bg-blue-500/10 border-blue-500/30">
                      <AlertDescription className="text-blue-300">{runResult}</AlertDescription>
                    </Alert>
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
                    {sponsorStatus?.latestSnapshot ? (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-green-400">Initialized on {sponsorStatus.latestSnapshot}</span>
                      </div>
                    ) : (
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
                          {initializing ? (
                            <>
                              <div className="w-4 h-4 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Initializing...
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4 mr-1" />
                              Initialize Baseline
                            </>
                          )}
                        </Button>
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
                  <CardDescription className="text-gray-500 dark:text-slate-400">Last 50 detected changes across all companies</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentChangesLoading ? (
                    <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 py-4">
                      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Loading changes...
                    </div>
                  ) : recentChanges.length === 0 ? (
                    <p className="text-gray-400 dark:text-slate-500 text-sm py-4">No changes detected yet.</p>
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
                      <p className="text-gray-400 dark:text-slate-500 text-sm py-4">No companies being watched yet.</p>
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
                      <p className="text-gray-400 dark:text-slate-500 text-sm py-4">No notifications sent in the last 7 days.</p>
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
                <h4 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Raw Metadata
                </h4>
                <ScrollArea className="h-48 rounded bg-slate-900 p-3">
                  <pre className="text-xs text-gray-500 dark:text-slate-400 whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </ScrollArea>
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
      <Sheet open={selectedLog !== null && !aiPanelOpen} onOpenChange={(open) => !open && setSelectedLog(null)}>
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

              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Raw Metadata
                </h4>
                <ScrollArea className="h-48 rounded bg-slate-900 p-3">
                  <pre className="text-xs text-gray-500 dark:text-slate-400 whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

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
