import { useState, Suspense, lazy } from "react";
import { Link } from "wouter";
import { Shield, Database, LayoutDashboard, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

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

  const { data: stats } = useQuery({
    queryKey: ['/api/stats'],
  });

  // Show landing page first, then portals on user action
  if (!showPortals) {
    return (
      <div className="min-h-screen">
        {/* Modern Navigation Header */}
        <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-3">
                <Shield className="text-blue-600 text-2xl" />
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">COS Verifier</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">AI-Powered Document Authentication</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowPortals(true)}
                  className="text-gray-600 hover:text-blue-600"
                >
                  Launch App
                  <ArrowRight className="ml-2 w-4 h-4" />
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
          <HeroSection />
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
