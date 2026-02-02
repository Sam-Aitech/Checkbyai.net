import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Check, X, Shield, Zap, Clock, Star, ArrowLeft, LogIn, CreditCard, Infinity, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import SEOHead from '@/components/SEOHead';
import Footer from '@/components/Footer';

interface User {
  id: string;
  email: string;
  role: string;
  credits?: number;
  subscriptionStatus?: string;
}

interface PricingPlan {
  name: string;
  price: string;
  priceValue: number;
  period?: string;
  description: string;
  features: string[];
  notIncluded?: string[];
  popular?: boolean;
  packageType: 'starter' | 'pro' | 'unlimited' | 'master';
  credits?: number;
  icon: typeof CreditCard;
  gradient: string;
}

const plans: PricingPlan[] = [
  {
    name: 'Starter Package',
    price: '£24.99',
    priceValue: 2499,
    description: '50 verification credits for occasional use',
    packageType: 'starter',
    credits: 50,
    icon: CreditCard,
    gradient: 'from-emerald-500 to-teal-600',
    features: [
      '50 verification credits',
      'AI-powered document analysis',
      'Forensic metadata extraction',
      'Instant results',
      'Credits never expire',
    ],
    notIncluded: [
      'Priority support',
      'Expert human review',
    ],
  },
  {
    name: 'Pro Package',
    price: '£39.99',
    priceValue: 3999,
    description: '100 verification credits - best value',
    packageType: 'pro',
    credits: 100,
    popular: true,
    icon: Zap,
    gradient: 'from-blue-500 to-indigo-600',
    features: [
      '100 verification credits',
      'AI-powered document analysis',
      'Forensic metadata extraction',
      'Instant results',
      'Credits never expire',
      '20% savings vs Starter',
    ],
    notIncluded: [
      'Expert human review',
    ],
  },
  {
    name: 'Unlimited Monthly',
    price: '£99.99',
    priceValue: 9999,
    period: '/month',
    description: 'Unlimited verifications for businesses',
    packageType: 'unlimited',
    icon: Infinity,
    gradient: 'from-purple-500 to-violet-600',
    features: [
      'Unlimited verifications',
      'AI-powered document analysis',
      'Forensic metadata extraction',
      'Instant results',
      'Priority support',
      'Perfect for high volume',
      'Cancel anytime',
    ],
  },
  {
    name: 'Master Package',
    price: '£99.99',
    priceValue: 9999,
    description: 'Priority expert human review with 24-hour SLA',
    packageType: 'master',
    icon: UserCheck,
    gradient: 'from-amber-500 to-orange-600',
    features: [
      'Expert human review',
      '24-hour turnaround guarantee',
      'Detailed analysis report',
      'Document authenticity assessment',
      'Employer verification check',
      'Recommendations & next steps',
      'Email report delivery',
    ],
  },
];

export default function Pricing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const { data: user, isLoading: isLoadingUser } = useQuery<User | null>({
    queryKey: ['/api/auth/user'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    retry: false,
  });

  const { data: creditsData } = useQuery<{ credits: number; subscriptionStatus: string; isUnlimited: boolean }>({
    queryKey: ['/api/credits'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user,
  });

  const { data: packagesData } = useQuery<{ packages: any[] }>({
    queryKey: ['/api/packages'],
    retry: false,
  });

  const isLoggedIn = !!user?.id;

  const handleSelectPlan = async (plan: PricingPlan) => {
    if (!isLoggedIn) {
      toast({
        title: 'Login Required',
        description: 'Please log in or create an account to purchase this package.',
      });
      setLocation('/login');
      return;
    }

    setLoading(plan.packageType);
    try {
      const packages = packagesData?.packages || [];
      const stripeProduct = packages.find((p: any) => 
        p.metadata?.packageType === plan.packageType
      );
      
      const priceId = stripeProduct?.prices?.[0]?.id;
      
      if (!priceId) {
        throw new Error('Package not available. Please try again later.');
      }

      const response = await apiRequest('POST', '/api/checkout/credits', {
        priceId,
        packageType: plan.packageType,
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start checkout. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <SEOHead
        title="Pricing - CoS Verification Credits | UK Immigration Document Check"
        description="Purchase verification credits for your Certificate of Sponsorship documents. From £24.99 for 50 credits, unlimited plans for businesses, and expert human review packages."
      />
      
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-12">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="mb-8 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>

          <div className="text-center mb-12">
            <Badge className="mb-4 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Verification Credits
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Choose Your Plan
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Purchase verification credits or subscribe for unlimited access. Credits never expire and can be used anytime.
            </p>
            
            {!isLoadingUser && !isLoggedIn && (
              <div className="mt-6 inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-2 rounded-lg">
                <LogIn className="w-4 h-4" />
                <span>Please <button onClick={() => setLocation('/login')} className="underline font-semibold hover:no-underline">log in</button> to purchase credits</span>
              </div>
            )}
            
            {!isLoadingUser && isLoggedIn && (
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                <div className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-4 py-2 rounded-lg">
                  <Check className="w-4 h-4" />
                  <span>Logged in as <strong>{user?.email}</strong></span>
                </div>
                {creditsData && (
                  <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-4 py-2 rounded-lg">
                    <CreditCard className="w-4 h-4" />
                    <span>
                      {creditsData.isUnlimited ? (
                        <><Infinity className="w-4 h-4 inline" /> Unlimited verifications</>
                      ) : (
                        <><strong>{creditsData.credits}</strong> credits remaining</>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mb-16">
            {plans.map((plan) => (
              <Card
                key={plan.packageType}
                className={`relative overflow-hidden transition-all duration-300 hover:shadow-2xl flex flex-col ${
                  plan.popular
                    ? 'border-2 border-blue-500 dark:border-blue-400 shadow-xl lg:scale-105 z-10'
                    : 'border border-gray-200 dark:border-gray-700 hover:border-blue-300'
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-1 text-xs font-semibold rounded-bl-lg">
                    <Star className="w-3 h-3 inline mr-1" />
                    Best Value
                  </div>
                )}
                
                <CardHeader className="pb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-3`}>
                    <plan.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                    {plan.name}
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400 text-sm">
                    {plan.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pb-6 flex-grow">
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900 dark:text-white">
                      {plan.price}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">
                      {plan.period || ' one-time'}
                    </span>
                  </div>

                  <ul className="space-y-2">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {plan.notIncluded?.map((feature, idx) => (
                      <li key={`not-${idx}`} className="flex items-start gap-2 text-sm text-gray-400 dark:text-gray-500">
                        <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span className="line-through">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="mt-auto">
                  <Button
                    className={`w-full py-5 font-semibold bg-gradient-to-r ${plan.gradient} hover:opacity-90 text-white`}
                    size="lg"
                    onClick={() => handleSelectPlan(plan)}
                    disabled={loading !== null}
                  >
                    {loading === plan.packageType ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Processing...
                      </span>
                    ) : !isLoggedIn ? (
                      <span className="flex items-center gap-2">
                        <LogIn className="w-4 h-4" />
                        Login to Purchase
                      </span>
                    ) : (
                      `Get ${plan.name}`
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-8">
              Why Choose Our Verification Service?
            </h2>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI Analysis</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Advanced forensic document analysis
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Instant Results</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get verification in seconds
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Never Expire</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Credits stay valid forever
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserCheck className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Expert Review</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Human experts for complex cases
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center text-gray-600 dark:text-gray-400">
            <p className="text-sm">
              Questions? Contact us at{' '}
              <a href="mailto:support@cosverify.uk" className="text-blue-600 hover:underline">
                support@cosverify.uk
              </a>
            </p>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
