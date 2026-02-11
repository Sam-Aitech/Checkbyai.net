import { Link } from "wouter";
import { Shield, Brain, Zap, Lock, CheckCircle, ArrowLeft, FileSearch, AlertTriangle, Award, MessageCircle, Briefcase, Users, PoundSterling, CreditCard, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface RedFlagCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  severity: "critical" | "high";
}

function RedFlagCard({ icon, title, description, severity }: RedFlagCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-xl border-2 ${
      severity === "critical" 
        ? "border-red-500 bg-red-50 dark:bg-red-950/30" 
        : "border-orange-500 bg-orange-50 dark:bg-orange-950/30"
    } p-5 transition-all hover:shadow-lg`}>
      <div className="absolute top-0 right-0 w-20 h-20 opacity-10">
        <XCircle className="w-full h-full text-red-500" />
      </div>
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-full ${
          severity === "critical" 
            ? "bg-red-500 text-white" 
            : "bg-orange-500 text-white"
        }`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
              severity === "critical" 
                ? "bg-red-500 text-white" 
                : "bg-orange-500 text-white"
            }`}>
              {severity === "critical" ? "HIGH RISK" : "WARNING"}
            </span>
          </div>
          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function AIGuide() {
  return (
    <PageLayout>
      <SEOHead
        title="AI Guide - Protect Yourself from CoS Fraud | Check By AI"
        description="Learn how to identify fake Certificate of Sponsorship documents before verification. Spot red flags, common scams, and protect yourself from UK visa fraud."
        keywords="CoS fraud detection, fake certificate of sponsorship, UK visa scam warning, CoS red flags, immigration fraud prevention"
        canonicalUrl="https://checkbyai.net/ai-guide"
      />
      <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-12">
          <div className="inline-flex items-center px-4 py-2 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-800 dark:text-blue-200 text-sm font-medium mb-4">
            <Brain className="w-4 h-4 mr-2" />
            AI-Powered Protection
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Protect Yourself from CoS Fraud
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Learn how to identify warning signs before uploading your Certificate of Sponsorship for verification
          </p>
        </div>

        {/* PRE-CHECK RED FLAGS SECTION */}
        <div className="mb-12">
          <Alert className="mb-6 border-red-500 bg-red-100 dark:bg-red-950/50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <AlertTitle className="text-red-800 dark:text-red-200 font-bold text-lg">
              Before You Verify - Check These Red Flags First
            </AlertTitle>
            <AlertDescription className="text-red-700 dark:text-red-300 mt-2">
              If you notice ANY of the following warning signs, your CoS may be fraudulent. 
              Do NOT proceed with your visa application until you have verified the authenticity of your documents.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 mb-6">
            <RedFlagCard
              icon={<MessageCircle className="w-5 h-5" />}
              title="Received CoS Documents via WhatsApp"
              description="Legitimate UK sponsors send official documents through secure email or employer portals. If your Certificate of Sponsorship arrived via WhatsApp, Telegram, or other messaging apps, this is a major warning sign. Official sponsors never share sensitive immigration documents through social media or messaging platforms."
              severity="critical"
            />
            
            <RedFlagCard
              icon={<Briefcase className="w-5 h-5" />}
              title="Unsolicited Offer Letter from Unknown Company"
              description="If you received a job offer and CoS from a company you never applied to or interviewed with, be extremely cautious. Fraudsters often pose as legitimate UK employers to scam visa applicants. Always verify the company exists on the official Home Office register of licensed sponsors."
              severity="critical"
            />
            
            <RedFlagCard
              icon={<Users className="w-5 h-5" />}
              title="No Proper Interview Process"
              description="Genuine UK employers conduct thorough interviews before sponsoring a worker. If you were offered a Skilled Worker visa without any interview, or only had a brief informal chat, this is highly suspicious. Real sponsorship requires proper recruitment processes."
              severity="high"
            />
            
            <RedFlagCard
              icon={<PoundSterling className="w-5 h-5" />}
              title="Company Asking You for Money"
              description="UK employers should NEVER ask applicants to pay for their own sponsorship. If the company is requesting payment for the CoS, sponsor licence fees, or 'processing fees', this is fraud. Legitimate sponsors cover these costs as part of the employment process."
              severity="critical"
            />
            
            <RedFlagCard
              icon={<CreditCard className="w-5 h-5" />}
              title="Asked to Pay Immigration Skills Charge (ISC)"
              description="The Immigration Skills Charge is paid by the sponsor, NOT the worker. If anyone asks you to pay the ISC (which can be thousands of pounds), you are likely dealing with scammers. This charge is legally the employer's responsibility and cannot be passed to the employee."
              severity="critical"
            />
          </div>

          <div className="bg-amber-100 dark:bg-amber-950/50 border-2 border-amber-500 rounded-xl p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-amber-800 dark:text-amber-200 mb-2">
              Spotted a Red Flag?
            </h3>
            <p className="text-amber-700 dark:text-amber-300 mb-4 max-w-xl mx-auto">
              If any of the above applies to your situation, do NOT proceed with your visa application. 
              Upload your document for verification, or seek advice from a registered immigration adviser before taking any action.
            </p>
            <Link href="/dashboard">
              <Button className="bg-amber-600 hover:bg-amber-700 text-white">
                <Shield className="w-4 h-4 mr-2" />
                Verify Your Document Now
              </Button>
            </Link>
          </div>
        </div>

        {/* HOW OUR AI WORKS - Generalized to prevent pattern copying */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            How Our AI Protects You
          </h2>
          <p className="text-gray-600 dark:text-gray-300">
            Our proprietary verification technology analyses documents using methods developed with UK immigration experts
          </p>
        </div>

        <div className="grid gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <FileSearch className="w-6 h-6 text-blue-600" />
                Advanced Document Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Our AI examines your document using proprietary methods to determine authenticity:
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Compares against verified genuine document patterns</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Identifies inconsistencies that indicate tampering</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Analyses document structure and formatting</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Cross-references with known fraud indicators</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
                Fraud Detection Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Our system is trained to detect various types of document fraud:
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Documents that have been digitally altered or edited</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Fake CoS documents created from scratch</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Documents with modified personal or employer details</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Inconsistencies that don't match official formats</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-purple-600" />
                Continuous Learning System
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Our AI continuously improves through expert feedback:
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <p className="font-semibold text-green-700 dark:text-green-400">Expert Review</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Human oversight</p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <p className="font-semibold text-blue-700 dark:text-blue-400">Pattern Updates</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Regular improvements</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                  <p className="font-semibold text-purple-700 dark:text-purple-400">New Fraud Detection</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Emerging threats</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Award className="w-6 h-6 text-yellow-600" />
                Accuracy & Reliability
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-blue-600">99.8%</p>
                  <p className="text-gray-600 dark:text-gray-400">Detection Accuracy</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-green-600">&lt;3s</p>
                  <p className="text-gray-600 dark:text-gray-400">Average Processing</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-purple-600">24/7</p>
                  <p className="text-gray-600 dark:text-gray-400">Availability</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

          <div className="text-center">
            <Link href="/dashboard">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                <Shield className="w-5 h-5 mr-2" />
                Verify Your Document Now
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
