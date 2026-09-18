import { useState } from 'react';
import { Link } from 'wouter';
import FileUploadSimple from './FileUploadSimple';
import Enhanced3DDemo from './Enhanced3DDemo';
import VerificationResultsTabbed from './VerificationResultsTabbed';
import MetadataGroupsPanel from './MetadataGroupsPanel';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { VerificationTone } from '@/lib/verificationResultTone';
import { hasPaidCosAccess as userHasPaidCosAccess } from '@shared/cosEntitlement';

// Literal (not template-built) class strings — Tailwind's static scanner needs
// the full class name to appear verbatim in source to include it in the build.
const cardHeaderToneClasses: Record<VerificationTone, string> = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  info: 'bg-info text-info-foreground',
};

interface VerificationResult {
  type: 'genuine' | 'suspicious' | 'fake' | 'inconclusive';
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

  // CoS checks are a paid product. Admins and explicit admin limits remain
  // available for operations, but approval alone must not unlock a free check.
  const hasPaidCosAccess = user ? userHasPaidCosAccess(user) : false;
  const hasAdminOverride =
    isAdmin ||
    user?.verificationLimit === -1 ||
    (typeof user?.verificationLimit === "number" && user.verificationLimit > 0);
  const hasElevatedAccess = hasPaidCosAccess || hasAdminOverride;

  const [showCheck, setShowCheck] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const handleFileUpload = async (_file: File) => {};

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

  // Authentication gate — the paid CoS checker requires an account.
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
            Paid CoS Check
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">CoS Check — Login Required</h1>
          <p className="text-muted-foreground mb-8">
            CoS Check is a paid product. Log in or create an account, then choose a CoS plan to unlock document verification.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Approval usually within 24 hours. We’ll email you as soon as your access is ready.
          </p>
          <Button asChild className="w-full">
            <Link href="/login?redirect=/dashboard">Log In / Sign Up</Link>
          </Button>
          <p className="text-xs text-muted-foreground mt-6">
            Need help?{' '}
            <a href="mailto:support@checkbyai.net" className="text-primary hover:underline">Contact us</a>.
          </p>
        </div>
      </div>
    );
  }

  // Paid-access gate — free accounts cannot run COS Check.
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
            Paid access required
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">CoS Check — Paid access required</h1>
          <p className="text-muted-foreground mb-4">
            CoS Check is a paid product. Choose a plan to unlock document verification and detailed human-review findings when available.
          </p>
          <p className="text-muted-foreground text-sm mb-8">
            Your selected plan will include the verification access needed to run a CoS check.
          </p>
          <Button asChild className="w-full mb-3">
            <Link href="/cos-pricing">View CoS plans</Link>
          </Button>
          {hasCheckedStatus && !checkingStatus && (
            <p role="status" className="text-sm text-muted-foreground mb-3">
              Still pending — we’ll email <strong>{user?.email || 'you'}</strong> as soon as you’re approved. No need to keep checking.
            </p>
          )}
          <a
            href="mailto:support@checkbyai.net?subject=CoS%20Check%20Beta%20Access%20Request"
            className="inline-flex items-center justify-center px-6 py-3 border border-primary/30 text-primary rounded-lg font-semibold hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Contact Support to Expedite
          </a>
          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-sm text-muted-foreground mb-3">Skip the waitlist — a CoS credit pack unlocks instant access:</p>
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
      {/* Single header block: one H1, one primary action. The old layout stacked
          a "UK CoS Authenticator" bar and a second hero with the same CTA twice. */}
      <section className="relative bg-primary text-primary-foreground overflow-hidden">
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
              onClick={() => setShowCheck(true)}
              variant="secondary"
              className="px-3 sm:px-6 py-2 sm:py-3 touch-manipulation"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">Start CoS Check</span>
              <span className="sm:hidden">Start Check</span>
            </Button>
          </div>
        </div>

        {/* Product-specific 3D illustration lives in Enhanced3DDemo, invoked below */}
        <div className="container mx-auto px-5 relative z-10 text-center pb-16 sm:pb-20 pt-4 sm:pt-6">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 font-sans drop-shadow-sm">
            Is your Certificate of Sponsorship genuine?
          </h1>
          <p className="text-lg md:text-xl max-w-3xl mx-auto mb-10 text-primary-foreground/85 leading-relaxed">
            Verify your UK CoS document before applying for your Skilled Worker visa with paid AI analysis and detailed human-review findings when available.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              onClick={() => setShowCheck(true)}
              size="lg"
              variant="secondary"
              className="rounded-full px-10 py-6 text-lg font-bold"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Verify UK CoS Now
            </Button>

            <button
              onClick={startDemo}
              className="text-primary-foreground/80 hover:text-primary-foreground text-sm font-semibold underline underline-offset-4 px-4 py-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
              See how it works (60s demo) →
            </button>
          </div>
        </div>
      </section>

      {/* Verification Highlight */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-5 text-center">
          <h2 className="text-4xl font-bold text-foreground mb-12">How Document Verification Works</h2>

          <div className="flex flex-wrap justify-center gap-8">
            {[
              {
                tone: 'success' as const,
                iconPath: 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
                title: 'Genuine Document',
                description: 'Document matches verified templates with no alterations detected.',
                items: [
                  'Metadata matches genuine pattern',
                  'No tampering detected',
                  'Digital signature valid',
                  'Creation date consistent',
                ],
              },
              {
                tone: 'warning' as const,
                iconPath: 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
                title: 'Edited COS',
                description: 'Document shows signs of alteration after original creation.',
                items: [
                  'Metadata inconsistencies',
                  'Modification dates detected',
                  'Content alterations found',
                  'Signature validation failed',
                ],
              },
              {
                tone: 'destructive' as const,
                iconPath: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
                title: 'Fake COS',
                description: "Document is completely fabricated or doesn't match any genuine patterns.",
                items: [
                  'No metadata match found',
                  'Fraudulent creation patterns',
                  'Invalid security features',
                  'Format violations detected',
                ],
              },
            ].map((card) => (
              <div key={card.title} className="w-[300px] theme-card overflow-hidden">
                <div className={`${cardHeaderToneClasses[card.tone]} text-center py-8 rounded-t-[calc(var(--radius)-1px)]`}>
                  <div className="text-5xl mb-5">
                    <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d={card.iconPath} clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-semibold">{card.title}</h3>
                </div>
                <div className="p-8">
                  <p className="text-muted-foreground mb-5">{card.description}</p>
                  <ul className="space-y-2">
                    {card.items.map((text) => (
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
            ))}
          </div>
        </div>
      </section>

      {/* Paid CoS Check Modal */}
      {showCheck && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card p-6 border-b border-border flex justify-between items-center">
              <h2 className="text-2xl font-bold text-foreground">CoS Verification</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowCheck(false);
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
                            {isAdmin ? 'Admin — Unlimited Verification' : 'Paid CoS Verification'}
                          </h3>
                          <p className={`text-sm ${isAdmin ? 'text-info' : 'text-success'}`}>
                            {isAdmin ? 'No usage limits apply to your admin account' : 'Upload your CoS document to verify its authenticity'}
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
                </div>
              ) : (
                <div>
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-semibold text-foreground">Analysis Complete</h3>
                    <button
                      onClick={() => {
                        setShowCheck(false);
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
                    canViewHumanReviewDetails={isAdmin || hasPaidCosAccess}
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
          setShowCheck(true);
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
