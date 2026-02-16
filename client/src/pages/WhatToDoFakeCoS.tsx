import { Link } from "wouter";
import { Shield, Phone, Scale, FileText, AlertCircle, ArrowRight, ExternalLink, CheckCircle, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

const steps = [
  {
    number: 1,
    title: "Don't use the document",
    icon: <AlertCircle className="w-6 h-6" />,
    description: "Using a fake CoS to apply for a visa is a criminal offence under UK immigration law. If you suspect the document is fraudulent, do not submit it to the Home Office or use it in any visa application. Stop immediately.",
  },
  {
    number: 2,
    title: "Report to Action Fraud",
    icon: <Phone className="w-6 h-6" />,
    description: "Call 0300 123 2040 or visit actionfraud.police.uk to report the fraud. Provide all details of the transaction, including how you found the seller, how much you paid, and any communications you had with them.",
  },
  {
    number: 3,
    title: "Contact an immigration solicitor",
    icon: <Scale className="w-6 h-6" />,
    description: "Get professional legal advice as soon as possible. The Law Society has a find-a-solicitor tool to help you locate a qualified immigration lawyer. An OISC-registered adviser can also help you understand your options and protect your immigration status.",
  },
  {
    number: 4,
    title: "Gather evidence",
    icon: <FileText className="w-6 h-6" />,
    description: "Save all communications, payment receipts, the document itself, and any correspondence with the seller. Screenshots of messages, emails, bank statements, and any advertising materials will be crucial for your fraud report and any legal proceedings.",
  },
  {
    number: 5,
    title: "Try to recover your money",
    icon: <Users className="w-6 h-6" />,
    description: "Report the transaction to your bank immediately and ask about a potential chargeback. If you paid by credit card, Section 75 of the Consumer Credit Act may provide protection for amounts over £100. Contact your card issuer to start a dispute.",
  },
  {
    number: 6,
    title: "Verify future documents",
    icon: <Shield className="w-6 h-6" />,
    description: "Use CheckByAI to verify any Certificate of Sponsorship before relying on it. Our AI-powered verification can detect signs of fraud and help you avoid falling victim again.",
  },
];

const resources = [
  {
    name: "Action Fraud",
    url: "https://www.actionfraud.police.uk",
    description: "UK's national reporting centre for fraud and cybercrime",
  },
  {
    name: "Law Society Find a Solicitor",
    url: "https://solicitors.lawsociety.org.uk",
    description: "Find a qualified immigration solicitor near you",
  },
  {
    name: "OISC",
    url: "https://www.gov.uk/government/organisations/office-of-the-immigration-services-commissioner",
    description: "Office of the Immigration Services Commissioner",
  },
  {
    name: "Citizens Advice",
    url: "https://www.citizensadvice.org.uk",
    description: "Free, confidential advice on legal and financial matters",
  },
];

function AnimatedCard({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ ...spring, delay: index * 0.1 }}
    >
      {children}
    </motion.div>
  );
}

export default function WhatToDoFakeCoS() {
  const [headerRef, headerInView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [resourcesRef, resourcesInView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [ctaRef, ctaInView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [disclaimerRef, disclaimerInView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <PageLayout>
      <SEOHead
        title="Bought a Fake CoS? Here's What To Do Next | CheckByAI"
        description="If you've paid for a fake Certificate of Sponsorship, act fast. Step-by-step guide: report to Action Fraud, contact an immigration solicitor, protect your visa status, and recover your money."
        canonicalUrl="https://checkbyai.net/what-to-do-fake-cos"
        ogTitle="Scammed With a Fake CoS? Your Step-by-Step Recovery Guide"
        ogDescription="Paid for a fraudulent Certificate of Sponsorship? Don't panic. Here's exactly what to do next."
        keywords="bought fake CoS, fake certificate of sponsorship scam, CoS fraud UK, visa scam recovery, report fake CoS, immigration fraud help"
        breadcrumbs={[
          { name: "Home", url: "https://checkbyai.net" },
          { name: "Guides", url: "https://checkbyai.net/cos-guide" },
          { name: "What To Do If You Bought a Fake CoS", url: "https://checkbyai.net/what-to-do-fake-cos" },
        ]}
        structuredData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              "headline": "Bought a Fake CoS? Here's What To Do Next | CheckByAI",
              "author": {
                "@type": "Organization",
                "name": "CheckByAI",
                "url": "https://checkbyai.net"
              },
              "datePublished": "2026-02-16",
              "publisher": {
                "@type": "Organization",
                "name": "CheckByAI",
                "url": "https://checkbyai.net"
              },
              "description": "If you've paid for a fake Certificate of Sponsorship, act fast. Step-by-step guide: report to Action Fraud, contact an immigration solicitor, protect your visa status, and recover your money."
            },
            {
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "What should I do if I bought a fake Certificate of Sponsorship?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Do not use the document. Report the fraud to Action Fraud on 0300 123 2040, contact an immigration solicitor immediately, gather all evidence of the transaction, and try to recover your money through your bank or credit card provider."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Can I get my money back after buying a fake CoS?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "You may be able to recover your money. Report the transaction to your bank for a potential chargeback. If you paid by credit card, Section 75 of the Consumer Credit Act may provide protection for amounts over £100. Act quickly for the best chance of recovery."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Will a fake CoS affect my immigration status?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "If you have not used the fake CoS in a visa application, your immigration status should not be affected. However, if you have already submitted it, contact an immigration solicitor immediately for advice on your specific situation."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How do I report a fake Certificate of Sponsorship?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Report to Action Fraud by calling 0300 123 2040 or visiting actionfraud.police.uk. Provide all details including the seller's information, payment records, and copies of the fraudulent document."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How can I verify a Certificate of Sponsorship is genuine?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Use CheckByAI's AI-powered verification tool to check any Certificate of Sponsorship for signs of fraud. You can also verify that the sponsoring employer is on the official Home Office register of licensed sponsors."
                  }
                }
              ]
            }
          ]
        }}
      />
      <div className="bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <motion.div
            ref={headerRef}
            initial={{ opacity: 0, y: 32 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={spring}
            className="text-center mb-12"
          >
            <span className="editorial-caption bg-primary/10 rounded-full px-3 py-1.5 inline-flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4" />
              Recovery Guide
            </span>
            <h1 className="editorial-heading text-5xl md:text-6xl text-foreground mb-4">
              What To Do If You've Bought a Fake Certificate of Sponsorship
            </h1>
            <p className="text-muted-foreground editorial-body text-xl max-w-2xl mx-auto">
              If you suspect you've paid for a fraudulent CoS, you're not alone. This is a growing problem, and there are clear steps you can take right now to protect yourself.
            </p>
          </motion.div>

          <div className="grid gap-6 mb-12">
            {steps.map((step, index) => (
              <AnimatedCard key={step.number} index={index}>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-border shadow-sm p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center font-bold text-lg text-foreground">
                      {step.number}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-foreground">{step.icon}</div>
                        <h2 className="editorial-subheading text-foreground text-lg">{step.title}</h2>
                      </div>
                      <p className="text-muted-foreground editorial-body">{step.description}</p>
                    </div>
                  </div>
                </div>
              </AnimatedCard>
            ))}
          </div>

          <motion.div
            ref={resourcesRef}
            initial={{ opacity: 0, y: 32 }}
            animate={resourcesInView ? { opacity: 1, y: 0 } : {}}
            transition={spring}
            className="mb-12"
          >
            <div className="theme-card bg-card overflow-hidden">
              <div className="p-6 border-b border-border flex items-center gap-3">
                <ExternalLink className="w-6 h-6 text-foreground" />
                <h2 className="editorial-subheading text-foreground">Important Resources</h2>
              </div>
              <div className="p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {resources.map((resource) => (
                    <a
                      key={resource.name}
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 p-4 bg-muted/50 border border-border rounded-xl hover:bg-muted transition-colors group"
                    >
                      <ExternalLink className="w-5 h-5 text-primary mt-0.5 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                      <div>
                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{resource.name}</p>
                        <p className="text-sm text-muted-foreground">{resource.description}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            ref={ctaRef}
            initial={{ opacity: 0, y: 32 }}
            animate={ctaInView ? { opacity: 1, y: 0 } : {}}
            transition={spring}
            className="bg-muted border border-border rounded-xl p-8 text-center mb-12"
          >
            <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="editorial-subheading text-foreground text-2xl mb-2">
              Verify your next Certificate of Sponsorship
            </h3>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto editorial-body">
              Don't let it happen again. Upload any CoS document for instant AI-powered verification.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/dashboard">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-8 py-3 font-medium inline-flex items-center gap-2"
                >
                  <Shield className="w-5 h-5" />
                  Verify a CoS Now
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </Link>
              <Link href="/check-fake-cos">
                <Button variant="outline" className="rounded-full px-8 py-3">
                  Learn the warning signs
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            ref={disclaimerRef}
            initial={{ opacity: 0, y: 24 }}
            animate={disclaimerInView ? { opacity: 1, y: 0 } : {}}
            transition={spring}
            className="bg-muted/50 border border-border rounded-xl p-6"
          >
            <p className="text-sm text-muted-foreground text-center editorial-body">
              This guide provides general information only and does not constitute legal advice. For advice specific to your situation, please consult a qualified immigration solicitor. CheckByAI is not affiliated with the UK Home Office, Action Fraud, or any government agency.
            </p>
          </motion.div>
        </div>
      </div>
    </PageLayout>
  );
}
