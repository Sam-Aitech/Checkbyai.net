import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import FileUpload from "./FileUpload";
import type { StatsResponse, TrustedPattern, VerificationResult, AnalysisDocument } from "@shared/api-types";

import { Database, CheckCircle, AlertTriangle, TrendingUp, Search, Trash2, Download, Plus, Lock, ShieldCheck, FileSearch, Code, Save, X, Eye, MessageSquare, Settings, Users, Bell, FileCheck, WifiOff, Wifi, ChevronDown, ChevronUp, Ban, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import FeedbackAnalytics from "./FeedbackAnalytics";

export default function AdminPortal() {
  const [searchTerm, setSearchTerm] = useState("");
  const [validateMetadata, setValidateMetadata] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [analysisDocument, setAnalysisDocument] = useState<AnalysisDocument | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [adminCommands, setAdminCommands] = useState("");

  // User Management state
  const [userSearch, setUserSearch] = useState("");
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [limitInputs, setLimitInputs] = useState<Record<string, string>>({});

  // System settings state
  const [globalLimitInput, setGlobalLimitInput] = useState("");

  // Delete user confirmation state
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isAdmin, isLoading, user } = useAuth();

  // All hooks must be called before any conditional logic
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['/api/stats'],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: trustedPatterns = [] } = useQuery<TrustedPattern[]>({
    queryKey: ['/api/trusted-patterns'],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: recentActivity = [] } = useQuery<VerificationResult[]>({
    queryKey: ['/api/admin/recent-activity'],
    enabled: isAuthenticated && isAdmin,
  });

  // Paid submissions query
  interface PaidSubmission {
    id: number;
    email: string;
    packageType: 'normal' | 'full';
    paymentStatus: string;
    reviewStatus: string;
    priority: boolean;
    employerName: string | null;
    jobTitle: string | null;
    cosReferenceNumber: string | null;
    howApplied: string | null;
    emailsReceived: string | null;
    confirmationDetails: string | null;
    additionalNotes: string | null;
    expertVerdict: string | null;
    expertConfidence: number | null;
    documentAnalysisReport: string | null;
    recommendations: string | null;
    reportDelivered: boolean | null;
    createdAt: string;
  }

  const { data: paidSubmissions = [] } = useQuery<PaidSubmission[]>({
    queryKey: ['/api/admin/paid-submissions'],
    enabled: isAuthenticated && isAdmin,
  });

  // System settings
  interface SystemSetting { key: string; value: string; }
  const { data: systemSettings = [] } = useQuery<SystemSetting[]>({
    queryKey: ['/api/admin/system-settings'],
    enabled: isAuthenticated && isAdmin,
  });
  const currentDailyLimit = systemSettings.find(s => s.key === 'defaultDailyLimit')?.value ?? '1';

  const updateSettingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiRequest('PATCH', `/api/admin/system-settings/${key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/system-settings'] });
      toast({ title: 'Setting saved', description: 'The change takes effect immediately for all users.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save setting.', variant: 'destructive' });
    },
  });

  // User Management
  interface AdminUser {
    id: string;
    email: string | null;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    role: string | null;
    subscriptionStatus: string | null;
    cosCheckApproved: boolean | null;
    cosCheckSubscription: boolean | null;
    ipExempt: boolean | null;
    verificationLimit: number | null;
    isRestricted: boolean | null;
    credits: number | null;
    createdAt: string | null;
  }

  interface PaginatedUsers {
    data: AdminUser[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery<PaginatedUsers>({
    queryKey: ['/api/admin/users', userPage, userSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(userPage), limit: '20' });
      if (userSearch) params.set('search', userSearch);
      return fetch(`/api/admin/users?${params}`, { credentials: 'include' }).then(r => r.json());
    },
    enabled: isAuthenticated && isAdmin && activeTab === 'users',
  });

  const cosApprovalMutation = useMutation({
    mutationFn: ({ userId, approved }: { userId: string; approved: boolean }) =>
      apiRequest('PATCH', `/api/admin/users/${userId}/cos-approval`, { approved }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'Updated', description: 'COS check access updated.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update COS access.', variant: 'destructive' }),
  });

  const ipExemptMutation = useMutation({
    mutationFn: ({ userId, exempt }: { userId: string; exempt: boolean }) =>
      apiRequest('PATCH', `/api/admin/users/${userId}/ip-exempt`, { exempt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'Updated', description: 'IP exemption updated.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update IP exemption.', variant: 'destructive' }),
  });

  // Sync globalLimitInput when settings load
  useEffect(() => {
    setGlobalLimitInput(currentDailyLimit);
  }, [currentDailyLimit]);

  const cosSubscriptionMutation = useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      apiRequest('PATCH', `/api/admin/users/${userId}/cos-subscription`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'Updated', description: 'COS check subscription updated.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update COS subscription.', variant: 'destructive' }),
  });

  const verificationLimitMutation = useMutation({
    mutationFn: ({ userId, limit }: { userId: string; limit: number | null }) =>
      apiRequest('PATCH', `/api/admin/users/${userId}/limit`, { limit }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'Updated', description: 'Verification limit updated.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update limit.', variant: 'destructive' }),
  });

  const restrictUserMutation = useMutation({
    mutationFn: ({ userId, restricted }: { userId: string; restricted: boolean }) =>
      apiRequest('POST', `/api/admin/users/${userId}/restrict`, { restricted }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'Updated', description: 'User restriction updated. Email sent to user.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update restriction.', variant: 'destructive' }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('DELETE', `/api/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setUserToDelete(null);
      toast({ title: 'User deleted', description: 'The user account has been permanently removed.' });
    },
    onError: () => {
      setUserToDelete(null);
      toast({ title: 'Error', description: 'Failed to delete user.', variant: 'destructive' });
    },
  });

  const [selectedSubmission, setSelectedSubmission] = useState<PaidSubmission | null>(null);
  const [reviewForm, setReviewForm] = useState({
    expertVerdict: '',
    expertConfidence: 0,
    documentAnalysisReport: '',
    recommendations: '',
  });

  const updateSubmissionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await fetch(`/api/admin/paid-submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update submission');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/paid-submissions'] });
      setSelectedSubmission(null);
      toast({
        title: "Review Saved",
        description: "The submission has been updated with your review",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendReportMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/paid-submissions/${id}/send-report`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send report');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/paid-submissions'] });
      toast({
        title: "Report Sent",
        description: "The verification report has been emailed to the user",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyEmployerMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/paid-submissions/${id}/verify-employer`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to verify employer');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/paid-submissions'] });
      toast({
        title: "Employer Verification",
        description: "Verification data recorded. Check recommended verification steps.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadPatternMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      // Use fetch directly for file uploads to avoid Content-Type override
      const response = await fetch('/api/admin/upload-pattern', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header, browser will set it automatically with boundary
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Upload failed: ${errorData.error || response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trusted-patterns'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Pattern Added",
        description: "Trusted pattern has been successfully added to the database",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/adminlogin";
        }, 500);
        return;
      }
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePatternMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/admin/trusted-patterns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trusted-patterns'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Pattern Deleted",
        description: "Trusted pattern has been removed from the database",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearDataMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', '/api/admin/clear-verification-data');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/recent-activity'] });
      toast({
        title: "Data Cleared",
        description: "All user verification data cleared. Trusted patterns preserved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Clear Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Authentication effect - must be after all hooks
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please log in to access the admin portal",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/adminlogin";
      }, 1000);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const filteredPatterns = trustedPatterns.filter((pattern: any) =>
    pattern.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Show access denied if not admin
  if (!isLoading && isAuthenticated && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <Lock className="w-12 h-12 text-red-600 dark:text-red-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Access Denied</h2>
          <p className="text-gray-600 dark:text-gray-300 max-w-md">
            You don't have permission to access the admin portal. Administrator privileges are required.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Current Role: {user?.role || 'User'}</span>
        </div>
        <Button 
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            window.location.href = '/';
          }}
          variant="outline"
        >
          Logout
        </Button>
      </div>
    );
  }

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-300">Checking permissions...</p>
      </div>
    );
  }

  // Show redirecting message when not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-300">Redirecting to login...</p>
      </div>
    );
  }

  const handleFileUpload = (file: File) => {
    uploadPatternMutation.mutate(file);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString();
  };

  // Document Analysis Functions
  const analyzeDocumentMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Analysis failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setAnalysisDocument(data);
      toast({
        title: "Document Analyzed",
        description: "XMP metadata extracted and analyzed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveDecisionMutation = useMutation({
    mutationFn: async (decision: { result: string; notes: string; commands: string }) => {
      // Here you could save the admin decision to a database
      console.log('Admin Decision:', decision);
      return decision;
    },
    onSuccess: () => {
      toast({
        title: "Decision Saved",
        description: "Admin decision and commands have been recorded.",
      });
      setDecisionNotes("");
      setAdminCommands("");
    },
  });

  const handleAnalysisUpload = (file: File) => {
    analyzeDocumentMutation.mutate(file);
  };

  const handleSaveDecision = (result: string) => {
    saveDecisionMutation.mutate({
      result,
      notes: decisionNotes,
      commands: adminCommands
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4 sm:py-6">
            <div className="flex items-center">
              <ShieldCheck className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 mr-2 sm:mr-3" />
              <div>
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
                  Admin Portal
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Advanced document verification management
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              {user && (
                <div className="text-right">
                  <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Administrator</p>
                </div>
              )}
              <img
                src={user?.profileImageUrl || '/default-avatar.png'}
                alt="Profile"
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-full"
              />
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <div className="border-b border-border">
            <nav className="-mb-px flex space-x-8 overflow-x-auto whitespace-nowrap scrollbar-hide">
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  activeTab === "dashboard"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Database className="w-4 h-4 mr-2" />
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab("analysis")}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  activeTab === "analysis"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <FileSearch className="w-4 h-4 mr-2" />
                Document Analysis
              </button>
              <button
                onClick={() => setActiveTab("feedback")}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  activeTab === "feedback"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                User Feedback
              </button>
              <button
                onClick={() => setActiveTab("paid-reviews")}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  activeTab === "paid-reviews"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Paid Reviews
              </button>
              <button
                onClick={() => setActiveTab("users")}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  activeTab === "users"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Users className="w-4 h-4 mr-2" />
                User Management
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  activeTab === "settings"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </button>
            </nav>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
        {activeTab === "dashboard" && (
          <div>
            {/* Mobile-Optimized Admin Header */}
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Dashboard</h2>
        <p className="text-sm sm:text-lg text-gray-600 max-w-3xl mx-auto px-2">
          Manage trusted COS document patterns and monitor system performance. Upload genuine documents to expand the verification database.
        </p>
      </div>

      {/* Mobile-Responsive Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        <div className="bg-card rounded-xl shadow-md p-4 sm:p-6 transition-transform hover:-translate-y-1">
          <div className="flex items-center">
            <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Database className="text-blue-600 dark:text-blue-400 h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Trusted Patterns</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{stats?.trustedPatterns || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-md p-4 sm:p-6 transition-transform hover:-translate-y-1">
          <div className="flex items-center">
            <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="text-green-600 dark:text-green-400 h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Verifications Today</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{stats?.verificationsToday || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-md p-4 sm:p-6 transition-transform hover:-translate-y-1">
          <div className="flex items-center">
            <div className="p-2 sm:p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <AlertTriangle className="text-yellow-600 dark:text-yellow-400 h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Suspicious Docs</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{stats?.suspiciousDocs || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-md p-4 sm:p-6 transition-transform hover:-translate-y-1">
          <div className="flex items-center">
            <div className="p-2 sm:p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <TrendingUp className="text-slate-600 dark:text-slate-400 h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Success Rate</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground">{stats?.successRate || '0'}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management Section */}
      <div className="bg-card rounded-xl shadow-md p-6 mb-8 border border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-foreground">Data Management</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Clear user verification data while preserving trusted patterns database
            </p>
          </div>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Reset User Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all verification data history and results. Trusted patterns will be preserved.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => clearDataMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {clearDataMutation.isPending ? 'Clearing...' : 'Continue'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Mobile-Responsive Admin Actions */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-8">
        {/* Upload Genuine Documents */}
        <div className="bg-card rounded-xl shadow-md border border-border p-4 sm:p-8">
          <h3 className="text-lg sm:text-xl font-bold text-foreground mb-4 sm:mb-6">Upload Genuine COS Documents</h3>
          
          <FileUpload
            onFileUpload={handleFileUpload}
          />
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-200">
              <strong>Admin Mode:</strong> Unlimited document uploads for building trusted patterns database.
            </p>
          </div>

          <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6 mt-4 sm:mt-6">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Checkbox
                id="validateMetadata"
                checked={validateMetadata}
                onCheckedChange={(checked) => setValidateMetadata(checked === true)}
              />
              <label htmlFor="validateMetadata" className="text-sm text-gray-700 touch-manipulation">
                Validate metadata patterns
              </label>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Checkbox
                id="autoApprove"
                checked={autoApprove}
                onCheckedChange={(checked) => setAutoApprove(checked === true)}
              />
              <label htmlFor="autoApprove" className="text-sm text-gray-700 touch-manipulation">
                Auto-approve verified documents
              </label>
            </div>
          </div>

          <Button
            onClick={() => {/* Handle bulk upload */}}
            className="w-full touch-manipulation py-3 sm:py-2"
            disabled={uploadPatternMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add to Trusted Patterns
          </Button>
        </div>

        {/* Pattern Management */}
        <div className="bg-card rounded-xl shadow-md border border-border p-5 sm:p-8 flex flex-col max-h-[600px]">
          <h3 className="text-lg sm:text-xl font-bold text-foreground mb-6">Pattern Management</h3>
          
          {/* Search and Filter */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search patterns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background"
              />
            </div>
          </div>

          {/* Pattern List */}
          <div className="overflow-y-auto flex-1 pr-2 space-y-3 scrollbar-hide relative">
            {filteredPatterns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 my-4">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700">
                  <FileSearch className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No Patterns Found</h3>
                {searchTerm ? (
                  <p className="text-sm text-gray-500 dark:text-slate-400 max-w-[250px]">
                    No trusted patterns match "{searchTerm}". Try adjusting your filters.
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-slate-400 max-w-[250px]">
                    You haven't added any trusted patterns yet.
                  </p>
                )}
              </div>
            ) : (
              filteredPatterns.map((pattern: any) => (
                <div key={pattern.id} className="flex items-center justify-between p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors border border-transparent hover:border-border">
                  <div className="flex items-center space-x-3">
                    <span className="fas fa-file-pdf text-red-500"></span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{pattern.filename}</p>
                      <p className="text-xs text-muted-foreground">Added {formatDate(pattern.uploadedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={pattern.status === 'active' ? 'default' : 'secondary'}>
                      {pattern.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePatternMutation.mutate(pattern.id)}
                      disabled={deletePatternMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <Button className="w-full text-foreground hover:bg-muted" variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Pattern Database
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-8 bg-card rounded-xl shadow-md border border-border p-8">
        <h3 className="text-xl font-bold text-foreground mb-6">Recent Verification Activity</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700">Time</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Document</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Result</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">Confidence</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((activity: any) => (
                <tr key={activity.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-600">{formatTime(activity.verifiedAt)}</td>
                  <td className="py-3 px-4 text-sm text-gray-900">{activity.filename}</td>
                  <td className="py-3 px-4">
                    <Badge
                      variant={
                        activity.result === 'genuine' ? 'default' :
                        activity.result === 'suspicious' ? 'secondary' : 'destructive'
                      }
                    >
                      {activity.result.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{activity.confidence.toFixed(1)}%</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{activity.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
          </div>
        )}

        {activeTab === "analysis" && (
          <div>
            {/* Document Analysis Header */}
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
                Document Analysis
              </h2>
              <p className="text-sm sm:text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto px-2">
                Upload documents for detailed XMP metadata analysis and admin decision-making.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Upload Section */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  Upload Document for Analysis
                </h3>
                
                <FileUpload onFileUpload={handleAnalysisUpload} />
                
                {analyzeDocumentMutation.isPending && (
                  <div className="mt-4 flex items-center justify-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                    <span className="text-blue-800 dark:text-blue-200">Analyzing document...</span>
                  </div>
                )}
              </div>

              {/* Admin Decision Panel */}
              {analysisDocument && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                    Admin Decision Panel
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Decision Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Decision Notes
                      </label>
                      <textarea
                        value={decisionNotes}
                        onChange={(e) => setDecisionNotes(e.target.value)}
                        placeholder="Add your analysis notes and reasoning..."
                        className="w-full h-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                      />
                    </div>

                    {/* Admin Commands */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Admin Commands
                      </label>
                      <div className="relative">
                        <Code className="absolute left-3 top-3 text-gray-400 h-4 w-4" />
                        <textarea
                          value={adminCommands}
                          onChange={(e) => setAdminCommands(e.target.value)}
                          placeholder="Enter command setup for future processing..."
                          className="w-full h-32 pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm resize-none"
                        />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Commands for automated processing and decision workflows
                      </p>
                    </div>

                    {/* Decision Buttons */}
                    <div className="flex space-x-3 pt-4">
                      <Button
                        onClick={() => handleSaveDecision('approve')}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        disabled={saveDecisionMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleSaveDecision('reject')}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                        disabled={saveDecisionMutation.isPending}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                      <Button
                        onClick={() => handleSaveDecision('review')}
                        variant="outline"
                        className="flex-1"
                        disabled={saveDecisionMutation.isPending}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Review
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* XMP Metadata Analysis Display */}
            {analysisDocument && (
              <div className="mt-8 space-y-6">
                {/* XMP Tags Section */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center mb-6">
                    <div className="text-blue-600 mr-3">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                      XMP Tags
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {/* dc:date */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        dc:date
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {analysisDocument.metadata?.xmp_tags?.['dc:date'] || 
                         analysisDocument.metadata?.creation_date || 
                         'Not available'}
                      </div>
                    </div>

                    {/* dc:format */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        dc:format
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {analysisDocument.metadata?.xmp_tags?.['dc:format'] || 
                         analysisDocument.metadata?.format || 
                         'application/pdf'}
                      </div>
                    </div>

                    {/* dc:language */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        dc:language
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {analysisDocument.metadata?.xmp_tags?.['dc:language'] || 
                         analysisDocument.metadata?.language || 
                         'en-US'}
                      </div>
                    </div>

                    {/* pdf:PDFVersion */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        pdf:PDFVersion
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {analysisDocument.metadata?.xmp_tags?.['pdf:PDFVersion'] || 
                         analysisDocument.metadata?.pdf_version || 
                         '1.4'}
                      </div>
                    </div>

                    {/* pdf:Producer */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        pdf:Producer
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {analysisDocument.metadata?.xmp_tags?.['pdf:Producer'] || 
                         analysisDocument.metadata?.producer || 
                         'Unknown'}
                      </div>
                    </div>

                    {/* xmp:CreateDate */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        xmp:CreateDate
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {analysisDocument.metadata?.xmp_tags?.['xmp:CreateDate'] || 
                         analysisDocument.metadata?.creation_date || 
                         'Not available'}
                      </div>
                    </div>

                    {/* xmp:CreatorTool */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        xmp:CreatorTool
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {analysisDocument.metadata?.xmp_tags?.['xmp:CreatorTool'] || 
                         analysisDocument.metadata?.creator_tool || 
                         analysisDocument.metadata?.creator || 
                         'Unknown'}
                      </div>
                    </div>

                    {/* xmp:MetadataDate */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        xmp:MetadataDate
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {analysisDocument.metadata?.xmp_tags?.['xmp:MetadataDate'] || 
                         analysisDocument.metadata?.metadata_date || 
                         analysisDocument.metadata?.modification_date || 
                         'Not available'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Analysis Results */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                    Document Analysis Results
                  </h3>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Verification Status */}
                    <div>
                      <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                        Verification Status
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">Result:</span>
                          <Badge variant={analysisDocument.result === 'genuine' ? 'default' : 'destructive'}>
                            {analysisDocument.result?.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">Confidence:</span>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {analysisDocument.confidence?.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">File Size:</span>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {analysisDocument.metadata?.fileSize ? `${(analysisDocument.metadata.fileSize / 1024).toFixed(1)} KB` : 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pattern Analysis */}
                    <div>
                      <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                        Pattern Analysis
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">Vector Similarity:</span>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {analysisDocument.details?.patternMatching?.vectorSimilarity?.toFixed(1) || '0.0'}%
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">Document Structure:</span>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {analysisDocument.details?.patternMatching?.documentStructure?.toFixed(1) || '0.0'}%
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">Format Patterns:</span>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {analysisDocument.details?.patternMatching?.formattingPatterns?.toFixed(1) || '0.0'}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Raw Metadata */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Complete Metadata Extract
                  </h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Enhanced XMP Data */}
                    <div>
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">XMP Tags Data</h5>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto">
                        <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap">
                          {JSON.stringify(analysisDocument.details?.metadata?.xmp_tags || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                    
                    {/* Complete Metadata */}
                    <div>
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Metadata</h5>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto">
                        <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap">
                          {JSON.stringify(analysisDocument.details?.metadata || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feedback Tab */}
        {activeTab === "feedback" && (
          <div>
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
                User Feedback Analytics
              </h2>
              <p className="text-sm sm:text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto px-2">
                Monitor user feedback to improve AI verification accuracy and user experience
              </p>
            </div>
            
            <FeedbackAnalytics />
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div>
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
                System Settings
              </h2>
              <p className="text-sm sm:text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto px-2">
                Control global verification behaviour and admin account settings
              </p>
            </div>

            <div className="flex flex-col items-center gap-6">
              {/* Global Verification Defaults */}
              <Card className="w-full max-w-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-600" />
                    System-Wide Verification Defaults
                  </CardTitle>
                  <CardDescription>
                    These settings apply to all registered users who have not been given an individual limit.
                    Changes take effect immediately for all current and future users.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Default Daily COS Check Limit
                    </label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Enter <strong>1</strong> for one check per day (default), <strong>-1</strong> for unlimited, or any positive integer for a custom cap.
                    </p>
                    <div className="flex gap-3">
                      <Input
                        type="number"
                        min={-1}
                        value={globalLimitInput}
                        onChange={(e) => setGlobalLimitInput(e.target.value)}
                        className="w-36"
                        placeholder="e.g. 1"
                      />
                      <Button
                        onClick={() => {
                          const parsed = parseInt(globalLimitInput, 10);
                          if (isNaN(parsed) || (parsed !== -1 && parsed < 1)) {
                            toast({ title: 'Invalid value', description: 'Enter -1 for unlimited or a positive integer.', variant: 'destructive' });
                            return;
                          }
                          updateSettingMutation.mutate({ key: 'defaultDailyLimit', value: String(parsed) });
                        }}
                        disabled={updateSettingMutation.isPending}
                      >
                        {updateSettingMutation.isPending ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">
                        Current: {currentDailyLimit === '-1' ? 'Unlimited' : `${currentDailyLimit} / day`}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Admin Authentication card */}
              <Card className="w-full max-w-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Admin Authentication
                  </CardTitle>
                  <CardDescription>
                    Admin login is secured via email OTP verification only. No password is required.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    To sign in, enter your admin email address and verify with the one-time code sent to your inbox.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* User Management Tab */}
        {activeTab === "users" && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                User Management
              </h2>
              <p className="text-sm sm:text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
                Full control over user access, COS check permissions, subscriptions and IP exemptions
              </p>
            </div>

            {/* Search + refresh */}
            <div className="flex gap-3 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by email or username..."
                  value={userSearchInput}
                  onChange={(e) => setUserSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setUserSearch(userSearchInput);
                      setUserPage(1);
                    }
                  }}
                  className="pl-9"
                />
              </div>
              <Button
                onClick={() => { setUserSearch(userSearchInput); setUserPage(1); }}
                variant="default"
              >
                <Search className="w-4 h-4 mr-1" /> Search
              </Button>
              <Button variant="outline" onClick={() => refetchUsers()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1"><Bell className="w-3 h-3 text-blue-500" /> Notification Engine subscription</span>
              <span className="flex items-center gap-1"><FileCheck className="w-3 h-3 text-green-500" /> COS Check subscription</span>
              <span className="flex items-center gap-1"><Wifi className="w-3 h-3 text-purple-500" /> IP Exempt (no daily IP limit)</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Admin-approved COS access</span>
            </div>

            {usersLoading ? (
              <div className="text-center py-12 text-gray-500">Loading users...</div>
            ) : (
              <>
                <div className="space-y-3">
                  {(usersData?.data || []).map((u) => {
                    const isExpanded = expandedUserId === u.id;
                    const displayName = u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.username || u.email || u.id;
                    const hasCosSubscription = u.cosCheckSubscription === true;
                    const hasCosApproval = u.cosCheckApproved === true;
                    const isIpExempt = u.ipExempt === true;
                    const isRestricted = u.isRestricted === true;
                    const notifTier = u.subscriptionStatus || 'free';
                    const hasCosViaPlan = ['pro', 'unlimited', 'enterprise'].includes(notifTier);

                    return (
                      <div key={u.id} className={`border rounded-lg bg-white dark:bg-gray-800 ${isRestricted ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'}`}>
                        {/* Row header */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer"
                          onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                                {(displayName[0] || '?').toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white truncate">{displayName}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email || 'No email'}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            {/* Subscription badges */}
                            {notifTier !== 'free' && (
                              <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs hidden sm:flex items-center gap-1">
                                <Bell className="w-3 h-3" /> {notifTier}
                              </Badge>
                            )}
                            {(hasCosSubscription || hasCosViaPlan) && (
                              <Badge variant="outline" className="text-green-600 border-green-300 text-xs hidden sm:flex items-center gap-1">
                                <FileCheck className="w-3 h-3" /> COS
                              </Badge>
                            )}
                            {hasCosApproval && !hasCosSubscription && !hasCosViaPlan && (
                              <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-xs hidden sm:flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Approved
                              </Badge>
                            )}
                            {isIpExempt && (
                              <Badge variant="outline" className="text-purple-600 border-purple-300 text-xs hidden sm:flex items-center gap-1">
                                <Wifi className="w-3 h-3" /> IP Exempt
                              </Badge>
                            )}
                            {isRestricted && (
                              <Badge variant="destructive" className="text-xs">Restricted</Badge>
                            )}
                            {u.role === 'admin' && (
                              <Badge className="bg-gray-800 text-white text-xs">Admin</Badge>
                            )}
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>

                        {/* Expanded controls */}
                        {isExpanded && (
                          <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-5 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
                            {/* Subscription status overview */}
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                                  <Bell className="w-3 h-3 text-blue-500" /> Notification Engine
                                </p>
                                <p className="font-semibold capitalize">{notifTier}</p>
                              </div>
                              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                                  <FileCheck className="w-3 h-3 text-green-500" /> COS Check Access
                                </p>
                                <p className="font-semibold">
                                  {u.role === 'admin' ? 'Admin (unlimited)' :
                                   hasCosSubscription ? 'Subscribed' :
                                   hasCosViaPlan ? `Via ${notifTier} plan` :
                                   hasCosApproval ? 'Admin approved' :
                                   'None'}
                                </p>
                              </div>
                              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                                  <Wifi className="w-3 h-3 text-purple-500" /> IP Rate Limit
                                </p>
                                <p className="font-semibold">{isIpExempt || u.role === 'admin' ? 'Exempt' : 'Active'}</p>
                              </div>
                              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Verification Limit</p>
                                <p className="font-semibold">
                                  {u.verificationLimit === -1 ? 'Unlimited' :
                                   u.verificationLimit != null ? `${u.verificationLimit} total` :
                                   'Default (1/day)'}
                                </p>
                              </div>
                            </div>

                            {/* Controls — disabled for admin users */}
                            {u.role !== 'admin' && (
                              <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Access Controls</h4>

                                {/* COS Check Access */}
                                <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                  <div>
                                    <p className="text-sm font-medium flex items-center gap-2">
                                      <FileCheck className="w-4 h-4 text-green-500" />
                                      COS Check Access
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                      Manually approve this user to use COS document checking. Also grants IP exemption.
                                    </p>
                                  </div>
                                  <Switch
                                    checked={hasCosApproval}
                                    onCheckedChange={(checked) =>
                                      cosApprovalMutation.mutate({ userId: u.id, approved: checked })
                                    }
                                    disabled={cosApprovalMutation.isPending}
                                  />
                                </div>

                                {/* IP Exempt */}
                                <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                  <div>
                                    <p className="text-sm font-medium flex items-center gap-2">
                                      <Wifi className="w-4 h-4 text-purple-500" />
                                      IP Rate Limit Exempt
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                      Bypass the daily IP-based verification limit for this user.
                                    </p>
                                  </div>
                                  <Switch
                                    checked={isIpExempt}
                                    onCheckedChange={(checked) =>
                                      ipExemptMutation.mutate({ userId: u.id, exempt: checked })
                                    }
                                    disabled={ipExemptMutation.isPending}
                                  />
                                </div>

                                {/* COS Check Subscription */}
                                <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                  <div>
                                    <p className="text-sm font-medium flex items-center gap-2">
                                      <FileCheck className="w-4 h-4 text-blue-500" />
                                      COS Check Subscription
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                      Mark user as having an active standalone COS check subscription (no admin approval needed).
                                    </p>
                                  </div>
                                  <Switch
                                    checked={hasCosSubscription}
                                    onCheckedChange={(checked) =>
                                      cosSubscriptionMutation.mutate({ userId: u.id, active: checked })
                                    }
                                    disabled={cosSubscriptionMutation.isPending}
                                  />
                                </div>

                                {/* Verification Limit */}
                                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                  <p className="text-sm font-medium mb-2">Verification Limit</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                    Set to <code>-1</code> for unlimited, leave blank for default (1/day), or enter a positive number for a custom total cap.
                                  </p>
                                  <div className="flex gap-2">
                                    <Input
                                      placeholder="e.g. -1, 10, blank=default"
                                      value={limitInputs[u.id] ?? (u.verificationLimit == null ? '' : String(u.verificationLimit))}
                                      onChange={(e) => setLimitInputs(prev => ({ ...prev, [u.id]: e.target.value }))}
                                      className="flex-1 text-sm"
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        const raw = limitInputs[u.id] ?? '';
                                        const limit = raw.trim() === '' ? null : parseInt(raw, 10);
                                        if (raw.trim() !== '' && isNaN(limit as number)) {
                                          toast({ title: 'Invalid', description: 'Enter a number, -1, or leave blank.', variant: 'destructive' });
                                          return;
                                        }
                                        verificationLimitMutation.mutate({ userId: u.id, limit });
                                      }}
                                      disabled={verificationLimitMutation.isPending}
                                    >
                                      <Save className="w-3 h-3 mr-1" /> Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => verificationLimitMutation.mutate({ userId: u.id, limit: -1 })}
                                      disabled={verificationLimitMutation.isPending}
                                      title="Set unlimited"
                                    >
                                      Unlimited
                                    </Button>
                                  </div>
                                </div>

                                {/* Restrict user */}
                                <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                  <div>
                                    <p className="text-sm font-medium flex items-center gap-2">
                                      <Ban className="w-4 h-4 text-red-500" />
                                      Restrict Account
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                      Block this user from accessing the platform entirely.
                                    </p>
                                  </div>
                                  <Switch
                                    checked={isRestricted}
                                    onCheckedChange={(checked) =>
                                      restrictUserMutation.mutate({ userId: u.id, restricted: checked })
                                    }
                                    disabled={restrictUserMutation.isPending}
                                  />
                                </div>
                              </div>
                            )}

                            {u.role === 'admin' && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 italic">Admin accounts cannot be modified from this panel.</p>
                            )}

                            <div className="flex items-center justify-between mt-1">
                              <p className="text-xs text-gray-400 dark:text-gray-600">
                                Credits: {u.credits ?? 0} &bull; Member since: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Unknown'} &bull; ID: {u.id}
                              </p>
                              {u.role !== 'admin' && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => setUserToDelete({ id: u.id, name: displayName })}
                                  disabled={deleteUserMutation.isPending}
                                >
                                  <Trash2 className="w-3 h-3" /> Delete User
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Delete user confirmation dialog */}
                <AlertDialog open={!!userToDelete} onOpenChange={(open) => { if (!open) setUserToDelete(null); }}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete User Account</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to permanently delete <strong>{userToDelete?.name}</strong>? This action cannot be undone and will remove all their data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleteUserMutation.isPending}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        disabled={deleteUserMutation.isPending}
                        onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
                      >
                        {deleteUserMutation.isPending ? 'Deleting…' : 'Delete Permanently'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Pagination */}
                {usersData && usersData.totalPages > 1 && (
                  <div className="flex justify-center items-center gap-4 mt-6">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={userPage <= 1}
                      onClick={() => setUserPage(p => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Page {userPage} of {usersData.totalPages} ({usersData.total} users)
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={userPage >= usersData.totalPages}
                      onClick={() => setUserPage(p => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}

                {usersData && usersData.total === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No users found{userSearch ? ` for "${userSearch}"` : ''}.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Paid Reviews Tab */}
        {activeTab === "paid-reviews" && (
          <div>
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
                Expert Verification Reviews
              </h2>
              <p className="text-sm sm:text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto px-2">
                Review paid CoS verification submissions and provide expert analysis
              </p>
            </div>

            {selectedSubmission ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      Submission #{selectedSubmission.id}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">{selectedSubmission.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={selectedSubmission.packageType === 'full' ? 'default' : 'secondary'}>
                      {selectedSubmission.packageType === 'full' ? 'Full Package' : 'Normal'}
                    </Badge>
                    {selectedSubmission.priority && (
                      <Badge className="bg-orange-500">Priority</Badge>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Employer</label>
                      <p className="text-gray-900 dark:text-white">{selectedSubmission.employerName || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Job Title</label>
                      <p className="text-gray-900 dark:text-white">{selectedSubmission.jobTitle || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">CoS Reference</label>
                      <p className="text-gray-900 dark:text-white font-mono">{selectedSubmission.cosReferenceNumber || 'Not provided'}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">How Applied</label>
                      <p className="text-gray-900 dark:text-white text-sm">{selectedSubmission.howApplied || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Emails Received</label>
                      <p className="text-gray-900 dark:text-white text-sm">{selectedSubmission.emailsReceived || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t dark:border-gray-700 pt-6 space-y-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">Expert Review</h4>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Verdict</label>
                      <select
                        className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                        value={reviewForm.expertVerdict}
                        onChange={(e) => setReviewForm({ ...reviewForm, expertVerdict: e.target.value })}
                      >
                        <option value="">Select verdict</option>
                        <option value="genuine">Genuine</option>
                        <option value="suspicious">Suspicious</option>
                        <option value="fake">Fake</option>
                        <option value="inconclusive">Inconclusive</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Confidence (%)</label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={reviewForm.expertConfidence}
                        onChange={(e) => setReviewForm({ ...reviewForm, expertConfidence: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Analysis Report</label>
                    <textarea
                      className="w-full p-3 border rounded-lg min-h-[150px] dark:bg-gray-700 dark:border-gray-600"
                      placeholder="Detailed analysis of the document..."
                      value={reviewForm.documentAnalysisReport}
                      onChange={(e) => setReviewForm({ ...reviewForm, documentAnalysisReport: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Recommendations</label>
                    <textarea
                      className="w-full p-3 border rounded-lg min-h-[80px] dark:bg-gray-700 dark:border-gray-600"
                      placeholder="Recommendations for the user..."
                      value={reviewForm.recommendations}
                      onChange={(e) => setReviewForm({ ...reviewForm, recommendations: e.target.value })}
                    />
                  </div>

                  {selectedSubmission.packageType === 'full' && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-medium text-blue-900 dark:text-blue-300">Employer Verification</h5>
                          <p className="text-sm text-blue-700 dark:text-blue-400">
                            Check sponsor licence status for: {selectedSubmission.employerName || 'No employer specified'}
                          </p>
                        </div>
                        <Button
                          onClick={() => verifyEmployerMutation.mutate(selectedSubmission.id)}
                          disabled={verifyEmployerMutation.isPending || !selectedSubmission.employerName}
                          variant="outline"
                          className="border-blue-500 text-blue-600 hover:bg-blue-50"
                        >
                          {verifyEmployerMutation.isPending ? 'Checking...' : 'Run Verification'}
                        </Button>
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        Opens verification checklist with links to UK Government sponsor register
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 pt-4">
                    <Button
                      onClick={() => {
                        updateSubmissionMutation.mutate({
                          id: selectedSubmission.id,
                          data: {
                            ...reviewForm,
                            reviewStatus: 'completed',
                          },
                        });
                      }}
                      disabled={updateSubmissionMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Complete Review
                    </Button>
                    <Button
                      onClick={() => sendReportMutation.mutate(selectedSubmission.id)}
                      disabled={sendReportMutation.isPending || selectedSubmission.reviewStatus !== 'completed'}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {sendReportMutation.isPending ? 'Sending...' : 'Send Report to User'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedSubmission(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {paidSubmissions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-emerald-200/50 dark:border-emerald-900/30 rounded-2xl bg-emerald-50/30 dark:bg-emerald-900/10">
                    <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/10 dark:shadow-none border border-emerald-100 dark:border-emerald-900/50 relative">
                      <div className="absolute inset-0 bg-emerald-100 dark:bg-emerald-900/40 rounded-full animate-ping opacity-30" />
                      <CheckCircle className="w-10 h-10 text-emerald-500 relative z-10" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Inbox Zero</h3>
                    <p className="text-gray-500 dark:text-slate-400 max-w-[280px]">
                      Excellent work! You are all caught up. There are no pending expert review submissions waiting in the queue.
                    </p>
                  </div>
                ) : (
                  paidSubmissions.map((submission: PaidSubmission) => (
                    <div
                      key={submission.id}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              #{submission.id}
                            </span>
                            <Badge variant={submission.packageType === 'full' ? 'default' : 'secondary'}>
                              {submission.packageType === 'full' ? 'Full' : 'Normal'}
                            </Badge>
                            {submission.priority && (
                              <Badge className="bg-orange-500 text-white">Priority</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{submission.email}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {submission.employerName} - {submission.jobTitle}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Submitted: {new Date(submission.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedSubmission(submission);
                            setReviewForm({
                              expertVerdict: submission.expertVerdict || '',
                              expertConfidence: submission.expertConfidence || 0,
                              documentAnalysisReport: submission.documentAnalysisReport || '',
                              recommendations: submission.recommendations || '',
                            });
                          }}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Review
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
