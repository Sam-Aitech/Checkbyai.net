import { useState } from 'react';
import { useLocation } from 'wouter';
import { Check, Shield, Zap, Phone, Building2, FileSearch, Clock, Star, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import SEOHead from '@/components/SEOHead';
import Footer from '@/components/Footer';

interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

interface PricingPlan {
  name: string;
  price: string;
  priceValue: number;
  description: string;
  features: PlanFeature[];
  popular?: boolean;
  packageType: 'normal' | 'full';
}

const plans: PricingPlan[] = [
  {
    name: 'Normal Verification',
    price: '£19.99',
    priceValue: 1999,
    description: 'Comprehensive AI + expert verification of your Certificate of Sponsorship',
    packageType: 'normal',
    features: [
      { text: 'Deep AI document analysis', included: true },
      { text: 'Manual expert verification', included: true },
      { text: 'Detailed questionnaire review', included: true },
      { text: 'CoS document upload & analysis', included: true },
      { text: 'Guaranteed written report', included: true },
      { text: 'Email delivery within 48 hours', included: true },
      { text: 'Priority review', included: false },
      { text: 'Phone consultation', included: false },
      { text: 'Employer sponsor licence check', included: false },
      { text: 'Detailed alteration analysis', included: false },
    ],
  },
  {
    name: 'Full Package',
    price: '£49.99',
    priceValue: 4999,
    description: 'Complete verification with priority handling and employer verification',
    packageType: 'full',
    popular: true,
    features: [
      { text: 'Deep AI document analysis', included: true },
      { text: 'Manual expert verification', included: true },
      { text: 'Detailed questionnaire review', included: true },
      { text: 'CoS document upload & analysis', included: true },
      { text: 'Guaranteed written report', included: true },
      { text: 'Priority review - faster turnaround', included: true, highlight: true },
      { text: 'Phone consultation available', included: true, highlight: true },
      { text: 'Employer sponsor licence verification', included: true, highlight: true },
      { text: 'Detailed alteration analysis', included: true, highlight: true },
      { text: 'Recommendations & next steps', included: true, highlight: true },
    ],
  },
];

export default function Pricing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelectPlan = async (plan: PricingPlan) => {
    setLoading(plan.packageType);
    try {
      const response = await apiRequest('POST', '/api/paid/create-checkout', {
        packageType: plan.packageType,
        priceAmount: plan.priceValue,
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.sessionId) {
        setLocation(`/submit?session_id=${data.sessionId}`);
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
        title="Expert COS Verification Pricing | UK Immigration Document Check"
        description="Choose your Certificate of Sponsorship verification package. From £19.99 for AI + expert analysis, or £49.99 for full verification including employer sponsor licence checks."
      />
      
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-12">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="mb-8 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            data-testid="button-back-home"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>

          <div className="text-center mb-12">
            <Badge className="mb-4 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Expert Verification
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Professional CoS Verification
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Get peace of mind with our expert verification service. Our specialists manually review your Certificate of Sponsorship alongside advanced AI analysis.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16">
            {plans.map((plan) => (
              <Card
                key={plan.packageType}
                className={`relative overflow-hidden transition-all duration-300 hover:shadow-2xl ${
                  plan.popular
                    ? 'border-2 border-blue-500 dark:border-blue-400 shadow-xl scale-105'
                    : 'border border-gray-200 dark:border-gray-700 hover:border-blue-300'
                }`}
                data-testid={`card-plan-${plan.packageType}`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1 text-sm font-semibold rounded-bl-lg">
                    <Star className="w-4 h-4 inline mr-1" />
                    Most Popular
                  </div>
                )}
                
                <CardHeader className="pb-4">
                  <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                    {plan.name}
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    {plan.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pb-6">
                  <div className="mb-6">
                    <span className="text-5xl font-bold text-gray-900 dark:text-white">
                      {plan.price}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">one-time</span>
                  </div>

                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li
                        key={idx}
                        className={`flex items-start gap-3 ${
                          feature.included
                            ? feature.highlight
                              ? 'text-blue-700 dark:text-blue-400 font-medium'
                              : 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        <Check
                          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                            feature.included
                              ? feature.highlight
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-green-600 dark:text-green-400'
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        />
                        <span className={!feature.included ? 'line-through' : ''}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button
                    className={`w-full py-6 text-lg font-semibold ${
                      plan.popular
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                        : ''
                    }`}
                    size="lg"
                    onClick={() => handleSelectPlan(plan)}
                    disabled={loading !== null}
                    data-testid={`button-select-${plan.packageType}`}
                  >
                    {loading === plan.packageType ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Processing...
                      </span>
                    ) : (
                      `Select ${plan.name}`
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-8">
              What's Included in Every Package
            </h2>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI Analysis</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Advanced document authenticity detection
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileSearch className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Expert Review</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manual verification by specialists
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Fast Turnaround</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Results within 24-48 hours
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md text-center">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Written Report</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Detailed findings delivered to you
                </p>
              </div>
            </div>
          </div>

          <div className="mt-16 bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-3xl mx-auto shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 text-center">
              Full Package Exclusive Features
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Phone Consultation</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Speak directly with our verification experts to discuss your case
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Employer Verification</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    We check the employer's sponsor licence status with UK authorities
                  </p>
                </div>
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
