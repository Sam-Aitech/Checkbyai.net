import { Link } from "wouter";
import { Shield, Brain, Zap, Lock, CheckCircle, ArrowLeft, FileSearch, AlertTriangle, Award, MessageCircle, Briefcase, Users, PoundSterling, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

interface RedFlagCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  severity: "critical" | "high";
  index: number;
}

function RedFlagCard({ icon, title, description, severity, index }: RedFlagCardProps) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ ...spring, delay: index * 0.08 }}
    >
      <div className={`brutalist-border rounded-sm p-6 grain relative overflow-hidden ${
        severity === "critical"
          ? "border-l-2 border-l-destructive"
          : "border-l-2 border-l-amber-500"
      }`}>
        <div className="flex items-start gap-4">
          <div className="brutalist-border-strong rounded-sm w-10 h-10 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-bold text-foreground">{title}</h3>
              <span className={`editorial-caption px-2 py-0.5 rounded-sm ${
                severity === "critical"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}>
                {severity === "critical" ? "HIGH RISK" : "WARNING"}
              </span>
            </div>
            <p className="text-muted-foreground text-sm editorial-body">{description}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function AIGuide() {
  const [headerRef, headerInView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [alertRef, alertInView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [ctaRef, ctaInView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [card1Ref, card1InView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [card2Ref, card2InView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [card3Ref, card3InView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [card4Ref, card4InView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [sectionRef, sectionInView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [bottomRef, bottomInView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <PageLayout>
      <SEOHead
        title="AI Guide - Protect Yourself from CoS Fraud | Check By AI"
        description="Learn how to identify fake Certificate of Sponsorship documents before verification. Spot red flags, common scams, and protect yourself from UK visa fraud."
        keywords="CoS fraud detection, fake certificate of sponsorship, UK visa scam warning, CoS red flags, immigration fraud prevention"
        canonicalUrl="https://checkbyai.net/ai-guide"
      />
      <div className="bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <motion.div
            ref={headerRef}
            initial={{ opacity: 0, y: 32 }}
            animate={headerInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
            transition={spring}
            className="text-center mb-12"
          >
            <span className="editorial-caption brutalist-border rounded-sm px-3 py-1.5 inline-flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4" />
              AI-Powered Protection
            </span>
            <h1 className="editorial-heading text-5xl md:text-6xl text-foreground mb-4">
              Protect Yourself from CoS Fraud
            </h1>
            <p className="text-muted-foreground editorial-body text-xl max-w-2xl mx-auto">
              Learn how to identify warning signs before uploading your Certificate of Sponsorship for verification
            </p>
          </motion.div>

          <div className="mb-12">
            <motion.div
              ref={alertRef}
              initial={{ opacity: 0, y: 24 }}
              animate={alertInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={spring}
              className="brutalist-border rounded-sm border-l-2 border-l-destructive bg-destructive/5 p-6 mb-6"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <div className="editorial-subheading text-destructive text-lg mb-2">
                    Before You Verify - Check These Red Flags First
                  </div>
                  <div className="text-muted-foreground text-sm">
                    If you notice ANY of the following warning signs, your CoS may be fraudulent.
                    Do NOT proceed with your visa application until you have verified the authenticity of your documents.
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="grid gap-4 mb-6">
              <RedFlagCard
                icon={<MessageCircle className="w-5 h-5" />}
                title="Received CoS Documents via WhatsApp"
                description="Legitimate UK sponsors send official documents through secure email or employer portals. If your Certificate of Sponsorship arrived via WhatsApp, Telegram, or other messaging apps, this is a major warning sign. Official sponsors never share sensitive immigration documents through social media or messaging platforms."
                severity="critical"
                index={0}
              />

              <RedFlagCard
                icon={<Briefcase className="w-5 h-5" />}
                title="Unsolicited Offer Letter from Unknown Company"
                description="If you received a job offer and CoS from a company you never applied to or interviewed with, be extremely cautious. Fraudsters often pose as legitimate UK employers to scam visa applicants. Always verify the company exists on the official Home Office register of licensed sponsors."
                severity="critical"
                index={1}
              />

              <RedFlagCard
                icon={<Users className="w-5 h-5" />}
                title="No Proper Interview Process"
                description="Genuine UK employers conduct thorough interviews before sponsoring a worker. If you were offered a Skilled Worker visa without any interview, or only had a brief informal chat, this is highly suspicious. Real sponsorship requires proper recruitment processes."
                severity="high"
                index={2}
              />

              <RedFlagCard
                icon={<PoundSterling className="w-5 h-5" />}
                title="Company Asking You for Money"
                description="UK employers should NEVER ask applicants to pay for their own sponsorship. If the company is requesting payment for the CoS, sponsor licence fees, or 'processing fees', this is fraud. Legitimate sponsors cover these costs as part of the employment process."
                severity="critical"
                index={3}
              />

              <RedFlagCard
                icon={<CreditCard className="w-5 h-5" />}
                title="Asked to Pay Immigration Skills Charge (ISC)"
                description="The Immigration Skills Charge is paid by the sponsor, NOT the worker. If anyone asks you to pay the ISC (which can be thousands of pounds), you are likely dealing with scammers. This charge is legally the employer's responsibility and cannot be passed to the employee."
                severity="critical"
                index={4}
              />
            </div>

            <motion.div
              ref={ctaRef}
              initial={{ opacity: 0, y: 24 }}
              animate={ctaInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={spring}
              className="bg-muted brutalist-border rounded-sm p-8 text-center"
            >
              <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="editorial-subheading text-foreground text-xl mb-2">
                Spotted a Red Flag?
              </h3>
              <p className="text-muted-foreground mb-4 max-w-xl mx-auto">
                If any of the above applies to your situation, do NOT proceed with your visa application.
                Upload your document for verification, or seek advice from a registered immigration adviser before taking any action.
              </p>
              <Link href="/dashboard">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  className="bg-foreground text-background hover:bg-foreground/90 rounded-sm px-6 py-3 font-medium inline-flex items-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  Verify Your Document Now
                </motion.button>
              </Link>
            </motion.div>
          </div>

          <motion.div
            ref={sectionRef}
            initial={{ opacity: 0, y: 32 }}
            animate={sectionInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
            transition={spring}
            className="text-center mb-8"
          >
            <h2 className="editorial-subheading text-3xl text-foreground mb-2">
              How Our AI Protects You
            </h2>
            <p className="text-muted-foreground editorial-body">
              Our proprietary verification technology analyses documents using methods developed with UK immigration experts
            </p>
          </motion.div>

          <div className="grid gap-8 mb-12">
            <motion.div
              ref={card1Ref}
              initial={{ opacity: 0, y: 24 }}
              animate={card1InView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={spring}
            >
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <FileSearch className="w-6 h-6 text-foreground" />
                  <h3 className="editorial-subheading text-foreground">Advanced Document Analysis</h3>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    Our AI examines your document using proprietary methods to determine authenticity:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">Compares against verified genuine document patterns</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">Identifies inconsistencies that indicate tampering</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">Analyses document structure and formatting</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">Cross-references with known fraud indicators</span>
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>

            <motion.div
              ref={card2Ref}
              initial={{ opacity: 0, y: 24 }}
              animate={card2InView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={spring}
            >
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-foreground" />
                  <h3 className="editorial-subheading text-foreground">Fraud Detection Capabilities</h3>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    Our system is trained to detect various types of document fraud:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                      <span className="text-foreground">Documents that have been digitally altered or edited</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                      <span className="text-foreground">Fake CoS documents created from scratch</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                      <span className="text-foreground">Documents with modified personal or employer details</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                      <span className="text-foreground">Inconsistencies that don't match official formats</span>
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>

            <motion.div
              ref={card3Ref}
              initial={{ opacity: 0, y: 24 }}
              animate={card3InView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={spring}
            >
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Brain className="w-6 h-6 text-foreground" />
                  <h3 className="editorial-subheading text-foreground">Continuous Learning System</h3>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    Our AI continuously improves through expert feedback:
                  </p>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-muted/50 brutalist-border rounded-sm p-4 text-center">
                      <p className="text-foreground font-semibold">Expert Review</p>
                      <p className="text-muted-foreground text-sm">Human oversight</p>
                    </div>
                    <div className="bg-muted/50 brutalist-border rounded-sm p-4 text-center">
                      <p className="text-foreground font-semibold">Pattern Updates</p>
                      <p className="text-muted-foreground text-sm">Regular improvements</p>
                    </div>
                    <div className="bg-muted/50 brutalist-border rounded-sm p-4 text-center">
                      <p className="text-foreground font-semibold">New Fraud Detection</p>
                      <p className="text-muted-foreground text-sm">Emerging threats</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              ref={card4Ref}
              initial={{ opacity: 0, y: 24 }}
              animate={card4InView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={spring}
            >
              <div className="brutalist-border rounded-sm bg-card">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Award className="w-6 h-6 text-foreground" />
                  <h3 className="editorial-subheading text-foreground">Accuracy & Reliability</h3>
                </div>
                <div className="p-6">
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <p className="text-foreground editorial-heading text-4xl">99.8%</p>
                      <p className="text-muted-foreground editorial-caption mt-1">Detection Accuracy</p>
                    </div>
                    <div className="text-center">
                      <p className="text-foreground editorial-heading text-4xl">&lt;3s</p>
                      <p className="text-muted-foreground editorial-caption mt-1">Average Processing</p>
                    </div>
                    <div className="text-center">
                      <p className="text-foreground editorial-heading text-4xl">24/7</p>
                      <p className="text-muted-foreground editorial-caption mt-1">Availability</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <motion.div
            ref={bottomRef}
            initial={{ opacity: 0, y: 24 }}
            animate={bottomInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            transition={spring}
            className="text-center"
          >
            <Link href="/dashboard">
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="bg-foreground text-background hover:bg-foreground/90 rounded-sm px-8 py-4 text-lg font-medium inline-flex items-center gap-2"
              >
                <Shield className="w-5 h-5" />
                Verify Your Document Now
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </div>
    </PageLayout>
  );
}
