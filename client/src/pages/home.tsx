import { useState, Suspense, lazy } from "react";
import { Link } from "wouter";
import { Shield, Database, LayoutDashboard, ArrowRight, User, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

// Lazy load heavy components for better performance
const UserPortal = lazy(() => import("@/components/UserPortal"));
const AdminPortal = lazy(() => import("@/components/AdminPortal"));
const HeroSection = lazy(() => import("@/components/HeroSection"));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}

export default function Home() {
  const [showPortals, setShowPortals] = useState(false);
  const [activeMode, setActiveMode] = useState<'user' | 'admin'>('user');
  const { isAuthenticated, isAdmin, user, isLoading } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['/api/stats'],
  });

  // Show landing page first, then portals on user action
  if (!showPortals) {
    return (
      <div className="min-h-screen">
        {/* Mobile-Optimized Navigation Header */}
        <nav className="fixed top-0 w-full z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14 sm:h-16">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <Shield className="text-blue-600 text-xl sm:text-2xl" />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">COS Verifier</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">AI-Powered Document Authentication</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Link href="/dashboard?setup=true">
                  <Button 
                    variant="default" 
                    size="sm"
                    className="text-xs sm:text-sm px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white"
                  >
                    Setup - Try Free
                  </Button>
                </Link>
                
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowPortals(true)}
                  className="text-xs sm:text-sm px-3 sm:px-4 py-2 text-gray-600 hover:text-blue-600"
                >
                  <span className="hidden sm:inline">Launch App</span>
                  <span className="sm:hidden">App</span>
                  <ArrowRight className="ml-1 sm:ml-2 w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
                
                <Link href="/dashboard">
                  <Button variant="outline" size="sm">
                    <LayoutDashboard className="mr-2 w-4 h-4" />
                    Dashboard
                  </Button>
                </Link>
                
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                  <Database className="w-4 h-4" />
                  <span>{stats?.trustedPatterns || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* 3D Landing Page */}
        <Suspense fallback={<LoadingSpinner />}>
          <HeroSection onStartVerification={() => setShowPortals(true)} />
        </Suspense>
      </div>
    );
  }

  // Show application portals
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Application Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowPortals(false)}
                className="text-gray-600 hover:text-blue-600"
              >
                ← Back to Home
              </Button>
              
              <div className="flex items-center space-x-2">
                <Shield className="text-blue-600 text-xl" />
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">COS Verifier</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {!isLoading && (
                <>
                  {isAuthenticated ? (
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2 text-sm">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                          {user?.profileImageUrl ? (
                            <img 
                              src={user.profileImageUrl} 
                              alt="Profile" 
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {user?.firstName || user?.email || 'User'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {user?.role === 'admin' ? 'Administrator' : 'User'}
                          </div>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.location.href = "/api/logout"}
                      >
                        <LogOut className="mr-2 w-4 h-4" />
                        Logout
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.location.href = "/api/login"}
                    >
                      <LogIn className="mr-2 w-4 h-4" />
                      Login
                    </Button>
                  )}
                </>
              )}
              
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  <LayoutDashboard className="mr-2 w-4 h-4" />
                  Dashboard
                </Button>
              </Link>
              
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setActiveMode('user')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    activeMode === 'user'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  User Portal
                </button>
                <button
                  onClick={() => setActiveMode('admin')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    activeMode === 'admin'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Admin Portal
                </button>
              </div>
              
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                <Database className="w-4 h-4" />
                <span>{stats?.trustedPatterns || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<LoadingSpinner />}>
          {activeMode === 'user' ? <UserPortal /> : <AdminPortal />}
        </Suspense>
      </main>
    </div>
  );
}
