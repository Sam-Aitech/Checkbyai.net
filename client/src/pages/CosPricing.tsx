import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Check, X, Shield, Zap, Clock, LogIn, CreditCard, Infinity, UserCheck, Bell, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useScrollReveal, spring, fadeUp, tapScale } from '@/lib/animations';
import { useInView } from 'react-intersection-observer';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import SEOHead from '@/components/SEOHead';
import PageLayout from '@/components/PageLayout';

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
  bundleBadge?: string;
}

const plans: PricingPlan[] = [
  {
    name: 'Starter Package',
    price: '£24.99',
    priceValue: 2499,
    period: '/month',
    description: 'Protect your visa with same-day alerts. £239.99 billed annually (20% off).',
    packageType: 'starter',
    credits: 50,
    icon: CreditCard,
    features: [
      '50 verification credits',
      'AI-powered document analysis',
      'Forensic metadata extraction',
      'Instant results',
      'Credits never expire',
    ],
    notIncluded: [
      'Expert human review',
    ],
  },
  {
    name: 'Pro Package',
    price: '£49.99',
    priceValue: 4999,
    period: '/month',
    description: 'Complete protection with immediate alerts. £479.99 billed annually (20% off).',
    packageType: 'pro',
    credits: 100,
    popular: true,
    icon: Zap,
    features: [
      '100 verification credits',
      'AI-powered document analysis',
      'Forensic metadata extraction',
      'Instant results',
      'Credits never expire',
      'Priority support',
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
    features: [
      'Unlimited verifications',
      'AI-powered document analysis',
      'Forensic metadata extraction',
      'Instant results',
      'Priority support',
      'Perfect for high volume',
      'Cancel anytime',
    ],
    bundleBadge: 'Includes Notification Engine: 10 companies watchlist',
  },
  {
    name: 'Master Package',
    price: '£99.99',
    priceValue: 9999,
    description: 'Priority expert human review with 24-hour SLA',
    packageType: 'master',
    icon: UserCheck,
    features: [
      'Expert human review',
      '24-hour turnaround guarantee',
      'Detailed forensic analysis report',
      'Document authenticity assessment',
      'Employer verification check',
      'Technical findings summary',
      'Email report delivery',
    ],
    bundleBadge: 'Bonus: 5-company notifications for 3 months',
  },
];

function PricingCard({ plan, index, isLoggedIn, loading, onSelect }: {
  plan: PricingPlan;
  index: number;
  isLoggedIn: boolean;
  loading: string | null;
  onSelect: (plan: PricingPlan) => void;
}) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ ...spring, delay: index * 0.1 }}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      className={`relative overflow-hidden flex flex-col theme-card bg-card ${
        plan.popular ? 'border-primary lg:scale-105 z-10' : ''
      }`}
    >
      {plan.popular && (
        <div className="absolute top-3 right-3">
          <span className="editorial-caption bg-primary text-primary-foreground px-2 py-1 rounded-full">
            Best Value
          </span>
        </div>
      )}

      <div className="p-6 pb-4">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
          <plan.icon className="w-6 h-6 text-foreground" />
        </div>
        <h3 className="text-xl font-bold text-foreground">
          {plan.name}
        </h3>
        <p className="text-muted-foreground text-sm mt-1">
          {plan.description}
        </p>
      </div>

      <div className="px-6 pb-6 flex-grow">
        <div className="mb-6">
          <span className="editorial-heading text-4xl text-foreground">
            {plan.price}
          </span>
          <span className="text-muted-foreground text-sm ml-1">
            {plan.period || ' one-time'}
          </span>
        </div>

        <ul className="space-y-2">
          {plan.features.map((feature, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-foreground" />
              <span>{feature}</span>
            </li>
          ))}
          {plan.notIncluded?.map((feature, idx) => (
            <li key={`not-${idx}`} className="flex items-start gap-2 text-sm text-muted-foreground">
              <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="line-through">{feature}</span>
            </li>
          ))}
        </ul>

        {plan.bundleBadge && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="flex items-start gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <Bell className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{plan.bundleBadge}</span>
            </div>
          </div>
        )}

        {plan.packageType === 'master' && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50 rounded-lg">
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>Important:</strong> Our expert review is a technical forensic assessment of document authenticity only. It does not constitute immigration advice. For immigration advice, consult an{' '}
              <a
                href="https://www.gov.uk/find-immigration-adviser"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline font-semibold"
              >
                OISC-registered adviser or solicitor
              </a>.
            </p>
          </div>
        )}
      </div>

      <div className="p-6 pt-0 mt-auto">
        <motion.button
          {...tapScale}
          className="w-full py-3 px-4 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-full transition-colors disabled:opacity-50"
          onClick={() => onSelect(plan)}
          disabled={loading !== null}
        >
          {loading === plan.packageType ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background"></div>
              Processing...
            </span>
          ) : !isLoggedIn ? (
            <span className="flex items-center justify-center gap-2">
              <LogIn className="w-4 h-4" />
              Login to Purchase
            </span>
          ) : (
            `Get ${plan.name}`
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function CosPricing() {
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

  const isLoggedIn = !!user?.id;

  const paymentLinks: Record<string, string> = {
    starter: 'https://buy.stripe.com/3cIeVec9k1pz2uQdIveZ203',
    pro: 'https://buy.stripe.com/fZufZi4GSfgp1qMfQDeZ201',
    unlimited: 'https://buy.stripe.com/dRm3cw7T41pz8Te5bZeZ202',
    master: 'https://buy.stripe.com/28E28s4GS6JTfhC6g3eZ200',
  };

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

    const link = paymentLinks[plan.packageType];
    if (!link) {
      toast({
        title: 'Error',
        description: 'Package not available. Please try again later.',
        variant: 'destructive',
      });
      setLoading(null);
      return;
    }

    try {
      const res = await apiRequest('POST', '/api/checkout/sign', { packageType: plan.packageType });
      const envelope = await res.json();
      const { clientReferenceId } = envelope?.data ?? envelope;
      const url = `${link}?client_reference_id=${encodeURIComponent(clientReferenceId)}&prefilled_email=${encodeURIComponent(user.email || '')}`;
      window.location.href = url;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start checkout. Please try again.',
        variant: 'destructive',
      });
      setLoading(null);
    }
  };

  const headerReveal = useScrollReveal();
  const whyReveal = useScrollReveal();

  return (
    <PageLayout>
      <SEOHead
        title="Verify Your CoS is Genuine | Fake Document Detection from £24.99 | CheckByAI"
        description="Worried your Certificate of Sponsorship might be fake? Verify it instantly with forensic AI analysis. Detect edited documents, forged metadata, and suspicious formatting."
        canonicalUrl="https://checkbyai.net/cos-pricing"
        ogTitle="Don't Trust a Fake CoS | Verify from £24.99"
        ogDescription="Worried your Certificate of Sponsorship is fake? Upload it for instant forensic verification."
        keywords="CoS verification pricing, certificate of sponsorship check cost, fake CoS detection, UK visa document verification"
        breadcrumbs={[
          { name: "Home", url: "https://checkbyai.net/" },
          { name: "CoS Verification Pricing", url: "https://checkbyai.net/cos-pricing" }
        ]}
        structuredData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Product",
              "name": "CheckByAI CoS Verification",
              "description": "AI-powered Certificate of Sponsorship verification for UK visa applicants. Forensic metadata analysis to detect fake or edited documents.",
              "brand": { "@type": "Brand", "name": "CheckByAI" },
              "offers": [
                { "@type": "Offer", "name": "Starter", "price": "24.99", "priceCurrency": "GBP", "description": "50 verification credits" },
                { "@type": "Offer", "name": "Pro", "price": "49.99", "priceCurrency": "GBP", "description": "100 verification credits" },
                { "@type": "Offer", "name": "Unlimited Monthly", "price": "99.99", "priceCurrency": "GBP", "priceSpecification": { "@type": "UnitPriceSpecification", "price": "99.99", "priceCurrency": "GBP", "unitText": "MONTH" } }
              ]
            },
            {
              "@type": "Service",
              "name": "Certificate of Sponsorship Verification",
              "description": "Forensic AI analysis of UK Certificate of Sponsorship documents to verify authenticity",
              "provider": { "@type": "Organization", "name": "CheckByAI", "url": "https://checkbyai.net" },
              "areaServed": { "@type": "Country", "name": "United Kingdom" },
              "serviceType": "Document Verification"
            }
          ]
        }}
      />
      
      <div className="bg-background">
        <div className="container mx-auto px-4 py-12">
          <motion.div
            ref={headerReveal.ref}
            initial={fadeUp.initial}
            animate={headerReveal.inView ? fadeUp.animate : fadeUp.initial}
            transition={spring}
            className="text-center mb-12"
          >
            <span className="editorial-caption text-muted-foreground mb-4 inline-block">
              Verification Credits
            </span>
            <h1 className="text-5xl md:text-6xl editorial-heading text-foreground mb-4">
              CoS Verification Plans
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto editorial-body">
              Purchase verification credits or subscribe for unlimited access. Credits never expire and can be used anytime.
            </p>
            
            {!isLoadingUser && !isLoggedIn && (
              <div className="mt-6 inline-flex items-center gap-2 bg-muted text-foreground border border-border rounded-xl px-4 py-2">
                <LogIn className="w-4 h-4" />
                <span>Please <button onClick={() => setLocation('/login')} className="underline font-semibold hover:no-underline">log in</button> to purchase credits</span>
              </div>
            )}
            
            {!isLoadingUser && isLoggedIn && (
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                <div className="inline-flex items-center gap-2 bg-muted text-foreground border border-border rounded-xl px-4 py-2">
                  <Check className="w-4 h-4" />
                  <span>Logged in as <strong>{user?.email}</strong></span>
                </div>
                {creditsData && (
                  <div className="inline-flex items-center gap-2 bg-muted text-foreground border border-border rounded-xl px-4 py-2">
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
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mb-16">
            {plans.map((plan, index) => (
              <PricingCard
                key={plan.packageType}
                plan={plan}
                index={index}
                isLoggedIn={isLoggedIn}
                loading={loading}
                onSelect={handleSelectPlan}
              />
            ))}
          </div>

          <motion.div
            ref={whyReveal.ref}
            initial={fadeUp.initial}
            animate={whyReveal.inView ? fadeUp.animate : fadeUp.initial}
            transition={spring}
            className="max-w-4xl mx-auto"
          >
            <h2 className="text-2xl editorial-subheading text-center text-foreground mb-8">
              Why Choose Our Verification Service?
            </h2>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              <div className="bg-card theme-card p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">AI Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Advanced forensic document analysis
                </p>
              </div>

              <div className="bg-card theme-card p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Instant Results</h3>
                <p className="text-sm text-muted-foreground">
                  Get verification in seconds
                </p>
              </div>

              <div className="bg-card theme-card p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Never Expire</h3>
                <p className="text-sm text-muted-foreground">
                  Credits stay valid forever
                </p>
              </div>

              <div className="bg-card theme-card p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <UserCheck className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Expert Review</h3>
                <p className="text-sm text-muted-foreground">
                  Human experts for complex cases
                </p>
              </div>
            </div>

            <div className="text-center bg-card theme-card p-6 rounded-xl">
              <p className="text-sm text-muted-foreground mb-3">
                Want to monitor your sponsor's licence status?
              </p>
              <button
                onClick={() => setLocation('/pricing')}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                View Notification Engine Plans <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>

          <div className="mt-12 text-center text-muted-foreground">
            <p className="text-sm">
              Questions? Contact us at{' '}
              <a href="mailto:support@cosverify.uk" className="text-foreground underline hover:no-underline">
                support@cosverify.uk
              </a>
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
