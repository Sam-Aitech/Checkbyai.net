import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, Loader2, PartyPopper, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';
import PageLayout from '@/components/PageLayout';
import SEOHead from '@/components/SEOHead';

interface VerifyResult {
  success: boolean;
  packageType?: string;
  credits?: number;
  subscriptionStatus?: string;
  status?: string;
}

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

  const getPackageLabel = (type?: string) => {
    switch (type) {
      case 'starter': return 'Starter Package (50 credits)';
      case 'pro': return 'Pro Package (100 credits)';
      case 'unlimited': return 'Unlimited Monthly Subscription';
      case 'master': return 'Master Package - Expert Review';
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
      <div className="bg-gradient-to-br from-green-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {isVerifying ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                </div>
                <CardTitle className="text-2xl">Verifying Payment...</CardTitle>
                <CardDescription>Please wait while we confirm your purchase</CardDescription>
              </>
            ) : error ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                  <span className="text-3xl">!</span>
                </div>
                <CardTitle className="text-2xl text-red-600">Error</CardTitle>
                <CardDescription>{error}</CardDescription>
              </>
            ) : verifyResult?.success ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                  <PartyPopper className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-2xl text-green-600 dark:text-green-400">
                  Payment Successful!
                </CardTitle>
                <CardDescription>
                  Thank you for your purchase
                </CardDescription>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                </div>
                <CardTitle className="text-2xl">Payment Processing</CardTitle>
                <CardDescription>Your payment is being processed</CardDescription>
              </>
            )}
          </CardHeader>

          {!isVerifying && verifyResult?.success && (
            <CardContent className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Package:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {getPackageLabel(verifyResult.packageType)}
                  </span>
                </div>
                
                {verifyResult.credits !== undefined && verifyResult.packageType !== 'unlimited' && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Total Credits:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <CreditCard className="w-4 h-4" />
                      {verifyResult.credits}
                    </span>
                  </div>
                )}

                {verifyResult.subscriptionStatus === 'pro' && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Check className="w-4 h-4" />
                      Unlimited Access Active
                    </span>
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => setLocation('/')}
              >
                Start Verifying Documents
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          )}

          {!isVerifying && (error || !verifyResult?.success) && (
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLocation('/pricing')}
              >
                Back to Pricing
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
