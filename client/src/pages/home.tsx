import { useState, Suspense, lazy } from "react";
import { Link } from "wouter";
import { Shield, Database, LayoutDashboard, LogIn, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import UserProfile from "@/components/UserProfile";
import FileUploadSimple from "@/components/FileUploadSimple";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import SEOHead from "@/components/SEOHead";

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
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{type: 'genuine' | 'suspicious' | 'fake', confidence: number} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Temporarily disable auth to prevent infinite loops
  // const { isAuthenticated, isAdmin, user, isLoading } = useAuth();

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    // This will be handled by FileUploadSimple component
  };

  const handleVerificationResult = (result: {type: 'genuine' | 'suspicious' | 'fake', confidence: number}) => {
    setVerificationResult(result);
    setIsLoading(false);
  };

  const handleVerificationError = (error: string) => {
    console.error('Verification error:', error);
    setIsLoading(false);
  };

  const { data: stats } = useQuery({
    queryKey: ['/api/stats'],
  });

  // Show landing page first, then portals on user action
  const mainContent = !showPortals ? (
    <div className="min-h-screen">
      {/* Mobile-Optimized Navigation Header */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Shield className="text-blue-600 text-xl sm:text-2xl" />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Document Authenticator</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">AI-Powered Document Authentication</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              <Link href="/dashboard">
                <Button 
                  variant="default" 
                  size="sm"
                  className="text-xs sm:text-sm px-3 sm:px-4 py-2"
                >
                  <span className="hidden sm:inline">Verify Document</span>
                  <span className="sm:hidden">Verify</span>
                </Button>
              </Link>
              
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                <Database className="w-4 h-4" />
                <span>{(stats as any)?.trustedPatterns || 0}</span>
              </div>

              <UserProfile />
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <Suspense fallback={<LoadingSpinner />}>
        <HeroSection onStartVerification={() => setShowVerificationModal(true)} />
      </Suspense>
    </div>
  ) : (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Shield className="text-blue-600 text-2xl" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Document Authenticator</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Advanced AI-Powered Document Verification</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Login button */}
              <Link href="/login">
                <Button 
                  variant="outline" 
                  size="sm"
                >
                  <LogIn className="mr-2 w-4 h-4" />
                  Sign In
                </Button>
              </Link>
              
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
                <span>{(stats as any)?.trustedPatterns || 0}</span>
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

  // SEO data for home page
  const homePageSEO = {
    title: "AI Certificate of Sponsorship Checker | Verify UK CoS Documents",
    description: "Verify your UK Certificate of Sponsorship instantly with AI-powered fraud detection. Protect yourself from fake CoS documents and visa scams. Free verification for UK visa applicants.",
    keywords: "certificate of sponsorship verification, verify UK CoS, AI CoS checker, fake CoS detection, UK visa document verification, sponsor license verification, CoS authenticity check",
    canonicalUrl: "https://checkbyai.net/",
    ogImage: "https://checkbyai.net/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "Certificate of Sponsorship Verification Tool",
      "description": "AI-powered verification service for UK Certificates of Sponsorship. Detects fake CoS documents and helps visa applicants verify sponsor authenticity before applying for UK work visas.",
      "url": "https://checkbyai.net/",
      "applicationCategory": "SecurityApplication",
      "operatingSystem": "Web Browser",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "GBP"
      },
      "featureList": [
        "AI-powered document verification",
        "PDF metadata analysis", 
        "Fake document detection",
        "Real-time verification results",
        "Secure document processing"
      ],
      "provider": {
        "@type": "Organization",
        "name": "Check By AI",
        "url": "https://checkbyai.net/"
      }
    }
  };

  // Return JSX with verification modal
  return (
    <>
      <SEOHead {...homePageSEO} />
      {/* Main Page Content */}
      {mainContent}
      
      {/* Verification Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Document Verification</h2>
              <button
                onClick={() => {
                  setShowVerificationModal(false);
                  setVerificationResult(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              {!verificationResult ? (
                <div>
                  <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-blue-800 dark:text-blue-200">Document Verification Available</h3>
                        <p className="text-blue-700 dark:text-blue-300 text-sm">Upload your document to verify its authenticity instantly</p>
                      </div>
                    </div>
                  </div>
                  
                  <FileUploadSimple
                    onFileUpload={handleFileUpload}
                    onVerificationResult={handleVerificationResult}
                    onError={handleVerificationError}
                    onLoading={setIsLoading}
                    isAdmin={false}
                  />
                </div>
              ) : (
                <div className="text-center">
                  <div className="mb-6">
                    <div className={`inline-block px-6 py-3 rounded-full text-lg font-semibold transition-all duration-700 ease-in-out transform hover:scale-105 ${
                      verificationResult.type === 'genuine' 
                        ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg shadow-green-500/25 animate-pulse'
                        : verificationResult.type === 'suspicious'
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg shadow-yellow-500/25 animate-bounce'
                        : 'bg-gradient-to-r from-red-400 to-rose-500 text-white shadow-lg shadow-red-500/25 animate-pulse'
                    }`}>
                      {verificationResult.type === 'genuine' ? 'Genuine' : verificationResult.type === 'suspicious' ? 'Suspicious' : 'Fake'}
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <p className="text-gray-600 dark:text-gray-300">
                      Confidence: {Math.round(verificationResult.confidence)}%
                    </p>
                    <button
                      onClick={() => {
                        setShowVerificationModal(false);
                        setVerificationResult(null);
                      }}
                      className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}