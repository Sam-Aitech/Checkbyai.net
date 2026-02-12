import { Link } from "wouter";
import { Shield, FileText, CheckCircle, ArrowLeft, AlertCircle, Info, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageLayout from "@/components/PageLayout";
import SEOHead from "@/components/SEOHead";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

const spring = { type: "spring" as const, stiffness: 100, damping: 15 };

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

export default function COSGuide() {
  const [headerRef, headerInView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <PageLayout>
      <SEOHead
        title="Certificate of Sponsorship Guide | UK Skilled Worker Visa | Check By AI"
        description="Complete guide to UK Certificate of Sponsorship documents. Learn what a CoS is, how to verify it, and what to check before applying for your Skilled Worker visa."
        keywords="certificate of sponsorship guide, UK CoS explained, skilled worker visa CoS, UK sponsor licence, CoS reference number"
        canonicalUrl="https://checkbyai.net/cos-guide"
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
                  "name": "CoS Guide",
                  "item": "https://checkbyai.net/cos-guide"
                }
              ]
            },
            {
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "How long is a CoS valid?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "A Certificate of Sponsorship is valid for 3 months from the date it's assigned. You must submit your visa application within this period."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Can I verify my CoS reference number?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "The Home Office verifies the CoS reference number during your visa application. However, you can check if your sponsor is a licensed sponsor on the official UK government website."
                  }
                },
                {
                  "@type": "Question",
                  "name": "What if my CoS has errors?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "If there are errors on your CoS, contact your employer immediately. They may need to withdraw the incorrect CoS and issue a new one with the correct information."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Why should I verify my CoS document?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Verifying your CoS helps ensure the document you received hasn't been tampered with. Submitting a fraudulent CoS can result in visa refusal and a ban from future UK applications."
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
            <span className="editorial-caption brutalist-border rounded-sm px-3 py-1.5 inline-flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4" />
              UK Immigration Guide
            </span>
            <h1 className="editorial-heading text-5xl md:text-6xl text-foreground mb-4">
              Certificate of Sponsorship Guide
            </h1>
            <p className="text-muted-foreground editorial-body text-xl max-w-2xl mx-auto">
              Everything you need to know about UK CoS documents for Skilled Worker visas
            </p>
          </motion.div>

          <div className="grid gap-8 mb-12">
            <AnimatedCard index={0}>
              <div className="brutalist-border rounded-sm bg-card overflow-hidden">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <Info className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">What is a Certificate of Sponsorship?</h2>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    A Certificate of Sponsorship (CoS) is an electronic record, not a physical document, assigned by a UK employer to a worker they want to sponsor for a Skilled Worker visa.
                  </p>
                  <div className="bg-muted/50 brutalist-border rounded-sm p-4">
                    <p className="text-foreground text-sm">
                      <strong>Important:</strong> The CoS contains a unique reference number that you'll need when applying for your visa. Your employer must be a licensed sponsor to issue a CoS.
                    </p>
                  </div>
                </div>
              </div>
            </AnimatedCard>

            <AnimatedCard index={1}>
              <div className="brutalist-border rounded-sm bg-card overflow-hidden">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">What Should a Genuine CoS Contain?</h2>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-foreground font-semibold">CoS Reference Number</span>
                        <p className="text-muted-foreground text-sm">A unique alphanumeric code assigned by the Home Office</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-foreground font-semibold">Sponsor Details</span>
                        <p className="text-muted-foreground text-sm">Company name, licence number, and contact information</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-foreground font-semibold">Job Details</span>
                        <p className="text-muted-foreground text-sm">Job title, SOC code, salary, and working hours</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-foreground font-semibold">Personal Information</span>
                        <p className="text-muted-foreground text-sm">Your name, date of birth, and nationality</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-foreground font-semibold">Start Date</span>
                        <p className="text-muted-foreground text-sm">When your employment is expected to begin</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </AnimatedCard>

            <AnimatedCard index={2}>
              <div className="brutalist-border rounded-sm bg-card overflow-hidden">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Warning Signs of a Fake CoS</h2>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <span className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                      <span className="text-foreground">Document was created using image editing software (Photoshop, GIMP, etc.)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                      <span className="text-foreground">Modification date is before the creation date</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                      <span className="text-foreground">Contains editing history showing multiple modifications</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                      <span className="text-foreground">Inconsistent fonts or formatting</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                      <span className="text-foreground">Sponsor licence number doesn't match official records</span>
                    </li>
                  </ul>
                </div>
              </div>
            </AnimatedCard>

            <AnimatedCard index={3}>
              <div className="brutalist-border rounded-sm bg-card overflow-hidden">
                <div className="p-6 border-b brutalist-border flex items-center gap-3">
                  <HelpCircle className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Frequently Asked Questions</h2>
                </div>
                <div className="p-6">
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1">
                      <AccordionTrigger>How long is a CoS valid?</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground editorial-body">
                        A Certificate of Sponsorship is valid for 3 months from the date it's assigned. You must submit your visa application within this period.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2">
                      <AccordionTrigger>Can I verify my CoS reference number?</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground editorial-body">
                        The Home Office verifies the CoS reference number during your visa application. However, you can check if your sponsor is a licensed sponsor on the official UK government website.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-3">
                      <AccordionTrigger>What if my CoS has errors?</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground editorial-body">
                        If there are errors on your CoS, contact your employer immediately. They may need to withdraw the incorrect CoS and issue a new one with the correct information.
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-4">
                      <AccordionTrigger>Why should I verify my CoS document?</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground editorial-body">
                        Verifying your CoS helps ensure the document you received hasn't been tampered with. Submitting a fraudulent CoS can result in visa refusal and a ban from future UK applications.
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            </AnimatedCard>
          </div>

          <div className="text-center">
            <Link href="/dashboard">
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center justify-center px-8 py-3 text-base font-medium bg-foreground text-background hover:bg-foreground/90 rounded-sm transition-colors"
              >
                <Shield className="w-5 h-5 mr-2" />
                Verify Your CoS Now
              </motion.button>
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
