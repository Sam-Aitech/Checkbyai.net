import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import FileUploadSimple from './FileUploadSimple';
import Enhanced3DDemo from './Enhanced3DDemo';
import VerificationResultsTabbed from './VerificationResultsTabbed';
import MetadataGroupsPanel from './MetadataGroupsPanel';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';

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
  cosCheck?: import('../../../shared/mis-types').COSCheckResult | null;
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
    setShowDemo(true);
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
  if (!isAuthenticated) {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-semibold mb-4">
            <span className="w-2 h-2 bg-primary rounded-full" />
            Closed Beta
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">CoS Check — Login Required</h1>
          <p className="text-muted-foreground mb-8">
            CoS Check is currently in closed beta. Please log in or create an account to request access.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild>
              <Link href="/login?redirect=/dashboard">Log In</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Create Account</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            Already have an account?{' '}
            <a href="mailto:support@checkbyai.net" className="text-primary hover:underline">Contact us</a> if you need help.
          </p>
        </div>
      </div>
    );
  }

  // Beta gate — logged in but not yet approved for COS Check
  if (!hasElevatedAccess) {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="inline-flex items-center gap-2 bg-warning/10 text-warning px-3 py-1 rounded-full text-sm font-semibold mb-4">
            <span className="w-2 h-2 bg-warning rounded-full" />
            Awaiting Approval
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">CoS Check — Closed Beta</h1>
          <p className="text-muted-foreground mb-4">
            Your account is on the beta waitlist. An admin will review and approve your access.
          </p>
          <p className="text-muted-foreground text-sm mb-8">
            You'll receive an email at <strong>{user?.email || 'your registered address'}</strong> when you're approved.
          </p>
          <Button
            onClick={handleCheckApprovalStatus}
            disabled={checkingStatus}
            className="w-full mb-3"
          >
            {checkingStatus ? (
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
          </Button>
          <a
            href="mailto:support@checkbyai.net?subject=CoS%20Check%20Beta%20Access%20Request"
            className="inline-flex items-center justify-center px-6 py-3 border border-primary/30 text-primary rounded-lg font-semibold hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Contact Support to Expedite
          </a>
          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-sm text-muted-foreground mb-3">Want instant access? Upgrade your plan:</p>
            <Button asChild className="w-full">
              <Link href="/cos-pricing">View COS Check Plans →</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      {/* Dashboard Header */}
      <header className="relative bg-primary shadow-md overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="w-12 h-12 bg-primary-foreground/15 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-bold text-primary-foreground">UK CoS Authenticator</h1>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-warning text-warning-foreground">Beta</span>
                </div>
                <p className="text-xs sm:text-sm text-primary-foreground/80 hidden sm:block">UK Visa Document Verification</p>
              </div>
            </div>

            <Button
              onClick={() => setShowFreeCheck(true)}
              variant="secondary"
              className="px-3 sm:px-6 py-2 sm:py-3 touch-manipulation"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">Try Free Check</span>
              <span className="sm:hidden">Try Free</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-primary text-primary-foreground text-center py-20 sm:py-24 overflow-hidden">
        {/* Product-specific 3D illustration lives in Enhanced3DDemo, invoked below */}
        <div className="container mx-auto px-5 relative z-10">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 font-sans drop-shadow-sm">
            UK Certificate of Sponsorship Verification
          </h1>
          <p className="text-lg md:text-xl max-w-3xl mx-auto mb-10 text-primary-foreground/85 leading-relaxed">
            Verify your UK CoS document is genuine before applying for your Skilled Worker visa. Free AI-powered verification for British immigration documents.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              onClick={() => setShowFreeCheck(true)}
              size="lg"
              variant="secondary"
              className="rounded-full px-10 py-6 text-lg font-bold"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Verify UK CoS Now
            </Button>

            <Button
              onClick={startDemo}
              size="lg"
              variant="outline"
              className="rounded-full px-10 py-6 text-lg font-bold bg-transparent border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Verification Highlight */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-5 text-center">
          <h2 className="text-4xl font-bold text-foreground mb-12">How Document Verification Works</h2>

          <div className="flex flex-wrap justify-center gap-8">
            <div className="w-[300px] theme-card overflow-hidden">
              <div className="bg-success text-success-foreground text-center py-8 rounded-t-[calc(var(--radius)-1px)]">
                <div className="text-5xl mb-5">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold">Genuine Document</h3>
              </div>
              <div className="p-8">
                <p className="text-muted-foreground mb-5">Document matches verified templates with no alterations detected.</p>
                <ul className="space-y-2">
                  {[
                    'Metadata matches genuine pattern',
                    'No tampering detected',
                    'Digital signature valid',
                    'Creation date consistent',
                  ].map((text) => (
                    <li key={text} className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-foreground">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="w-[300px] theme-card overflow-hidden">
              <div className="bg-warning text-warning-foreground text-center py-8 rounded-t-[calc(var(--radius)-1px)]">
                <div className="text-5xl mb-5">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold">Edited COS</h3>
              </div>
              <div className="p-8">
                <p className="text-muted-foreground mb-5">Document shows signs of alteration after original creation.</p>
                <ul className="space-y-2">
                  {[
                    'Metadata inconsistencies',
                    'Modification dates detected',
                    'Content alterations found',
                    'Signature validation failed',
                  ].map((text) => (
                    <li key={text} className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-foreground">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="w-[300px] theme-card overflow-hidden">
              <div className="bg-destructive text-destructive-foreground text-center py-8 rounded-t-[calc(var(--radius)-1px)]">
                <div className="text-5xl mb-5">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold">Fake COS</h3>
              </div>
              <div className="p-8">
                <p className="text-muted-foreground mb-5">Document is completely fabricated or doesn't match any genuine patterns.</p>
                <ul className="space-y-2">
                  {[
                    'No metadata match found',
                    'Fraudulent creation patterns',
                    'Invalid security features',
                    'Format violations detected',
                  ].map((text) => (
                    <li key={text} className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-foreground">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Free Check Modal */}
      {showFreeCheck && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card p-6 border-b border-border flex justify-between items-center">
              <h2 className="text-2xl font-bold text-foreground">Free COS Verification</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowFreeCheck(false);
                    setVerificationResult(null);
                  }}
                  className="text-muted-foreground hover:text-foreground text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Close"
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
                      <div className={`mb-6 p-4 rounded-lg border ${isAdmin ? 'bg-info/10 border-info/20' : 'bg-success/10 border-success/20'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isAdmin ? 'bg-info' : 'bg-success'}`}>
                            <svg className="w-5 h-5 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div>
                            <h3 className={`font-semibold ${isAdmin ? 'text-info' : 'text-success'}`}>
                              {isAdmin
                                ? 'Admin — Unlimited Verification'
                                : hasElevatedAccess
                                  ? 'Approved Access — Your checks are ready'
                                  : 'Free Verification Available'}
                            </h3>
                            <p className={`text-sm ${isAdmin ? 'text-info' : 'text-success'}`}>
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
                      <div className="w-16 h-16 mx-auto mb-4 bg-warning/10 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-warning" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-2">Free Check Used</h3>
                      <p className="text-muted-foreground mb-6">You've already used your free verification for today. Upgrade to Pro for unlimited checks.</p>

                      <div className="bg-info/10 border border-info/20 rounded-lg p-6 mb-6">
                        <h4 className="font-semibold text-info mb-3">Upgrade to Pro Service</h4>
                        <ul className="text-left text-info space-y-2 mb-4">
                          {[
                            'Unlimited document verifications',
                            'Advanced metadata analysis',
                            'Batch document processing',
                            'Detailed verification reports',
                          ].map((text) => (
                            <li key={text} className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-info flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              {text}
                            </li>
                          ))}
                        </ul>
                        <Button asChild className="w-full">
                          <Link href="/cos-pricing">View COS Check Plans →</Link>
                        </Button>
                      </div>

                      <p className="text-sm text-muted-foreground">Your free check will reset tomorrow. Come back then for another free verification!</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-semibold text-foreground">Analysis Complete</h3>
                    <button
                      onClick={() => {
                        setShowFreeCheck(false);
                        setVerificationResult(null);
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-lg border border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* Forensic verdict + checks + metadata inspector */}
                  <VerificationResultsTabbed
                    result={verificationResult}
                    verificationId={verificationResult.verificationId}
                    isAdmin={isAdmin}
                  />

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
      <section className="py-16 bg-muted/40">
        <div className="container mx-auto px-5">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Did You Know?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Important facts about UK Certificate of Sponsorship and Skilled Worker visas
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
                title: 'CoS is Not a Visa',
                body: 'A Certificate of Sponsorship is an electronic record, not a physical document. It contains a unique reference number you need for your visa application.',
                href: 'https://www.gov.uk/uk-visa-sponsorship-employers/certificates-of-sponsorship',
              },
              {
                icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
                title: '3-Month Validity',
                body: 'You must apply for your visa within 3 months of your CoS being assigned. After this period, the CoS expires and cannot be used.',
                href: 'https://www.gov.uk/skilled-worker-visa/your-job',
              },
              {
                icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
                title: 'Sponsor Register',
                body: 'You can check if an employer is a licensed sponsor on the official register of licensed sponsors published by the Home Office.',
                href: 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
              },
              {
                icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                title: 'Salary Requirements',
                body: "The minimum salary for most Skilled Worker visa jobs is currently £38,700 per year, or the 'going rate' for your job type, whichever is higher.",
                href: 'https://www.gov.uk/skilled-worker-visa/your-job',
              },
              {
                icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
                title: 'Fraud Consequences',
                body: 'Using deception in a visa application can result in a 10-year re-entry ban to the UK and potential criminal prosecution under the Immigration Act.',
                href: 'https://www.gov.uk/government/publications/general-grounds-for-refusal-considering-deception',
              },
              {
                icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
                title: 'Path to Settlement',
                body: 'After 5 years on a Skilled Worker visa, you may be eligible to apply for Indefinite Leave to Remain (settlement) in the UK.',
                href: 'https://www.gov.uk/indefinite-leave-to-remain-tier-2-t2-skilled-worker-visa',
              },
            ].map((fact) => (
              <div key={fact.title} className="theme-card p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={fact.icon} />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">{fact.title}</h3>
                    <p className="text-muted-foreground text-sm">{fact.body}</p>
                    <a href={fact.href} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline mt-2 inline-block">Source: Gov.uk</a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              Information sourced from official UK Government guidance. Always check
              <a href="https://www.gov.uk/skilled-worker-visa" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">Gov.uk</a> for the latest requirements.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
