import { Link } from "wouter";
import {
  Shield,
  Brain,
  Lock,
  CheckCircle,
  ArrowLeft,
  FileSearch,
  Award,
  Zap,
  Server,
  Eye,
  Users,
  Building2,
  ArrowRight,
  Clock,
  Activity,
  FileCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const pipelineStages = [
  {
    step: 1,
    title: "Document Intake",
    icon: <FileSearch className="w-6 h-6" />,
    description:
      "Secure upload with automatic format detection and preliminary validation. Documents are encrypted in transit using TLS 1.3 protocols.",
    color: "blue",
  },
  {
    step: 2,
    title: "Forensic Analysis",
    icon: <Eye className="w-6 h-6" />,
    description:
      "Proprietary forensic algorithms examine document integrity across multiple dimensions. Our analysis engine applies hundreds of verification checks simultaneously.",
    color: "purple",
  },
  {
    step: 3,
    title: "AI Assessment",
    icon: <Brain className="w-6 h-6" />,
    description:
      "Advanced machine learning models trained on thousands of verified documents evaluate authenticity patterns and generate confidence scores.",
    color: "indigo",
  },
  {
    step: 4,
    title: "Expert Validation",
    icon: <Users className="w-6 h-6" />,
    description:
      "Edge cases are escalated to qualified immigration professionals who review AI findings and provide definitive assessments.",
    color: "green",
  },
];

const colorMap: Record<string, { bg: string; text: string; ring: string; darkBg: string }> = {
  blue: { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-500", darkBg: "dark:bg-blue-900/30" },
  purple: { bg: "bg-purple-100", text: "text-purple-700", ring: "ring-purple-500", darkBg: "dark:bg-purple-900/30" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700", ring: "ring-indigo-500", darkBg: "dark:bg-indigo-900/30" },
  green: { bg: "bg-green-100", text: "text-green-700", ring: "ring-green-500", darkBg: "dark:bg-green-900/30" },
};

export default function Technology() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-12">
          <div className="inline-flex items-center px-4 py-2 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-800 dark:text-blue-200 text-sm font-medium mb-4">
            <Shield className="w-4 h-4 mr-2" />
            Enterprise-Grade Document Forensics
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Our Verification Technology
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Built by immigration and security experts, our multi-layer verification platform delivers institutional-grade document authentication trusted by professionals across the UK.
          </p>
        </div>

        <div className="grid gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-blue-600" />
                Multi-Layer Analysis Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Every document passes through a rigorous four-stage verification pipeline, combining automated forensic analysis with human expertise to deliver results you can trust.
              </p>
              <div className="space-y-4">
                {pipelineStages.map((stage, index) => {
                  const colors = colorMap[stage.color];
                  return (
                    <div key={stage.step} className="relative">
                      <div className={`flex items-start gap-4 p-5 rounded-xl border ${colors.bg} ${colors.darkBg} border-transparent`}>
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-bold text-lg ring-2 ${colors.ring}`}>
                          {stage.step}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {stage.icon}
                            <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{stage.title}</h3>
                          </div>
                          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{stage.description}</p>
                        </div>
                      </div>
                      {index < pipelineStages.length - 1 && (
                        <div className="flex justify-center my-1">
                          <ArrowRight className="w-5 h-5 text-gray-400 rotate-90" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Lock className="w-6 h-6 text-green-600" />
                Security & Privacy Architecture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Your documents are handled with the same level of security as financial institutions. We have implemented a zero-trust architecture that prioritises your privacy at every stage.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-green-600" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">Bank-Grade Encryption</h4>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">AES-256 encryption at rest and TLS 1.3 in transit. Your documents are protected with the same standards used by leading financial institutions.</p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileCheck className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">Zero-Storage Policy</h4>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Documents are permanently deleted from our servers immediately after processing. We retain only the verification result — never the original document.</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-purple-600" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">GDPR Compliant</h4>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Fully compliant with UK GDPR and Data Protection Act 2018. You have full control over your data with the right to erasure at any time.</p>
                </div>
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="w-5 h-5 text-amber-600" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">Verification Receipts</h4>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Every verification generates a timestamped receipt with a unique reference ID, providing a complete audit trail for your records and immigration submissions.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-purple-600" />
                Human-in-the-Loop (HITL) Learning
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                What sets our platform apart is the continuous feedback loop between AI and human expertise. This is not a static model — it learns and improves with every verification.
              </p>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6">
                <div className="grid md:grid-cols-3 gap-6 text-center">
                  <div>
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-800 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Brain className="w-6 h-6 text-purple-600 dark:text-purple-300" />
                    </div>
                    <p className="font-semibold text-purple-700 dark:text-purple-300">AI Processes</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Documents are analysed by our AI engine which flags confidence levels</p>
                  </div>
                  <div>
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-blue-600 dark:text-blue-300" />
                    </div>
                    <p className="font-semibold text-blue-700 dark:text-blue-300">Experts Review</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Immigration professionals review edge cases and provide corrections</p>
                  </div>
                  <div>
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Zap className="w-6 h-6 text-green-600 dark:text-green-300" />
                    </div>
                    <p className="font-semibold text-green-700 dark:text-green-300">AI Improves</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Expert corrections are fed back to train and refine the model continuously</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                This feedback loop ensures our system adapts to emerging fraud techniques and maintains industry-leading accuracy rates.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Server className="w-6 h-6 text-indigo-600" />
                Multi-AI Provider Redundancy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Our platform is architected for maximum reliability with automatic failover across multiple independent AI providers, ensuring your verifications are never interrupted.
              </p>
              <div className="flex flex-col md:flex-row items-center gap-3 justify-center">
                <div className="flex-1 max-w-[200px] p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center border-2 border-blue-500">
                  <p className="font-bold text-blue-700 dark:text-blue-300">Primary</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Main AI Engine</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 rotate-90 md:rotate-0 flex-shrink-0" />
                <div className="flex-1 max-w-[200px] p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center border-2 border-purple-400">
                  <p className="font-bold text-purple-700 dark:text-purple-300">Secondary</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Automatic Failover</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 rotate-90 md:rotate-0 flex-shrink-0" />
                <div className="flex-1 max-w-[200px] p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-center border-2 border-indigo-400">
                  <p className="font-bold text-indigo-700 dark:text-indigo-300">Tertiary</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Emergency Backup</p>
                </div>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600">99.99%</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Uptime Guarantee — no single point of failure</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Eye className="w-6 h-6 text-amber-600" />
                Explainable AI Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                We believe you deserve to understand the reasoning behind every verification decision. Our system provides full transparency into its analysis process.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Every verification includes a detailed breakdown of individual checks performed</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Confidence scoring shows the strength of each finding on a clear scale</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Plain-language explanations help you understand why a document was flagged or verified</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Risk indicators are categorised by severity so you can prioritise your next steps</span>
                </li>
              </ul>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>No black boxes.</strong> Unlike other verification tools, we show you exactly what was checked and why. Full transparency builds the trust you need when making critical immigration decisions.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Building2 className="w-6 h-6 text-blue-600" />
                Enterprise & B2B Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Our verification technology is available via a RESTful API, enabling seamless integration into your existing workflows and platforms.
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <Building2 className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="font-semibold text-gray-900 dark:text-white">Immigration Consultancies</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Bulk verification for client portfolios</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                  <Award className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <p className="font-semibold text-gray-900 dark:text-white">Law Firms</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Due diligence and compliance checks</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <Users className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="font-semibold text-gray-900 dark:text-white">HR Platforms</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Right-to-work verification at scale</p>
                </div>
              </div>
              <div className="text-center">
                <Link href="/api-docs">
                  <Button variant="outline" className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    View API Documentation
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Award className="w-6 h-6 text-yellow-600" />
                Platform Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <p className="text-3xl md:text-4xl font-bold text-blue-600">99.8%</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Detection Accuracy</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl md:text-4xl font-bold text-green-600">&lt;3s</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Processing Time</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl md:text-4xl font-bold text-purple-600">24/7</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Availability</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl md:text-4xl font-bold text-indigo-600">10,000+</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Documents Verified</p>
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
  );
}
