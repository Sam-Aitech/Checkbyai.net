import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import FileUpload from "./FileUpload";
import { Database, CheckCircle, AlertTriangle, TrendingUp, Search, Trash2, Download, Plus, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export default function AdminPortal() {
  const [searchTerm, setSearchTerm] = useState("");
  const [validateMetadata, setValidateMetadata] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isAdmin, isLoading, user } = useAuth();

  // All hooks must be called before any conditional logic
  const { data: stats } = useQuery({
    queryKey: ['/api/stats'],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: trustedPatterns = [] } = useQuery({
    queryKey: ['/api/trusted-patterns'],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ['/api/admin/recent-activity'],
    enabled: isAuthenticated && isAdmin,
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
          window.location.href = "/api/login";
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
        window.location.href = "/api/login";
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
          onClick={() => window.location.href = "/api/logout"}
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

  const handleFileUpload = (file: File) => {
    uploadPatternMutation.mutate(file);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString();
  };

  return (
    <div className="px-3 sm:px-6 lg:px-8">
      {/* Mobile-Optimized Admin Header */}
      <div className="text-center mb-8 sm:mb-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">Admin Portal</h2>
        <p className="text-sm sm:text-lg text-gray-600 max-w-3xl mx-auto px-2">
          Manage trusted COS document patterns and monitor system performance. Upload genuine documents to expand the verification database.
        </p>
      </div>

      {/* Mobile-Responsive Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Database className="text-blue-600 h-4 w-4 sm:h-6 sm:w-6" />
            </div>
            <div className="ml-2 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Trusted Patterns</p>
              <p className="text-lg sm:text-2xl font-semibold text-gray-900">{stats?.trustedPatterns || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="text-green-600 h-4 w-4 sm:h-6 sm:w-6" />
            </div>
            <div className="ml-2 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Verifications Today</p>
              <p className="text-lg sm:text-2xl font-semibold text-gray-900">{stats?.verificationsToday || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertTriangle className="text-yellow-600 h-4 w-4 sm:h-6 sm:w-6" />
            </div>
            <div className="ml-2 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Suspicious Docs</p>
              <p className="text-lg sm:text-2xl font-semibold text-gray-900">{stats?.suspiciousDocs || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-6">
          <div className="flex items-center">
            <div className="p-2 bg-gray-100 rounded-lg">
              <TrendingUp className="text-gray-600 h-4 w-4 sm:h-6 sm:w-6" />
            </div>
            <div className="ml-2 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Success Rate</p>
              <p className="text-lg sm:text-2xl font-semibold text-gray-900">{stats?.successRate || '0'}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Data Management</h3>
            <p className="text-sm text-gray-600 mt-1">
              Clear user verification data while preserving trusted patterns database
            </p>
          </div>
          <Button
            onClick={() => clearDataMutation.mutate()}
            variant="destructive"
            disabled={clearDataMutation.isPending}
            className="flex items-center"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {clearDataMutation.isPending ? 'Clearing...' : 'Reset User Data'}
          </Button>
        </div>
      </div>

      {/* Mobile-Responsive Admin Actions */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-8">
        {/* Upload Genuine Documents */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-8">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Upload Genuine COS Documents</h3>
          
          <FileUpload
            onFileUpload={handleFileUpload}
          />

          <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6 mt-4 sm:mt-6">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Checkbox
                id="validateMetadata"
                checked={validateMetadata}
                onCheckedChange={setValidateMetadata}
              />
              <label htmlFor="validateMetadata" className="text-sm text-gray-700 touch-manipulation">
                Validate metadata patterns
              </label>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Checkbox
                id="autoApprove"
                checked={autoApprove}
                onCheckedChange={setAutoApprove}
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Pattern Management</h3>
          
          {/* Search and Filter */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Search patterns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Pattern List */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {filteredPatterns.map((pattern: any) => (
              <div key={pattern.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="fas fa-file-pdf text-red-500"></span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{pattern.filename}</p>
                    <p className="text-xs text-gray-500">Added {formatDate(pattern.uploadedAt)}</p>
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
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <Button className="w-full" variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Pattern Database
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Recent Verification Activity</h3>
        
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
  );
}
