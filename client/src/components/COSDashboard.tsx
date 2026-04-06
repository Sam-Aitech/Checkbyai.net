import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'wouter';
import FileUploadSimple from './FileUploadSimple';
import Enhanced3DDemo from './Enhanced3DDemo';
import VerificationResults from './VerificationResults';
import MetadataGroupsPanel from './MetadataGroupsPanel';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { queryClient } from '@/lib/queryClient';

function CursorTrail() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trailsRef = useRef<Set<HTMLDivElement>>(new Set());
  const lastTimeRef = useRef(0);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastTimeRef.current < 50) return;
    lastTimeRef.current = now;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const trail = document.createElement('div');
    trail.className = 'absolute w-3 h-3 bg-white/30 rounded-full pointer-events-none animate-ping';
    trail.style.left = x + 'px';
    trail.style.top = y + 'px';
    trail.style.transform = 'translate(-50%, -50%)';
    e.currentTarget.appendChild(trail);
    trailsRef.current.add(trail);

    setTimeout(() => {
      trail.remove();
      trailsRef.current.delete(trail);
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      trailsRef.current.forEach(t => t.remove());
      trailsRef.current.clear();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onMouseMove={handleMouseMove}
    />
  );
}

interface VerificationResult {
  type: 'genuine' | 'suspicious' | 'fake';
  confidence: number;
  mismatchedFields?: string[];
  checks?: Array<{
    name: string;
    passed: boolean;
    severity: 'critical' | 'warning' | 'info';
    message: string;
  }>;
  receiptId?: string;
  documentHash?: string;
  metadata?: Record<string, any>;
  verificationId?: number;
}

export default function COSDashboard() {
  const { user, isLoading: authLoading, isAuthenticated, isAdmin } = useAuth();

  // Users with any form of elevated access bypass the localStorage daily gate
  const hasElevatedAccess =
    isAdmin ||
    user?.cosCheckApproved === true ||
    user?.cosCheckSubscription === true ||
    (user?.verificationLimit !== null && user?.verificationLimit !== undefined);

  const [showFreeCheck, setShowFreeCheck] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track free usage
  const [hasUsedFreeCheck, setHasUsedFreeCheck] = useState(false);

  const [checkingStatus, setCheckingStatus] = useState(false);

  const handleCheckApprovalStatus = async () => {
    setCheckingStatus(true);
    await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    setTimeout(() => setCheckingStatus(false), 1500);
  };

  // Check if user has used their free verification today (skipped for elevated access)
  useEffect(() => {
    if (hasElevatedAccess) {
      setHasUsedFreeCheck(false);
      return;
    }
    const today = new Date().toDateString();
    const lastCheck = localStorage.getItem('lastFreeCheck');
    
    if (lastCheck === today) {
      setHasUsedFreeCheck(true);
    } else {
      setHasUsedFreeCheck(false);
    }
  }, [hasElevatedAccess]);

  const handleFileUpload = async (file: File) => {
    if (hasElevatedAccess) return;
    // Mark free check as used for standard free users only
    const today = new Date().toDateString();
    localStorage.setItem('lastFreeCheck', today);
    setHasUsedFreeCheck(true);
  };

  const handleVerificationResult = (result: VerificationResult) => {
    setVerificationResult(result);
  };

  const handleLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  const handleError = (error: string) => {
    console.error('Verification error:', error);
  };

  // Demo animation handler
  const startDemo = () => {
    setDemoStep(0);
    setIsAnimating(true);
    
    // Step sequence timing
    const steps = [
      { delay: 1000, step: 1 }, // Document upload animation
      { delay: 3000, step: 2 }, // Metadata analysis
      { delay: 5000, step: 3 }, // AI/ML verification
      { delay: 7000, step: 4 }, // Result presentation
      { delay: 9000, step: 5 }, // Detailed analysis option
      { delay: 11000, step: 0 } // Reset to allow replay
    ];

    steps.forEach(({ delay, step }) => {
      setTimeout(() => {
        setDemoStep(step);
        if (step === 0) setIsAnimating(false);
      }, delay);
    });
  };

  const resetDemo = () => {
    setDemoStep(0);
    setIsAnimating(false);
  };

  // Auth still resolving — show skeleton to avoid layout flash
  if (authLoading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-80" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // Beta gate — not logged in
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-semibold mb-4">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            Closed Beta
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">CoS Check — Login Required</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            CoS Check is currently in closed beta. Please log in or create an account to request access.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login?redirect=/dashboard" className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              Log In
            </Link>
            <Link href="/login" className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Create Account
            </Link>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-6">
            Already have an account?{' '}
            <a href="mailto:support@checkbyai.net" className="text-blue-600 dark:text-blue-400 hover:underline">Contact us</a> if you need help.
          </p>
        </div>
      </div>
    );
  }

  // Beta gate — logged in but not yet approved for COS Check
  if (!authLoading && isAuthenticated && !hasElevatedAccess) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full text-sm font-semibold mb-4">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            Awaiting Approval
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">CoS Check — Closed Beta</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Your account is on the beta waitlist. An admin will review and approve your access.
          </p>
          <p className="text-gray-500 dark:text-gray-500 text-sm mb-8">
            You'll receive an email at <strong>{user?.email || 'your registered address'}</strong> when you're approved.
          </p>
          <button
            onClick={handleCheckApprovalStatus}
            disabled={checkingStatus || authLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-semibold transition-colors mb-3"
          >
            {checkingStatus || authLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Check approval status
              </>
            )}
          </button>
          <a
            href="mailto:support@checkbyai.net?subject=CoS%20Check%20Beta%20Access%20Request"
            className="inline-flex items-center justify-center px-6 py-3 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            Contact Support to Expedite
          </a>
          <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Want instant access? Upgrade your plan:</p>
            <Link
              href="/cos-pricing"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              View COS Check Plans →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Mobile-Optimized 3D Dashboard Header */}
      <header className="relative bg-gradient-to-r from-blue-600 via-blue-700 to-purple-700 shadow-2xl overflow-hidden">
        {/* Animated Background Dots */}
        <div 
          className="absolute inset-0 opacity-20"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const dots = e.currentTarget.querySelectorAll('.floating-dot');
            dots.forEach((dot, index) => {
              const delay = index * 0.1;
              const dotElement = dot as HTMLElement;
              const distance = Math.sqrt((x - dotElement.offsetLeft) ** 2 + (y - dotElement.offsetTop) ** 2);
              const scale = Math.max(0.5, 1 - distance / 500);
              dotElement.style.transform = `translate(${(x - dotElement.offsetLeft) * 0.02}px, ${(y - dotElement.offsetTop) * 0.02}px) scale(${scale}) rotateZ(${distance * 0.1}deg)`;
              dotElement.style.transitionDelay = `${delay}s`;
            });
          }}
        >
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="floating-dot absolute w-2 h-2 bg-white dark:bg-gray-800 rounded-full animate-pulse transition-transform duration-700 ease-out"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
              }}
            />
          ))}
        </div>

        {/* 3D Geometric Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-4 left-1/4 w-8 h-8 border-2 border-white/20 rotate-45 animate-spin" style={{ animationDuration: '8s' }} />
          <div className="absolute bottom-4 right-1/3 w-6 h-6 bg-white dark:bg-gray-800/10 rounded-full animate-bounce" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 right-1/4 w-10 h-10 border border-white/15 rounded-full animate-ping" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20">
            <div className="flex items-center space-x-2 sm:space-x-4 group">
              <div className="relative">
                <div className="absolute inset-0 bg-white dark:bg-gray-800/20 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500" />
                <div className="relative w-12 h-12 bg-gradient-to-br from-white to-blue-100 rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-all duration-300">
                  <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="transform group-hover:translate-x-2 transition-transform duration-300">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-bold text-white drop-shadow-lg">UK CoS Authenticator</h1>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-amber-900 shadow-sm">Beta</span>
                </div>
                <p className="text-xs sm:text-sm text-blue-100 drop-shadow hidden sm:block">UK Visa Document Verification</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">


              <button 
                onClick={() => setShowFreeCheck(true)}
                className="group relative inline-flex items-center px-3 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg sm:rounded-xl text-white font-semibold shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 hover:scale-105 touch-manipulation"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-500 rounded-lg sm:rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 relative z-10 transform group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="relative z-10 text-sm sm:text-base">
                  <span className="hidden sm:inline">Try Free Check</span>
                  <span className="sm:hidden">Try Free</span>
                </span>
                <div className="absolute inset-0 rounded-lg sm:rounded-xl bg-white dark:bg-gray-800/20 scale-0 group-hover:scale-100 transition-transform duration-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Glow Effect */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      </header>

      {/* Innovative 3D Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-600 via-purple-700 to-indigo-800 text-white text-center py-24 overflow-hidden">
        {/* 3D Floating Elements */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-float opacity-30"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${3 + Math.random() * 4}s`,
              }}
            >
              <div className="w-4 h-4 bg-gradient-to-br from-white/40 to-transparent rounded-full blur-sm" />
            </div>
          ))}
        </div>

        {/* Interactive Cursor Trail — throttled to 20fps max, cleaned up on unmount */}
        <CursorTrail />

        {/* Geometric Background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 w-32 h-32 border border-white/30 rounded-full animate-spin-slow" />
          <div className="absolute bottom-20 right-20 w-24 h-24 border-2 border-white/20 rotate-45 animate-pulse" />
          <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-white dark:bg-gray-800/10 transform rotate-12 animate-bounce" style={{ animationDelay: '1s' }} />
        </div>

        <div className="container mx-auto px-5 relative z-10">
          <div className="transform hover:scale-105 transition-transform duration-500">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 font-sans bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent drop-shadow-2xl">
              UK Certificate of Sponsorship Verification
            </h1>
          </div>
          <p className="text-xl md:text-2xl max-w-4xl mx-auto mb-10 text-blue-100 drop-shadow-lg leading-relaxed">
            Verify your UK CoS document is genuine before applying for your Skilled Worker visa. Free AI-powered verification for British immigration documents.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <button 
              onClick={() => setShowFreeCheck(true)}
              className="group relative inline-block px-10 py-5 bg-gradient-to-r from-green-500 via-emerald-600 to-green-600 text-white rounded-full font-bold text-xl transition-all duration-500 hover:shadow-2xl hover:shadow-green-500/50 transform hover:-translate-y-2 hover:scale-110"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-pulse" />
              <span className="relative z-10 flex items-center">
                <svg className="w-6 h-6 mr-3 transform group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verify UK CoS Now
              </span>
              <div className="absolute inset-0 rounded-full bg-white dark:bg-gray-800/20 scale-0 group-hover:scale-100 transition-transform duration-700" />
            </button>

            <button 
              onClick={startDemo}
              className="group relative inline-block px-10 py-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white rounded-full font-bold text-xl transition-all duration-500 hover:shadow-2xl hover:shadow-purple-500/50 transform hover:-translate-y-2 hover:scale-110"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-pulse" />
              <span className="relative z-10 flex items-center">
                <svg className="w-6 h-6 mr-3 transform group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Watch Demo
              </span>
              <div className="absolute inset-0 rounded-full bg-white dark:bg-gray-800/20 scale-0 group-hover:scale-100 transition-transform duration-700" />
            </button>
          </div>
        </div>
      </section>

      {/* Verification Highlight */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="container mx-auto px-5 text-center">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-12">How Document Verification Works</h2>
          
          <div className="flex flex-wrap justify-center gap-8">
            <div className="w-[300px] bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:transform hover:-translate-y-3 hover:shadow-xl">
              <div className="bg-green-500 text-white text-center py-8">
                <div className="text-5xl mb-5">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold">Genuine Document</h3>
              </div>
              <div className="p-8">
                <p className="text-gray-600 dark:text-gray-300 mb-5">Document matches verified templates with no alterations detected.</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Metadata matches genuine pattern</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">No tampering detected</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Digital signature valid</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Creation date consistent</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="w-[300px] bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:transform hover:-translate-y-3 hover:shadow-xl">
              <div className="bg-yellow-500 text-white text-center py-8">
                <div className="text-5xl mb-5">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold">Edited COS</h3>
              </div>
              <div className="p-8">
                <p className="text-gray-600 dark:text-gray-300 mb-5">Document shows signs of alteration after original creation.</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Metadata inconsistencies</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Modification dates detected</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Content alterations found</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Signature validation failed</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="w-[300px] bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:transform hover:-translate-y-3 hover:shadow-xl">
              <div className="bg-red-500 text-white text-center py-8">
                <div className="text-5xl mb-5">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold">Fake COS</h3>
              </div>
              <div className="p-8">
                <p className="text-gray-600 dark:text-gray-300 mb-5">Document is completely fabricated or doesn't match any genuine patterns.</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">No metadata match found</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Fraudulent creation patterns</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Invalid security features</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-200">Format violations detected</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Free Check Modal */}
      {showFreeCheck && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Free COS Verification</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowFreeCheck(false);
                    setVerificationResult(null);
                  }}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:bg-gray-700"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {!verificationResult ? (
                <div>
                  {(!hasUsedFreeCheck || hasElevatedAccess) ? (
                    <>
                      <div className={`mb-6 p-4 rounded-lg border ${
                        isAdmin
                          ? 'bg-blue-50 border-blue-200'
                          : hasElevatedAccess
                            ? 'bg-green-50 border-green-200'
                            : 'bg-green-50 border-green-200'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isAdmin ? 'bg-blue-600' : 'bg-green-500'}`}>
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div>
                            <h3 className={`font-semibold ${isAdmin ? 'text-blue-800' : 'text-green-800'}`}>
                              {isAdmin
                                ? 'Admin — Unlimited Verification'
                                : hasElevatedAccess
                                  ? 'Approved Access — Your checks are ready'
                                  : 'Free Verification Available'}
                            </h3>
                            <p className={`text-sm ${isAdmin ? 'text-blue-700' : 'text-green-700'}`}>
                              {isAdmin
                                ? 'No usage limits apply to your admin account'
                                : hasElevatedAccess
                                  ? 'Upload your COS document to verify its authenticity'
                                  : 'Upload your document to verify its authenticity instantly'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <FileUploadSimple
                        onFileUpload={handleFileUpload}
                        onVerificationResult={handleVerificationResult}
                        onLoading={handleLoading}
                        onError={handleError}
                        isAdmin={isAdmin}
                        restrictToOneCheck={!hasElevatedAccess}
                      />
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Free Check Used</h3>
                      <p className="text-gray-600 dark:text-gray-300 mb-6">You've already used your free verification for today. Upgrade to Pro for unlimited checks.</p>
                      
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg p-6 mb-6">
                        <h4 className="font-semibold text-blue-900 mb-3">🚀 Upgrade to Pro Service</h4>
                        <ul className="text-left text-blue-800 space-y-2 mb-4">
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Unlimited document verifications
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Advanced metadata analysis
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Batch document processing
                          </li>
                          <li className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Detailed verification reports
                          </li>
                        </ul>
                        <Link href="/cos-pricing" className="w-full block text-center bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                          View COS Check Plans →
                        </Link>
                      </div>
                      
                      <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Your free check will reset tomorrow. Come back then for another free verification!</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Analysis Complete</h3>
                    <button
                      onClick={() => {
                        setShowFreeCheck(false);
                        setVerificationResult(null);
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-lg border border-border hover:bg-muted/50"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* Forensic verdict + checks */}
                  <VerificationResults result={verificationResult} verificationId={verificationResult.verificationId} />

                  {/* Structured metadata panel — admin only */}
                  {isAdmin && verificationResult.metadata && Object.keys(verificationResult.metadata).length > 0 && (
                    <div className="mt-6 border border-border rounded-xl p-5 bg-background">
                      <MetadataGroupsPanel metadata={verificationResult.metadata} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced 3D Demo Modal */}
      <Enhanced3DDemo 
        isVisible={showDemo}
        onClose={() => {
          setShowDemo(false);
          resetDemo();
        }}
        onTryFreeCheck={() => {
          setShowDemo(false);
          setShowFreeCheck(true);
          resetDemo();
        }}
      />

      {/* Did You Know Section - Official Gov.uk Information */}
      <section className="py-16 bg-gradient-to-br from-blue-50 dark:from-blue-900/20 via-indigo-50 dark:via-indigo-900/20 to-purple-50 dark:to-purple-900/20">
        <div className="container mx-auto px-5">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">Did You Know?</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Important facts about UK Certificate of Sponsorship and Skilled Worker visas
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4 border-blue-500">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">CoS is Not a Visa</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">A Certificate of Sponsorship is an electronic record, not a physical document. It contains a unique reference number you need for your visa application.</p>
                  <a href="https://www.gov.uk/uk-visa-sponsorship-employers/certificates-of-sponsorship" target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline mt-2 inline-block">Source: Gov.uk</a>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4 border-purple-500">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">3-Month Validity</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">You must apply for your visa within 3 months of your CoS being assigned. After this period, the CoS expires and cannot be used.</p>
                  <a href="https://www.gov.uk/skilled-worker-visa/your-job" target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline mt-2 inline-block">Source: Gov.uk</a>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4 border-green-500">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Sponsor Register</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">You can check if an employer is a licensed sponsor on the official register of licensed sponsors published by the Home Office.</p>
                  <a href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers" target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline mt-2 inline-block">Source: Gov.uk</a>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4 border-orange-500">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Salary Requirements</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">The minimum salary for most Skilled Worker visa jobs is currently £38,700 per year, or the 'going rate' for your job type, whichever is higher.</p>
                  <a href="https://www.gov.uk/skilled-worker-visa/your-job" target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline mt-2 inline-block">Source: Gov.uk</a>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4 border-red-500">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Fraud Consequences</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">Using deception in a visa application can result in a 10-year re-entry ban to the UK and potential criminal prosecution under the Immigration Act.</p>
                  <a href="https://www.gov.uk/government/publications/general-grounds-for-refusal-considering-deception" target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline mt-2 inline-block">Source: Gov.uk</a>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4 border-indigo-500">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Path to Settlement</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">After 5 years on a Skilled Worker visa, you may be eligible to apply for Indefinite Leave to Remain (settlement) in the UK.</p>
                  <a href="https://www.gov.uk/indefinite-leave-to-remain-tier-2-t2-skilled-worker-visa" target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline mt-2 inline-block">Source: Gov.uk</a>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-8">
            <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
              Information sourced from official UK Government guidance. Always check 
              <a href="https://www.gov.uk/skilled-worker-visa" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">Gov.uk</a> for the latest requirements.
            </p>
          </div>
        </div>
      </section>
      
    </div>
  );
}