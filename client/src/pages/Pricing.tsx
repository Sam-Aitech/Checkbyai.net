import { useState, useEffect, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Check, X, Shield, Zap, Clock, LogIn, Bell, Eye, MessageSquare, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useScrollReveal, spring, fadeUp, tapScale } from '@/lib/animations';
import { useInView } from 'react-intersection-observer';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { unwrapApiEnvelope } from '@/lib/apiEnvelope';
import SEOHead from '@/components/SEOHead';
import PageLayout from '@/components/PageLayout';
import { usePackagePrices } from '@/hooks/usePackagePrices';

interface User {
  id: string;
  email: string;
  role: string;
  credits?: number;
  subscriptionStatus?: string;
}

interface NotificationPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  packageType: 'notification_starter' | 'notification_pro';
  popular?: boolean;
  features: string[];
  notIncluded?: string[];
  icon: typeof Bell;
}

interface AnnualPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  packageType: 'alert_annual' | 'alert_annual_pro';
  popular?: boolean;
  features: string[];
  icon: typeof Bell;
}

const annualPlans: AnnualPlan[] = [
  {
    name: 'Alert Pass — Annual',
    price: '£9.99',
    period: '/year',
    description: 'Low-commitment monitoring for a single employer.',
    packageType: 'alert_annual',
    icon: Bell,
    features: [
      'Monitor 1 company for 12 months',
      'Email + WhatsApp alerts',
      'Same-day alerts (6 PM)',
      '30-day change history',
    ],
  },
  {
    name: 'Alert Pass — Pro Annual',
    price: '£19.99',
    period: '/year',
    description: 'Full protection with immediate alerts, billed once a year.',
    packageType: 'alert_annual_pro',
    popular: true,
    icon: Zap,
    features: [
      'Monitor up to 5 companies for 12 months',
      'Email + WhatsApp + SMS',
      'Immediate alerts',
      '90-day change history',
    ],
  },
];

const notificationPlans: NotificationPlan[] = [
  {
    name: 'Starter',
    price: '£24.99',
    period: '/month',
    description: 'Stay informed when your sponsor licence status changes.',
    packageType: 'notification_starter',
    icon: Bell,
    features: [
      'Monitor up to 2 companies',
      'Email + WhatsApp alerts',
      'Same-day alerts (6 PM)',
      '30-day change history',
      'Monitoring dashboard',
    ],
    notIncluded: [
      'SMS notifications',
      'Immediate alerts',
      'CoS verification checks',
    ],
  },
  {
    name: 'Pro',
    price: '£49.99',
    period: '/month',
    description: 'Full protection with immediate alerts and CoS checks.',
    packageType: 'notification_pro',
    popular: true,
    icon: Zap,
    features: [
      'Monitor up to 5 companies',
      'Email + WhatsApp + SMS',
      'Immediate alerts',
      '90-day change history',
      '5 CoS verification checks per month',
      'Priority support',
    ],
  },
];

function NotificationPlanCard({ plan, index, isLoggedIn, loading, onSelect, highlighted }: {
  plan: NotificationPlan;
  index: number;
  isLoggedIn: boolean;
  loading: string | null;
  onSelect: (plan: NotificationPlan) => void;
  highlighted?: boolean;
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
        highlighted ? 'ring-2 ring-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/20' :
        plan.popular ? 'border-primary lg:scale-105 z-10' : ''
      }`}
    >
      {plan.popular && (
        <div className="absolute top-3 right-3">
          <span className="editorial-caption bg-primary text-primary-foreground px-2 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}

      <div className="p-6 pb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
          plan.name.includes("Starter") ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" :
          plan.name.includes("Pro") ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
          "bg-primary/20 text-primary"
        }`}>
          <plan.icon className="w-6 h-6" />
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
            {plan.period}
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
              Login to Subscribe
            </span>
          ) : (
            `Get ${plan.name}`
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

function AnnualPlanCard({ plan, index, isLoggedIn, loading, onSelect, available }: {
  plan: AnnualPlan;
  index: number;
  isLoggedIn: boolean;
  loading: string | null;
  onSelect: (plan: AnnualPlan) => void;
  available: boolean;
}) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ ...spring, delay: index * 0.1 }}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      className={`relative overflow-hidden flex flex-col theme-card bg-card ${plan.popular ? 'border-primary lg:scale-105 z-10' : ''}`}
    >
      {plan.popular && (
        <div className="absolute top-3 right-3">
          <span className="editorial-caption bg-primary text-primary-foreground px-2 py-1 rounded-full">Most Popular</span>
        </div>
      )}
      <div className="p-6 pb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 bg-primary/20 text-primary">
          <plan.icon className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
        <p className="text-muted-foreground text-sm mt-1">{plan.description}</p>
      </div>
      <div className="px-6 pb-6 flex-grow">
        <div className="mb-6">
          <span className="editorial-heading text-4xl text-foreground">{plan.price}</span>
          <span className="text-muted-foreground text-sm ml-1">{plan.period}</span>
        </div>
        <ul className="space-y-2">
          {plan.features.map((feature, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-foreground" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
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
            <span className="flex items-center justify-center gap-2"><LogIn className="w-4 h-4" />Login to Subscribe</span>
          ) : !available ? (
            'Coming soon'
          ) : (
            `Get ${plan.name}`
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function Pricing() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const companyParam = params.get('company') || '';
  const planParam = params.get('plan') || '';   // 'starter' | 'pro'
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const planCardsRef = useRef<HTMLDivElement>(null);
  const { getPriceId } = usePackagePrices();

  // Scroll to the plan cards when arriving from the landing page with ?plan=
  useEffect(() => {
    if (!planParam) return;
    const timer = setTimeout(() => {
      planCardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
    return () => clearTimeout(timer);
  }, [planParam]);

  const { data: user, isLoading: isLoadingUser } = useQuery<User | null>({
    queryKey: ['/api/auth/user'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    retry: false,
  });

  const isLoggedIn = !!user?.id;

  const paymentLinks: Record<string, string> = {
    notification_starter: 'https://buy.stripe.com/8x24gAb5g6JTglG5bZeZ204',
    notification_pro: 'https://buy.stripe.com/aFa00kflwd8h4CYcEreZ205',
  };

  const handleSelectNotification = async (plan: NotificationPlan) => {
    if (!isLoggedIn) {
      toast({
        title: 'Login Required',
        description: 'Please log in or create an account to subscribe.',
      });
      setLocation('/login');
      return;
    }

    setLoading(plan.packageType);

    const link = paymentLinks[plan.packageType];
    if (!link) {
      toast({
        title: 'Error',
        description: 'Plan not available. Please try again later.',
        variant: 'destructive',
      });
      setLoading(null);
      return;
    }

    try {
      const res = await apiRequest('POST', '/api/checkout/sign', {
        packageType: plan.packageType,
        ...(companyParam ? { companyName: companyParam } : {}),
      });
      const envelope = await res.json();
      const { clientReferenceId } = unwrapApiEnvelope<{ clientReferenceId: string }>(envelope);
      const url = `${link}?client_reference_id=${encodeURIComponent(clientReferenceId)}&prefilled_email=${encodeURIComponent(user?.email || '')}`;
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

  const handleSelectAnnual = async (plan: AnnualPlan) => {
    if (!isLoggedIn) {
      toast({ title: 'Login Required', description: 'Please log in or create an account to subscribe.' });
      setLocation('/login');
      return;
    }
    const priceId = getPriceId(plan.packageType);
    if (!priceId) {
      toast({ title: 'Not available yet', description: 'This plan is not open for checkout yet — please check back shortly.', variant: 'destructive' });
      return;
    }
    setLoading(plan.packageType);
    try {
      const res = await apiRequest('POST', '/api/checkout/credits', {
        priceId,
        packageType: plan.packageType,
        ...(companyParam ? { companyName: companyParam } : {}),
      });
      const envelope = await res.json();
      const { url } = unwrapApiEnvelope<{ url: string }>(envelope);
      window.location.href = url;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to start checkout. Please try again.', variant: 'destructive' });
      setLoading(null);
    }
  };

  const headerReveal = useScrollReveal();
  const whyReveal = useScrollReveal();

  return (
    <PageLayout>
      <SEOHead
        title="Protect Your Visa | Sponsor Licence Alerts from £24.99/mo | CheckByAI"
        description="Never be blindsided by a sponsor licence revocation. Get instant WhatsApp and email alerts. Starter £24.99/mo (2 companies), Pro £49.99/mo (5 companies, SMS + immediate alerts)."
        canonicalUrl="https://checkbyai.net/pricing"
        ogTitle="Protect Your Visa | Sponsor Alerts from £24.99/mo"
        ogDescription="Instant alerts when your employer's sponsor licence changes. Don't risk your visa status."
        keywords="sponsor licence alerts pricing, UK visa monitoring subscription, sponsor revocation alert plans, WhatsApp sponsor alerts"
        breadcrumbs={[
          { name: "Home", url: "https://checkbyai.net/" },
          { name: "Pricing", url: "https://checkbyai.net/pricing" }
        ]}
        structuredData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Product",
              "name": "CheckByAI Notification Engine - Starter",
              "description": "UK sponsor licence monitoring with email and WhatsApp alerts for up to 2 companies. Same-day alerts at 6 PM UTC.",
              "brand": { "@type": "Brand", "name": "CheckByAI" },
              "offers": {
                "@type": "Offer",
                "price": "24.99",
                "priceCurrency": "GBP",
                "priceSpecification": { "@type": "UnitPriceSpecification", "price": "24.99", "priceCurrency": "GBP", "unitText": "MONTH" },
                "availability": "https://schema.org/InStock",
                "url": "https://checkbyai.net/pricing"
              }
            },
            {
              "@type": "Product",
              "name": "CheckByAI Notification Engine - Pro",
              "description": "UK sponsor licence monitoring with immediate email, WhatsApp and SMS alerts for up to 5 companies. Includes 5 CoS verification checks per month.",
              "brand": { "@type": "Brand", "name": "CheckByAI" },
              "offers": {
                "@type": "Offer",
                "price": "49.99",
                "priceCurrency": "GBP",
                "priceSpecification": { "@type": "UnitPriceSpecification", "price": "49.99", "priceCurrency": "GBP", "unitText": "MONTH" },
                "availability": "https://schema.org/InStock",
                "url": "https://checkbyai.net/pricing"
              }
            },
            {
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "What's the difference between Starter and Pro plans?",
                  "acceptedAnswer": { "@type": "Answer", "text": "The Starter plan (£24.99/mo) monitors up to 2 companies with email and WhatsApp alerts delivered same-day at 6 PM. The Pro plan (£49.99/mo) monitors up to 5 companies with immediate alerts via email, WhatsApp, and SMS, plus 5 CoS verification checks per month." }
                },
                {
                  "@type": "Question",
                  "name": "Can I cancel my subscription anytime?",
                  "acceptedAnswer": { "@type": "Answer", "text": "Yes, you can cancel your CheckByAI subscription at any time. Your monitoring will continue until the end of your current billing period." }
                },
                {
                  "@type": "Question",
                  "name": "How are alerts delivered?",
                  "acceptedAnswer": { "@type": "Answer", "text": "Starter plan subscribers receive alerts via email and WhatsApp at 6 PM UTC on the day a change is detected. Pro plan subscribers receive immediate alerts via email, WhatsApp, and SMS within minutes of detection." }
                }
              ]
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
              Sponsor Licence Alerts
            </span>
            {companyParam ? (
              <>
                <h1 className="text-4xl md:text-5xl editorial-heading text-foreground mb-4 break-words">
                  Start monitoring{' '}
                  <span className="text-primary">{companyParam}</span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto editorial-body">
                  Choose a plan to get instant alerts when{' '}
                  <strong className="text-foreground">{companyParam}</strong>'s
                  sponsor licence status changes.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-5xl md:text-6xl editorial-heading text-foreground mb-4">
                  Protect Your Visa
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto editorial-body">
                  Get alerted the moment your sponsor's licence status changes. Never be caught off guard by a revocation or suspension.
                </p>
              </>
            )}
            
            {!isLoadingUser && !isLoggedIn && (
              <div className="mt-6 inline-flex items-center gap-2 bg-muted text-foreground border border-border rounded-xl px-4 py-2">
                <LogIn className="w-4 h-4" />
                <span>Please <button onClick={() => setLocation('/login')} className="underline font-semibold hover:no-underline">log in</button> to subscribe</span>
              </div>
            )}
            
            {!isLoadingUser && isLoggedIn && (
              <div className="mt-6 inline-flex items-center gap-2 bg-muted text-foreground border border-border rounded-xl px-4 py-2">
                <Check className="w-4 h-4" />
                <span>Logged in as <strong>{user?.email}</strong></span>
              </div>
            )}
          </motion.div>

          <div className="max-w-3xl mx-auto mb-8">
            <div ref={planCardsRef} className="grid md:grid-cols-2 gap-6">
              {annualPlans.map((plan, index) => (
                <AnnualPlanCard
                  key={plan.packageType}
                  plan={plan}
                  index={index}
                  isLoggedIn={isLoggedIn}
                  loading={loading}
                  onSelect={handleSelectAnnual}
                  available={!!getPriceId(plan.packageType)}
                />
              ))}
            </div>
          </div>

          <div className="max-w-3xl mx-auto mb-16">
            <p className="text-center text-sm text-muted-foreground mb-4">Prefer to pay monthly instead?</p>
            <div className="grid md:grid-cols-2 gap-6">
              {notificationPlans.map((plan, index) => (
                <NotificationPlanCard
                  key={plan.packageType}
                  plan={plan}
                  index={index}
                  isLoggedIn={isLoggedIn}
                  loading={loading}
                  onSelect={handleSelectNotification}
                  highlighted={!!planParam && plan.packageType === `notification_${planParam}`}
                />
              ))}
            </div>
          </div>

          <motion.div
            ref={whyReveal.ref}
            initial={fadeUp.initial}
            animate={whyReveal.inView ? fadeUp.animate : fadeUp.initial}
            transition={spring}
            className="max-w-4xl mx-auto"
          >
            <h2 className="text-2xl editorial-subheading text-center text-foreground mb-8">
              Why You Need Sponsor Monitoring
            </h2>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              <div className="bg-card theme-card p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Bell className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Instant Alerts</h3>
                <p className="text-sm text-muted-foreground">
                  Get notified the moment something changes
                </p>
              </div>

              <div className="bg-card theme-card p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Eye className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">24/7 Monitoring</h3>
                <p className="text-sm text-muted-foreground">
                  We track the Home Office register daily
                </p>
              </div>

              <div className="bg-card theme-card p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Multi-Channel</h3>
                <p className="text-sm text-muted-foreground">
                  Email, WhatsApp, and SMS alerts
                </p>
              </div>

              <div className="bg-card theme-card p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Peace of Mind</h3>
                <p className="text-sm text-muted-foreground">
                  Protect your visa status proactively
                </p>
              </div>
            </div>

            <div className="text-center bg-card theme-card p-6 rounded-xl">
              <p className="text-sm text-muted-foreground mb-3">
                Need to verify a Certificate of Sponsorship document?
              </p>
              <button
                onClick={() => setLocation('/cos-pricing')}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                View CoS Verification Plans <ArrowRight className="w-4 h-4" />
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
