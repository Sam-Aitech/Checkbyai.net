import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, Loader2, PartyPopper, ArrowRight, Bell } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { unwrapApiEnvelope } from '@/lib/apiEnvelope';
import { isPaidTier, isUnlimitedWatchTier, ALERT_TIMING_SHORT } from '@shared/planTiers';
import PageLayout from '@/components/PageLayout';
import SEOHead from '@/components/SEOHead';

interface VerifyResult {
  success: boolean;
  packageType?: string;
  credits?: number;
  subscriptionStatus?: string;
  status?: string;
  companyName?: string;
  amountTotal?: number | null;
  currency?: string | null;
  customerEmail?: string | null;
  sessionId?: string;
  watchCreated?: boolean;
  watchReason?: string;
}

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

function watchFailureReasonCopy(reason?: string): string {
  switch (reason) {
    case 'not-found':
      return 'Not found on the sponsor register under that exact name. ';
    case 'limit-reached':
      return 'Your plan watch limit is already reached. ';
    default:
      return 'Automatic setup was skipped. ';
  }
}

export default function CheckoutSuccess() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [verifyAttempt, setVerifyAttempt] = useState(0);
  const [isRetryingWatch, setIsRetryingWatch] = useState(false);
  const [watchRetryError, setWatchRetryError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  // Stripe webhooks can lag behind the redirect by 10–20s. Polling only 3×
  // (~9s) showed paying users a false "unpaid" error — poll up to ~30s and
  // surface the attempt count so the wait feels bounded, not broken.
  const MAX_VERIFY_ATTEMPTS = 10;

  const sessionId = new URLSearchParams(search).get('session_id');

  const formatAmount = (total?: number | null, currency?: string | null) => {
    if (total == null) return null;
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency || 'gbp').toUpperCase() }).format(total / 100);
    } catch {
      return `£${(total / 100).toFixed(2)}`;
    }
  };

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    async function verifySession(attempt = 0) {
      if (!sessionId) {
        setError('No session ID found. If you came from Stripe, use the link in your email or return to Pricing.');
        setIsVerifying(false);
        return;
      }
      setVerifyAttempt(attempt + 1);

      try {
        const response = await apiRequest('GET', `/api/checkout/verify/${sessionId}`);
        const envelope = await response.json();
        const data = unwrapApiEnvelope<VerifyResult>(envelope);
        if (cancelled) return;
        // Stripe webhook lag: unpaid-yet → keep polling up to MAX_VERIFY_ATTEMPTS
        // before concluding the payment failed.
        if (!data.success && attempt + 1 < MAX_VERIFY_ATTEMPTS) {
          pollTimer = setTimeout(() => verifySession(attempt + 1), 3000);
          return;
        }
        setVerifyResult(data);
        
        if (data.success) {
          queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
          queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        } else if (!data.success) {
          setError(`Payment status: ${(data as VerifyResult).status || 'unpaid'}. If you were charged, wait a minute then Try again.`);
        }
      } catch (err: any) {
        if (cancelled) return;
        if (attempt + 1 < MAX_VERIFY_ATTEMPTS) {
          pollTimer = setTimeout(() => verifySession(attempt + 1), 3000);
          return;
        }
        setError(err.message || 'Failed to verify checkout');
      } finally {
        if (cancelled) return;
        if (!pollTimer) setIsVerifying(false);
        else setIsVerifying(true);
      }
    }

    setIsVerifying(true);
    setError(null);
    verifySession(retryCount);
    return () => { cancelled = true; if (pollTimer) clearTimeout(pollTimer); };
  }, [sessionId, queryClient, retryCount]);

  // ALERT-PASS FAMILY: `alert_annual`/`alert_annual_pro` (annual) and the
  // legacy `notification_starter`/`notification_pro` (monthly) SKUs. This
  // grouping is kept ONLY for behavior that is genuinely shared across the
  // whole family regardless of exact SKU — the company-watch confirmation
  // card and the "go to dashboard" CTA routing/label below. Receipt COPY
  // (what exactly they get) is branched per exact `packageType` instead, see
  // `getAlertPassReceiptDetails`.
  const ALERT_PASS_PACKAGE_TYPES = ['notification_starter', 'notification_pro', 'alert_annual', 'alert_annual_pro'];
  const isAlertPassFamily = ALERT_PASS_PACKAGE_TYPES.includes(verifyResult?.packageType ?? '');

  const sponsorDashboardUrl = '/pro-dashboard';

  const getPackageLabel = (type?: string) => {
    switch (type) {
      case 'starter': return 'Starter Package (50 credits)';
      case 'pro': return 'Pro Package (100 credits)';
      case 'unlimited': return 'Unlimited CoS Access';
      case 'master': return 'Master Package - Expert Review';
      case 'notification_starter': return 'Notification Engine - Starter';
      case 'notification_pro': return 'Notification Engine - Pro (5 CoS checks/month)';
      case 'alert_annual': return 'Alert Pass - Annual (1 company)';
      case 'alert_annual_pro': return 'Alert Pass - Pro Annual (5 companies)';
      case 'cos_check_single': return 'CoS Check (1 verification)';
      default: return 'Package';
    }
  };

  // Exact packageType branching for Alert-Pass receipt copy — replaces the
  // old binary isNotificationPlan-driven text so each SKU confirms what it
  // actually grants. Alert timing always comes from ALERT_TIMING_SHORT
  // (shared/planTiers.ts), never a hardcoded "immediate"/"instant" string —
  // alert_annual/notification_starter grant the 'starter' tier and
  // alert_annual_pro/notification_pro grant the 'pro' tier (see
  // applyPackageGrant in server/routes/billing.ts).
  const getAlertPassReceiptDetails = (type?: string): string | null => {
    switch (type) {
      case 'alert_annual':
        return `1 company monitored • ${ALERT_TIMING_SHORT.starter}`;
      case 'alert_annual_pro':
        return `5 companies monitored • Sponsored job alerts • ${ALERT_TIMING_SHORT.pro}`;
      case 'notification_starter':
        return `2 companies monitored • ${ALERT_TIMING_SHORT.starter}`;
      case 'notification_pro':
        return `5 companies monitored • 5 CoS checks/month • ${ALERT_TIMING_SHORT.pro}`;
      default:
        return null;
    }
  };

  // One-click recovery when the server couldn't auto-create the watch at
  // purchase time (unknown name, limit reached, transient failure). Retries the
  // same POST the monitor page uses, instead of dumping the user on a search
  // page to redo the flow manually.
  const retryWatch = async () => {
    const company = verifyResult?.companyName;
    if (!company) return;
    setIsRetryingWatch(true);
    setWatchRetryError(null);
    try {
      const res = await apiRequest('POST', '/api/watches', { organisation_name: company });
      await res.json().catch(() => ({}));
      setVerifyResult((prev) => (prev ? { ...prev, watchCreated: true } : prev));
      queryClient.invalidateQueries({ queryKey: ['/api/watches'] });
    } catch (err: any) {
      setWatchRetryError(err.message || 'Could not create the watch. Try adding it from your dashboard.');
    } finally {
      setIsRetryingWatch(false);
    }
  };
  const getNextStepCta = (): { label: string; href: string; secondary?: { label: string; href: string } } => {
    const t = verifyResult?.packageType;
    if (t === 'unlimited') return { label: 'Start Verifying Documents', href: '/dashboard?fresh=1', secondary: { label: 'Go to Sponsor Dashboard', href: sponsorDashboardUrl } };
    if (t === 'starter' || t === 'pro' || t === 'cos_check_single') return { label: 'Start Verifying Documents', href: '/dashboard?fresh=1' };
    if (t === 'notification_starter' || t === 'notification_pro' || t === 'alert_annual' || t === 'alert_annual_pro') {
      const company = verifyResult?.companyName ? `?company=${encodeURIComponent(verifyResult.companyName)}` : '';
      return { label: 'Go to Dashboard', href: `${sponsorDashboardUrl}${company}` };
    }
    return { label: 'Start Verifying Documents', href: '/' };
  };

  return (
    <PageLayout>
      <SEOHead
        title="Payment Successful | Check By AI"
        description="Your payment has been processed successfully. Your verification credits are now available."
        canonicalUrl="https://checkbyai.net/checkout/success"
      />
      <div className="bg-background flex items-center justify-center p-4 min-h-screen">
        <motion.div
          className="w-full max-w-md border border-border rounded-xl bg-card p-6"
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : spring}
        >
          <div className="text-center" role="status" aria-live="polite" aria-atomic="true">
            {isVerifying ? (
              <>
                <div className="bg-primary/10 rounded-xl w-14 h-14 flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" aria-hidden="true" />
                </div>
                <h1 className="editorial-subheading text-foreground text-2xl">Verifying Payment…</h1>
                <p className="text-muted-foreground text-sm mt-2" role="status">
                  Confirming with Stripe{verifyAttempt > 0 ? ` (check ${verifyAttempt} of ${MAX_VERIFY_ATTEMPTS})` : ''} — this can take up to 30 seconds. Please don’t close this page.
                </p>
                <div className="mt-4 h-1.5 bg-muted rounded-full overflow-hidden" aria-hidden="true">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (verifyAttempt / MAX_VERIFY_ATTEMPTS) * 100)}%` }}
                  />
                </div>
              </>
            ) : error ? (
              <>
                <div className="bg-primary/10 rounded-xl w-14 h-14 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl text-destructive" aria-hidden="true">!</span>
                </div>
                <h1 className="editorial-subheading text-destructive text-2xl">Error</h1>
                <p className="text-muted-foreground text-sm mt-2">{error}</p>
              </>
            ) : verifyResult?.success ? (
              <>
                <div className="bg-primary/10 rounded-xl w-14 h-14 flex items-center justify-center mx-auto mb-4">
                  <PartyPopper className="w-8 h-8 text-emerald-500" aria-hidden="true" />
                </div>
                <h1 className="editorial-subheading text-emerald-600 dark:text-emerald-400 text-2xl">
                  Payment Successful!
                </h1>
                <p className="text-muted-foreground text-sm mt-2">
                  Thank you for your purchase
                </p>
              </>
            ) : (
              <>
                <div className="bg-primary/10 rounded-xl w-14 h-14 flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" aria-hidden="true" />
                </div>
                <h1 className="editorial-subheading text-foreground text-2xl">Payment Processing</h1>
                <p className="text-muted-foreground text-sm mt-2">Your payment is being processed</p>
              </>
            )}
          </div>

          {!isVerifying && verifyResult?.success && (
            <div className="space-y-6 mt-6">
              <div className="bg-muted/50 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Package:</span>
                  <span className="text-foreground font-semibold">
                    {getPackageLabel(verifyResult.packageType)}
                  </span>
                </div>

                {formatAmount(verifyResult.amountTotal, verifyResult.currency) && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Paid:</span>
                    <span className="text-foreground font-semibold">
                      {formatAmount(verifyResult.amountTotal, verifyResult.currency)}
                    </span>
                  </div>
                )}

                {verifyResult.customerEmail && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Receipt sent to:</span>
                    <span className="text-foreground font-medium text-sm break-all text-right">{verifyResult.customerEmail}</span>
                  </div>
                )}

                {verifyResult.sessionId && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Order ref:</span>
                    <span className="text-xs font-mono text-muted-foreground text-right break-all" title={verifyResult.sessionId}>
                      {verifyResult.sessionId.slice(0, 24)}…
                    </span>
                  </div>
                )}
                
                {verifyResult.credits !== undefined && verifyResult.packageType !== 'unlimited' && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Credits:</span>
                    <span className="text-primary font-semibold flex items-center gap-1">
                      <CreditCard className="w-4 h-4" aria-hidden="true" />
                      {verifyResult.credits}
                    </span>
                  </div>
                )}

                {verifyResult.subscriptionStatus && isPaidTier(verifyResult.subscriptionStatus) && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                      <Check className="w-4 h-4" aria-hidden="true" />
                      {isUnlimitedWatchTier(verifyResult.subscriptionStatus) ? 'Unlimited Access Active' : `${verifyResult.subscriptionStatus.charAt(0).toUpperCase() + verifyResult.subscriptionStatus.slice(1)} Plan Active`}
                    </span>
                  </div>
                )}

                {isAlertPassFamily && getAlertPassReceiptDetails(verifyResult.packageType) && (
                  <div className="pt-1 border-t border-border/60">
                    <p className="text-xs text-muted-foreground">
                      {getAlertPassReceiptDetails(verifyResult.packageType)}
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Stripe invoice by email. Manage billing or cancel in Account → Manage Billing (Stripe portal).
                </p>
              </div>

              {verifyResult.companyName && isAlertPassFamily && verifyResult.watchCreated !== false && (
                <div
                  className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-start gap-3"
                  data-testid="checkout-success-company-watch"
                >
                  <Bell className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-left">
                    <p className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm">
                      Now monitoring <span className="font-bold">{verifyResult.companyName}</span>
                    </p>
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">
                      {verifyResult.subscriptionStatus && verifyResult.subscriptionStatus in ALERT_TIMING_SHORT
                        ? `We'll include any changes to their sponsor licence in your next scheduled alert: ${ALERT_TIMING_SHORT[verifyResult.subscriptionStatus as keyof typeof ALERT_TIMING_SHORT].toLowerCase()}.`
                        : "We'll include any changes to their sponsor licence in your next scheduled alert digest."}
                    </p>
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">
                      Next: confirm channels in Alerts (WhatsApp/SMS need verification) and manage your watch in Dashboard.
                    </p>
                  </div>
                </div>
              )}

              {verifyResult.companyName && isAlertPassFamily && verifyResult.watchCreated === false && (
                <div
                  className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3"
                  role="alert"
                  data-testid="checkout-success-watch-warning"
                >
                  <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-left flex-1">
                    <p className="font-semibold text-amber-700 dark:text-amber-300 text-sm">
                      Payment ok — we couldn’t auto-watch “{verifyResult.companyName}”
                    </p>
                    <p className="text-xs text-amber-600/90 dark:text-amber-400/90 mt-1">
                      {watchFailureReasonCopy(verifyResult.watchReason)}
                      Your plan is active; only the watch setup was skipped.
                    </p>
                    {watchRetryError && (
                      <p className="text-xs text-destructive mt-1" role="alert">{watchRetryError}</p>
                    )}
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={isRetryingWatch}
                        onClick={retryWatch}
                      >
                        {isRetryingWatch ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />Setting up watch…</>
                        ) : (
                          "Set up my watch now"
                        )}
                      </Button>
                      <button onClick={() => setLocation(`/sponsor-monitor?company=${encodeURIComponent(verifyResult.companyName || '')}`)} className="text-xs underline font-semibold text-amber-700 dark:text-amber-300 self-center">Add manually instead</button>
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                const cta = getNextStepCta();
                return (
                  <div className="space-y-2">
                    <Button
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full"
                      size="lg"
                      onClick={() => setLocation(cta.href)}
                    >
                      {cta.label}
                      <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
                    </Button>
                    {cta.secondary && (
                      <Button
                        className="w-full rounded-full"
                        size="lg"
                        variant="outline"
                        onClick={() => setLocation(cta.secondary!.href)}
                      >
                        {cta.secondary.label}
                      </Button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {!isVerifying && (error || !verifyResult?.success) && (
            <div className="mt-6 space-y-2">
              <div className="flex gap-2">
                <Button
                  className="flex-1 rounded-xl"
                  variant="outline"
                  onClick={() => { setError(null); setVerifyResult(null); setVerifyAttempt(0); setIsVerifying(true); setRetryCount(c => c + 1); }}
                >
                  Try again
                </Button>
                <Button
                  className="flex-1 rounded-xl"
                  variant="outline"
                  onClick={() => {
                    const subject = encodeURIComponent(`Checkout issue ${sessionId || ''}`);
                    const body = encodeURIComponent(`Session: ${sessionId || '(missing)'}\nError: ${error || 'payment not confirmed'}\n`);
                    window.location.href = `mailto:support@checkbyai.net?subject=${subject}&body=${body}`;
                  }}
                >
                  Contact support
                </Button>
              </div>
              {sessionId && (
                <p className="text-xs text-muted-foreground text-center break-all">
                  Order reference: <span className="font-mono">{sessionId.slice(0, 32)}…</span> — include it when contacting support.
                </p>
              )}
              <Button
                className="w-full border border-border text-foreground hover:bg-muted rounded-xl"
                variant="outline"
                onClick={() => setLocation('/pricing')}
              >
                Back to Pricing
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </PageLayout>
  );
}
