import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Shield, Upload, FileText, CheckCircle, AlertTriangle, XCircle, LogOut, Trash2, Eye, 
  RefreshCw, Search, Filter, ChevronLeft, ChevronRight, Activity, Database, Clock,
  Sparkles, X, Download, ChevronDown, Users, TrendingUp, Cpu, HardDrive
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
}

interface PaginatedUsers {
  data: UserRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function SimpleAdmin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const response = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginEmail, password: loginPassword }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Login failed');
      }

      setUser(data.user);
      setIsAuthenticated(true);
      loadData();
      loadSystemHealth();
      toast({ title: 'Login successful', description: 'Welcome to the admin portal' });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
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
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/admin/trusted-patterns', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      toast({ title: 'Upload successful', description: 'Document added to trusted patterns' });
      loadData();
    } catch (error) {
      toast({ title: 'Upload failed', description: 'Could not upload document', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="bg-red-500/10 p-4 rounded-full">
                <Shield className="w-12 h-12 text-red-500" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Forensic Command Center</h1>
            <p className="text-slate-400">Enter your administrator credentials</p>
          </div>

          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="text-white">Admin Sign In</CardTitle>
              <CardDescription className="text-slate-400">
                Protected access for COS verification admins
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                {loginError && (
                  <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-200">Email</Label>
                  <Input
                    id="email"
                    type="text"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@example.com"
                    required
                    className="bg-slate-700/50 border-slate-600 text-white"
                    data-testid="input-admin-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-200">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className="bg-slate-700/50 border-slate-600 text-white"
                    data-testid="input-admin-password"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
                  data-testid="button-admin-login"
                >
                  {loginLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* System Health Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3">
        <div className="flex justify-between items-center max-w-[1800px] mx-auto">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-red-500" />
            <div>
              <h1 className="text-xl font-bold text-white">Forensic Command Center</h1>
              <p className="text-sm text-slate-400">COS Verification Management</p>
            </div>
          </div>
          
          {/* System Health Stats */}
          {systemHealth && (
            <div className="hidden lg:flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${systemHealth.database.status === 'healthy' ? 'text-green-400' : 'text-red-400'}`} />
                <span className="text-slate-400">DB:</span>
                <span className="text-slate-200">{systemHealth.database.connections} conn</span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span className="text-slate-400">Memory:</span>
                <span className="text-slate-200">{systemHealth.memory.heapUsed}MB / {systemHealth.memory.heapTotal}MB</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <span className="text-slate-400">Uptime:</span>
                <span className="text-slate-200">{formatUptime(systemHealth.uptime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-400">Users:</span>
                <span className="text-slate-200">{systemHealth.stats.totalUsers} ({systemHealth.stats.proUsers} pro)</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <span className="text-slate-300 hidden sm:inline">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout} className="border-slate-600 text-slate-300 hover:bg-slate-700" data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <FileText className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Trusted Patterns</p>
                  <p className="text-2xl font-bold text-white">{stats?.trustedPatterns || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Genuine Today</p>
                  <p className="text-2xl font-bold text-white">{stats?.genuineVerified || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-yellow-500/10 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Suspicious</p>
                  <p className="text-2xl font-bold text-white">{stats?.suspiciousDetected || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Today</p>
                  <p className="text-2xl font-bold text-white">{stats?.verificationsToday || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="logs" className="data-[state=active]:bg-slate-700">
              <Eye className="w-4 h-4 mr-2" />
              Verification Logs
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-slate-700">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="patterns" className="data-[state=active]:bg-slate-700">
              <FileText className="w-4 h-4 mr-2" />
              Trusted Patterns
            </TabsTrigger>
            <TabsTrigger value="upload" className="data-[state=active]:bg-slate-700">
              <Upload className="w-4 h-4 mr-2" />
              Upload Pattern
            </TabsTrigger>
          </TabsList>

          {/* Verification Logs Tab */}
          <TabsContent value="logs">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                      <CardTitle className="text-white">Verification Logs</CardTitle>
                      <CardDescription className="text-slate-400">
                        {logs?.total || 0} total verifications
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Search filename..."
                          value={logsSearch}
                          onChange={(e) => { setLogsSearch(e.target.value); setLogsPage(1); }}
                          className="pl-9 w-48 bg-slate-700/50 border-slate-600 text-white"
                        />
                      </div>
                      <Select value={logsFilter} onValueChange={(v) => { setLogsFilter(v as any); setLogsPage(1); }}>
                        <SelectTrigger className="w-32 bg-slate-700/50 border-slate-600 text-white">
                          <Filter className="w-4 h-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
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
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  {/* Date Range Filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-slate-400 text-sm">From:</Label>
                    <Input
                      type="date"
                      value={logsStartDate}
                      onChange={(e) => { setLogsStartDate(e.target.value); setLogsPage(1); }}
                      className="w-40 bg-slate-700/50 border-slate-600 text-white"
                    />
                    <Label className="text-slate-400 text-sm">To:</Label>
                    <Input
                      type="date"
                      value={logsEndDate}
                      onChange={(e) => { setLogsEndDate(e.target.value); setLogsPage(1); }}
                      className="w-40 bg-slate-700/50 border-slate-600 text-white"
                    />
                    {(logsStartDate || logsEndDate) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setLogsStartDate(''); setLogsEndDate(''); setLogsPage(1); }}
                        className="text-slate-400 hover:text-white"
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
                    <p className="text-slate-400">No verification logs found</p>
                    <p className="text-sm text-slate-500">Adjust your filters or wait for verifications</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Time</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Filename</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Status</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Producer</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">IP</th>
                            <th className="text-right py-3 px-4 text-slate-400 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs?.data.map((log) => (
                            <tr 
                              key={log.id} 
                              className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                              onClick={() => setSelectedLog(log)}
                            >
                              <td className="py-3 px-4 text-slate-300 text-sm">
                                {new Date(log.verifiedAt).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-white font-medium max-w-[200px] truncate">
                                {log.filename}
                              </td>
                              <td className="py-3 px-4">
                                {getStatusBadge(log.result, log.confidence)}
                              </td>
                              <td className="py-3 px-4 text-slate-300 text-sm max-w-[150px] truncate">
                                {log.metadata?.producer || 'Unknown'}
                              </td>
                              <td className="py-3 px-4 text-slate-400 text-sm font-mono">
                                {log.ipAddress?.substring(0, 12) || 'N/A'}...
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => { e.stopPropagation(); runAiAnalysis(log); }}
                                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                                >
                                  <Sparkles className="w-4 h-4 mr-1" />
                                  Analyze
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Pagination */}
                    {logs && logs.totalPages > 1 && (
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-700">
                        <p className="text-sm text-slate-400">
                          Page {logs.page} of {logs.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLogsPage(p => Math.max(1, p - 1))}
                            disabled={logs.page === 1}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLogsPage(p => Math.min(logs.totalPages, p + 1))}
                            disabled={logs.page === logs.totalPages}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700"
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
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                  <div>
                    <CardTitle className="text-white">User Management</CardTitle>
                    <CardDescription className="text-slate-400">
                      {users?.total || 0} registered users
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="Search users..."
                        value={usersSearch}
                        onChange={(e) => { setUsersSearch(e.target.value); setUsersPage(1); }}
                        className="pl-9 w-48 bg-slate-700/50 border-slate-600 text-white"
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={loadUsers}
                      disabled={usersLoading}
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
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
                    <p className="text-slate-400">No users found</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Email</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Role</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Status</th>
                            <th className="text-left py-3 px-4 text-slate-400 font-medium">Joined</th>
                            <th className="text-right py-3 px-4 text-slate-400 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users?.data.map((u) => (
                            <tr key={u.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                              <td className="py-3 px-4 text-white font-medium">
                                {u.email || 'N/A'}
                              </td>
                              <td className="py-3 px-4">
                                <Badge className={u.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-slate-400'}>
                                  {u.role}
                                </Badge>
                              </td>
                              <td className="py-3 px-4">
                                {u.isRestricted ? (
                                  <Badge className="bg-red-500/20 text-red-400">Restricted</Badge>
                                ) : u.subscriptionStatus === 'pro' ? (
                                  <Badge className="bg-green-500/20 text-green-400">Pro</Badge>
                                ) : (
                                  <Badge className="bg-blue-500/20 text-blue-400">Free</Badge>
                                )}
                              </td>
                              <td className="py-3 px-4 text-slate-400 text-sm">
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
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-700">
                        <p className="text-sm text-slate-400">
                          Page {users.page} of {users.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                            disabled={users.page === 1}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUsersPage(p => Math.min(users.totalPages, p + 1))}
                            disabled={users.page === users.totalPages}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700"
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
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Trusted COS Patterns</CardTitle>
                <CardDescription className="text-slate-400">
                  These documents are used as reference for verification
                </CardDescription>
              </CardHeader>
              <CardContent>
                {patterns.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No trusted patterns uploaded yet</p>
                    <p className="text-sm text-slate-500">Upload genuine COS documents to establish patterns</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {patterns.map((pattern) => (
                      <div
                        key={pattern.id}
                        className="p-4 bg-slate-700/50 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-blue-400" />
                            <div>
                              <p className="text-white font-medium">{pattern.filename}</p>
                              <p className="text-sm text-slate-400">
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
                          <div className="mt-3 pt-3 border-t border-slate-600">
                            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Forensic Metadata</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                              <div>
                                <p className="text-slate-400">Producer</p>
                                <p className="text-slate-200 truncate">{pattern.metadata.forensic?.producer || pattern.metadata.producer || 'Unknown'}</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Creator</p>
                                <p className="text-slate-200 truncate">{pattern.metadata.forensic?.creator || pattern.metadata.creator || 'Unknown'}</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Created</p>
                                <p className="text-slate-200 truncate">{pattern.metadata.forensic?.created || pattern.metadata.creationDate || 'Unknown'}</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Fonts</p>
                                <p className="text-slate-200">{pattern.metadata.forensic?.fontCount || pattern.metadata.fontCount || 0} fonts</p>
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
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Upload Genuine COS Document</CardTitle>
                <CardDescription className="text-slate-400">
                  Upload a genuine Certificate of Sponsorship to use as reference pattern
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-white mb-2">Drop a PDF file here or click to browse</p>
                  <p className="text-sm text-slate-400 mb-4">Only PDF files are accepted</p>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleUpload}
                    disabled={uploading}
                    className="hidden"
                    id="file-upload"
                    data-testid="input-file-upload"
                  />
                  <Button asChild disabled={uploading}>
                    <label htmlFor="file-upload" className="cursor-pointer">
                      {uploading ? 'Uploading...' : 'Select File'}
                    </label>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* AI Analysis Side Panel */}
      <Sheet open={aiPanelOpen} onOpenChange={setAiPanelOpen}>
        <SheetContent className="w-full sm:max-w-xl bg-slate-800 border-slate-700 text-white overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI Forensic Analysis
            </SheetTitle>
            <SheetDescription className="text-slate-400">
              {selectedLog?.filename} - {selectedLog?.result} ({selectedLog?.confidence}%)
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6">
            {aiLoading && !aiAnalysis && (
              <div className="flex items-center gap-3 text-slate-400">
                <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Analyzing document...</span>
              </div>
            )}
            
            {aiAnalysis && (
              <div className="prose prose-invert prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-slate-300 leading-relaxed">
                  {aiAnalysis}
                  {aiLoading && <span className="animate-pulse">|</span>}
                </div>
              </div>
            )}
          </div>

          {selectedLog && (
            <div className="mt-8 pt-6 border-t border-slate-700">
              <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Raw Metadata
              </h4>
              <ScrollArea className="h-64 rounded bg-slate-900 p-3">
                <pre className="text-xs text-slate-400 whitespace-pre-wrap">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Detail Modal for Log */}
      <Sheet open={selectedLog !== null && !aiPanelOpen} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <SheetContent className="w-full sm:max-w-lg bg-slate-800 border-slate-700 text-white overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white">Verification Details</SheetTitle>
            <SheetDescription className="text-slate-400">
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
                  <p className="text-sm text-slate-400">Verified At</p>
                  <p className="text-slate-200">{new Date(selectedLog.verifiedAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">IP Address</p>
                  <p className="text-slate-200 font-mono text-sm">{selectedLog.ipAddress || 'N/A'}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2">Analysis Details</h4>
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
                        <span className="text-slate-200 font-medium">{check.name}</span>
                      </div>
                      <p className="text-slate-400 mt-1 ml-6">{check.message}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Raw Metadata
                </h4>
                <ScrollArea className="h-48 rounded bg-slate-900 p-3">
                  <pre className="text-xs text-slate-400 whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
