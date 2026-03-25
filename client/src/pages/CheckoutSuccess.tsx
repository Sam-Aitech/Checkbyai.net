import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, Loader2, PartyPopper, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import PageLayout from '@/components/PageLayout';
import SEOHead from '@/components/SEOHead';

interface VerifyResult {
  success: boolean;
  packageType?: string;
  credits?: number;
  subscriptionStatus?: string;
  status?: string;
  companyName?: string;
}

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

export default function CheckoutSuccess() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionId = new URLSearchParams(search).get('session_id');

  useEffect(() => {
    async function verifySession() {
      if (!sessionId) {
        setError('No session ID found');
        setIsVerifying(false);
        return;
      }

      try {
        const response = await apiRequest('GET', `/api/checkout/verify/${sessionId}`);
        const data = await response.json();
        setVerifyResult(data);
        
        if (data.success) {
          queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
          queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        }
      } catch (err: any) {
        setError(err.message || 'Failed to verify checkout');
      } finally {
        setIsVerifying(false);
      }
    }

    verifySession();
  }, [sessionId, queryClient]);

  const isNotificationPlan = verifyResult?.packageType === 'notification_starter' || verifyResult?.packageType === 'notification_pro';

  const sponsorDashboardUrl = '/pro-dashboard';

  // Auto-redirect notification plan purchases to sponsor dashboard after 2s
  useEffect(() => {
    if (!isVerifying && verifyResult?.success && isNotificationPlan) {
      const timer = setTimeout(() => setLocation(sponsorDashboardUrl), 2000);
      return () => clearTimeout(timer);
    }
  }, [isVerifying, verifyResult?.success, isNotificationPlan, sponsorDashboardUrl, setLocation]);

  const getPackageLabel = (type?: string) => {
    switch (type) {
      case 'starter': return 'Starter Package (50 credits)';
      case 'pro': return 'Pro Package (100 credits)';
      case 'unlimited': return 'Unlimited Monthly Subscription';
      case 'master': return 'Master Package - Expert Review';
      case 'notification_starter': return 'Notification Engine - Starter';
      case 'notification_pro': return 'Notification Engine - Pro (5 CoS checks/month)';
      default: return 'Package';
    }
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
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
        >
          <div className="text-center">
            {isVerifying ? (
              <>
                <div className="bg-primary/10 rounded-xl w-14 h-14 flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
                <h1 className="editorial-subheading text-foreground text-2xl">Verifying Payment...</h1>
                <p className="text-muted-foreground text-sm mt-2">Please wait while we confirm your purchase</p>
              </>
            ) : error ? (
              <>
                <div className="bg-primary/10 rounded-xl w-14 h-14 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl text-destructive">!</span>
                </div>
                <h1 className="editorial-subheading text-destructive text-2xl">Error</h1>
                <p className="text-muted-foreground text-sm mt-2">{error}</p>
              </>
            ) : verifyResult?.success ? (
              <>
                <div className="bg-primary/10 rounded-xl w-14 h-14 flex items-center justify-center mx-auto mb-4">
                  <PartyPopper className="w-8 h-8 text-emerald-500" />
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
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
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
                
                {verifyResult.credits !== undefined && verifyResult.packageType !== 'unlimited' && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Credits:</span>
                    <span className="text-primary font-semibold flex items-center gap-1">
                      <CreditCard className="w-4 h-4" />
                      {verifyResult.credits}
                    </span>
                  </div>
                )}

                {verifyResult.subscriptionStatus && ['starter', 'pro', 'unlimited', 'enterprise'].includes(verifyResult.subscriptionStatus) && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                      <Check className="w-4 h-4" />
                      {verifyResult.subscriptionStatus === 'unlimited' || verifyResult.subscriptionStatus === 'enterprise' ? 'Unlimited Access Active' : `${verifyResult.subscriptionStatus.charAt(0).toUpperCase() + verifyResult.subscriptionStatus.slice(1)} Plan Active`}
                    </span>
                  </div>
                )}
              </div>

              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full"
                size="lg"
                onClick={() => setLocation(isNotificationPlan ? sponsorDashboardUrl : '/')}
              >
                {isNotificationPlan ? 'Go to Dashboard' : 'Start Verifying Documents'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {!isVerifying && (error || !verifyResult?.success) && (
            <div className="mt-6">
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
