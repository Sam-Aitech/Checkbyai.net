import { Link } from "wouter";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { spring, fadeUp } from "@/lib/animations";
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
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";

const pipelineStages = [
  {
    step: 1,
    title: "Document Intake",
    icon: <FileSearch className="w-6 h-6" />,
    description:
      "Secure upload with automatic format detection and preliminary validation. Documents are encrypted in transit using TLS 1.3 protocols.",
  },
  {
    step: 2,
    title: "Forensic Analysis",
    icon: <Eye className="w-6 h-6" />,
    description:
      "Proprietary forensic algorithms examine document integrity across multiple dimensions. Our analysis engine applies hundreds of verification checks simultaneously.",
  },
  {
    step: 3,
    title: "AI Assessment",
    icon: <Brain className="w-6 h-6" />,
    description:
      "Advanced machine learning models trained on thousands of verified documents evaluate authenticity patterns and generate confidence scores.",
  },
  {
    step: 4,
    title: "Expert Validation",
    icon: <Users className="w-6 h-6" />,
    description:
      "Edge cases are escalated to qualified immigration professionals who review AI findings and provide definitive assessments.",
  },
];

function ScrollSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 });
  return (
    <motion.div
      ref={ref}
      initial={fadeUp.initial}
      animate={inView ? fadeUp.animate : fadeUp.initial}
      transition={spring}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function Technology() {
  const [statsRef, statsInView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <PageLayout>
      <SEOHead
        title="Verification Technology | AI Document Forensics | Check By AI"
        description="Discover how Check By AI uses advanced forensic analysis, machine learning, and multi-layer verification to detect fake Certificate of Sponsorship documents."
        keywords="document forensics technology, AI verification, PDF metadata analysis, document authenticity detection, forensic document analysis"
        canonicalUrl="https://checkbyai.net/technology"
        structuredData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "position": 1,
                  "name": "Home",
                  "item": "https://checkbyai.net"
                },
                {
                  "@type": "ListItem",
                  "position": 2,
                  "name": "Technology",
                  "item": "https://checkbyai.net/technology"
                }
              ]
            },
            {
              "@type": "TechArticle",
              "name": "Verification Technology | AI Document Forensics",
              "description": "Discover how Check By AI uses advanced forensic analysis, machine learning, and multi-layer verification to detect fake Certificate of Sponsorship documents.",
              "author": {
                "@type": "Organization",
                "name": "Check By AI",
                "url": "https://checkbyai.net"
              },
              "datePublished": "2025-01-01",
              "publisher": {
                "@type": "Organization",
                "name": "Check By AI",
                "url": "https://checkbyai.net"
              }
            }
          ]
        }}
      />
      <div className="bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <span className="inline-flex items-center px-4 py-2 brutalist-border rounded-sm editorial-caption text-foreground mb-4">
              <Shield className="w-4 h-4 mr-2" />
              Enterprise-Grade Document Forensics
            </span>
            <h1 className="editorial-heading text-5xl md:text-6xl text-foreground mb-4">
              Our Verification Technology
            </h1>
            <p className="text-xl text-muted-foreground editorial-body max-w-2xl mx-auto">
              Built by immigration and security experts, our multi-layer verification platform delivers institutional-grade document authentication trusted by professionals across the UK.
            </p>
          </div>

          <div className="grid gap-8 mb-12">
            <ScrollSection>
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Activity className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Multi-Layer Analysis Pipeline</h2>
                </div>
                <div className="p-6">
                  <p className="text-muted-foreground editorial-body mb-6">
                    Every document passes through a rigorous four-stage verification pipeline, combining automated forensic analysis with human expertise to deliver results you can trust.
                  </p>
                  <div className="space-y-4">
                    {pipelineStages.map((stage, index) => (
                      <div key={stage.step} className="relative">
                        <div className="flex items-start gap-4 brutalist-border rounded-sm p-5">
                          <div className="flex-shrink-0 w-10 h-10 brutalist-border-strong rounded-sm flex items-center justify-center font-bold text-foreground">
                            {stage.step}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {stage.icon}
                              <h3 className="editorial-subheading text-foreground text-lg">{stage.title}</h3>
                            </div>
                            <p className="text-muted-foreground text-sm editorial-body">{stage.description}</p>
                          </div>
                        </div>
                        {index < pipelineStages.length - 1 && (
                          <div className="flex justify-center my-1">
                            <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollSection>

            <ScrollSection>
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Lock className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Security & Privacy Architecture</h2>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    Your documents are handled with the same level of security as financial institutions. We have implemented a zero-trust architecture that prioritises your privacy at every stage.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-muted/50 brutalist-border rounded-sm p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-5 h-5 text-foreground" />
                        <h4 className="font-semibold text-foreground">Bank-Grade Encryption</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">AES-256 encryption at rest and TLS 1.3 in transit. Your documents are protected with the same standards used by leading financial institutions.</p>
                    </div>
                    <div className="bg-muted/50 brutalist-border rounded-sm p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <FileCheck className="w-5 h-5 text-foreground" />
                        <h4 className="font-semibold text-foreground">Zero-Storage Policy</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">Documents are permanently deleted from our servers immediately after processing. We retain only the verification result, never the original document.</p>
                    </div>
                    <div className="bg-muted/50 brutalist-border rounded-sm p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-foreground" />
                        <h4 className="font-semibold text-foreground">UK GDPR and Data Protection Act 2018</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">Fully compliant with UK GDPR and the Data Protection Act 2018. We process document metadata only, never the full document content. Free users: results are removed when you leave the site, with a 24 hour cooldown. Paid account holders: only verification results are saved, never original documents. You have full control over your data with the right to erasure at any time.</p>
                    </div>
                    <div className="bg-muted/50 brutalist-border rounded-sm p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <Award className="w-5 h-5 text-foreground" />
                        <h4 className="font-semibold text-foreground">Verification Receipts</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">Every verification generates a timestamped receipt with a unique reference ID, providing a complete audit trail for your records and immigration submissions.</p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollSection>

            <ScrollSection>
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Brain className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Human-in-the-Loop (HITL) Learning</h2>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    What sets our platform apart is the continuous feedback loop between AI and human expertise. This is not a static model: it learns and improves with every verification.
                  </p>
                  <div className="bg-muted/50 brutalist-border rounded-sm p-6">
                    <div className="grid md:grid-cols-3 gap-6 text-center">
                      <div>
                        <div className="w-12 h-12 brutalist-border-strong rounded-sm flex items-center justify-center mx-auto mb-3">
                          <Brain className="w-6 h-6 text-foreground" />
                        </div>
                        <p className="font-semibold text-foreground">AI Processes</p>
                        <p className="text-sm text-muted-foreground mt-1">Documents are analysed by our AI engine which flags confidence levels</p>
                      </div>
                      <div>
                        <div className="w-12 h-12 brutalist-border-strong rounded-sm flex items-center justify-center mx-auto mb-3">
                          <Users className="w-6 h-6 text-foreground" />
                        </div>
                        <p className="font-semibold text-foreground">Experts Review</p>
                        <p className="text-sm text-muted-foreground mt-1">Immigration professionals review edge cases and provide corrections</p>
                      </div>
                      <div>
                        <div className="w-12 h-12 brutalist-border-strong rounded-sm flex items-center justify-center mx-auto mb-3">
                          <Zap className="w-6 h-6 text-foreground" />
                        </div>
                        <p className="font-semibold text-foreground">AI Improves</p>
                        <p className="text-sm text-muted-foreground mt-1">Expert corrections are fed back to train and refine the model continuously</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground italic editorial-body">
                    This feedback loop ensures our system adapts to emerging fraud techniques and maintains industry-leading accuracy rates.
                  </p>
                </div>
              </div>
            </ScrollSection>

            <ScrollSection>
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Server className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Multi-AI Provider Redundancy</h2>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    Our platform is architected for maximum reliability with automatic failover across multiple independent AI providers, ensuring your verifications are never interrupted.
                  </p>
                  <div className="flex flex-col md:flex-row items-center gap-3 justify-center">
                    <div className="flex-1 max-w-[200px] p-4 brutalist-border-strong rounded-sm text-center">
                      <p className="editorial-caption text-foreground">Primary</p>
                      <p className="text-xs text-muted-foreground mt-1">Main AI Engine</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 md:rotate-0 flex-shrink-0" />
                    <div className="flex-1 max-w-[200px] p-4 brutalist-border-strong rounded-sm text-center">
                      <p className="editorial-caption text-foreground">Secondary</p>
                      <p className="text-xs text-muted-foreground mt-1">Automatic Failover</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 md:rotate-0 flex-shrink-0" />
                    <div className="flex-1 max-w-[200px] p-4 brutalist-border-strong rounded-sm text-center">
                      <p className="editorial-caption text-foreground">Tertiary</p>
                      <p className="text-xs text-muted-foreground mt-1">Emergency Backup</p>
                    </div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 brutalist-border rounded-sm">
                    <p className="editorial-heading text-2xl text-foreground">99.99%</p>
                    <p className="text-sm text-muted-foreground">Uptime Guarantee, no single point of failure</p>
                  </div>
                </div>
              </div>
            </ScrollSection>

            <ScrollSection>
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Eye className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Explainable AI Results</h2>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    We believe you deserve to understand the reasoning behind every verification decision. Our system provides full transparency into its analysis process.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Every verification includes a detailed breakdown of individual checks performed</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Confidence scoring shows the strength of each finding on a clear scale</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Plain-language explanations help you understand why a document was flagged or verified</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Risk indicators are categorised by severity so you can prioritise your next steps</span>
                    </li>
                  </ul>
                  <div className="bg-muted/50 brutalist-border rounded-sm p-4">
                    <p className="text-sm text-foreground">
                      <strong>No black boxes.</strong> Unlike other verification tools, we show you exactly what was checked and why. Full transparency builds the trust you need when making critical immigration decisions.
                    </p>
                  </div>
                </div>
              </div>
            </ScrollSection>

            <ScrollSection>
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Building2 className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Enterprise & B2B Integration</h2>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    Our verification technology is available via a RESTful API, enabling seamless integration into your existing workflows and platforms.
                  </p>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-muted/50 brutalist-border rounded-sm p-5 text-center">
                      <Building2 className="w-8 h-8 text-foreground mx-auto mb-2" />
                      <p className="font-semibold text-foreground">Immigration Consultancies</p>
                      <p className="text-sm text-muted-foreground">Bulk verification for client portfolios</p>
                    </div>
                    <div className="bg-muted/50 brutalist-border rounded-sm p-5 text-center">
                      <Award className="w-8 h-8 text-foreground mx-auto mb-2" />
                      <p className="font-semibold text-foreground">Law Firms</p>
                      <p className="text-sm text-muted-foreground">Due diligence and compliance checks</p>
                    </div>
                    <div className="bg-muted/50 brutalist-border rounded-sm p-5 text-center">
                      <Users className="w-8 h-8 text-foreground mx-auto mb-2" />
                      <p className="font-semibold text-foreground">HR Platforms</p>
                      <p className="text-sm text-muted-foreground">Right-to-work verification at scale</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <Link href="/api-docs">
                      <Button variant="outline" className="brutalist-border text-foreground hover:bg-muted rounded-sm">
                        View API Documentation
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </ScrollSection>

            <ScrollSection>
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Award className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Platform Performance</h2>
                </div>
                <div className="p-6">
                  <div ref={statsRef} className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                      { value: "99.8%", label: "Detection Accuracy" },
                      { value: "<3s", label: "Processing Time" },
                      { value: "24/7", label: "Availability" },
                      { value: "10,000+", label: "Documents Verified" },
                    ].map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 24 }}
                        animate={statsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
                        transition={{ ...spring, delay: i * 0.1 }}
                        className="text-center"
                      >
                        <p className="editorial-heading text-3xl md:text-4xl text-foreground">{stat.value}</p>
                        <p className="editorial-caption text-muted-foreground mt-1">{stat.label}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollSection>
          </div>

          <div className="text-center">
            <Link href="/dashboard">
              <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90 rounded-sm">
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
