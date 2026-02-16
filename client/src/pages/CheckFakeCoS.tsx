import { Link } from "wouter";
import { Shield, AlertTriangle, FileSearch, Eye, Clock, FileText, ArrowRight, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { spring, fadeUp } from "@/lib/animations";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";

function ScrollSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 });
  return (
    <motion.div
      ref={ref}
      initial={fadeUp.initial}
      animate={inView ? fadeUp.animate : fadeUp.initial}
      transition={{ ...spring, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const signs = [
  {
    number: 1,
    icon: <Shield className="w-6 h-6 text-foreground" />,
    title: "The sponsor isn't on the official register",
    description:
      "Every legitimate UK employer who can issue a Certificate of Sponsorship must hold an active sponsor licence listed on the official Home Office register. If the company name on your CoS does not appear on the government's published list of licensed sponsors, this is the single strongest indicator that your document is fraudulent. You can search the register directly on gov.uk, or use our free Sponsor Monitor tool to check instantly.",
  },
  {
    number: 2,
    icon: <FileSearch className="w-6 h-6 text-foreground" />,
    title: "Formatting inconsistencies",
    description:
      "Genuine CoS documents produced through official UKVI systems follow a consistent visual format. Fraudulent documents often contain subtle but telling differences: incorrect fonts, irregular spacing, misaligned fields, or layouts that don't match the standard template. If sections appear unevenly spaced, text sizes vary unexpectedly, or the overall layout looks unprofessional compared to verified examples, treat this as a serious warning sign.",
  },
  {
    number: 3,
    icon: <Eye className="w-6 h-6 text-foreground" />,
    title: "Suspicious metadata",
    description:
      "Every PDF carries hidden metadata that reveals how and where it was created. Genuine CoS documents are generated through UKVI's Sponsor Management System — not consumer software. If the metadata shows the PDF was created or edited using Microsoft Word, Adobe Photoshop, GIMP, or similar desktop applications, this strongly suggests the document was fabricated rather than generated through official channels.",
  },
  {
    number: 4,
    icon: <FileText className="w-6 h-6 text-foreground" />,
    title: "Incorrect or missing reference numbers",
    description:
      "Every genuine Certificate of Sponsorship is assigned a unique reference number that follows a specific alphanumeric pattern defined by the Home Office. If the reference number on your CoS is missing entirely, uses an incorrect format, or contains characters that don't conform to the established pattern, the document is very likely to be forged. A valid CoS reference number is essential for any successful visa application.",
  },
  {
    number: 5,
    icon: <Clock className="w-6 h-6 text-foreground" />,
    title: "Timeline doesn't add up",
    description:
      "Document timestamps can reveal tampering that the naked eye would miss. Watch for PDF creation dates that fall on weekends or public holidays when UKVI systems are unlikely to generate documents, modification dates that predate the creation date, or validity periods that don't align with standard Home Office processing timelines. Any logical inconsistency in the document's chronology should raise immediate concern.",
  },
];

export default function CheckFakeCoS() {
  const [headerRef, headerInView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <PageLayout>
      <SEOHead
        title="5 Signs Your Certificate of Sponsorship Might Be Fake | CheckByAI"
        description="How to spot a fake UK Certificate of Sponsorship. Learn the 5 warning signs of a fraudulent CoS document and what to do if you suspect yours isn't genuine."
        canonicalUrl="https://checkbyai.net/check-fake-cos"
        ogTitle="Is Your CoS Fake? 5 Warning Signs to Check Now"
        ogDescription="Don't risk your visa on a fake Certificate of Sponsorship. Learn how to spot the warning signs."
        keywords="fake certificate of sponsorship, fake CoS, how to check CoS genuine, fake visa documents UK, CoS scam, fake sponsor letter"
        breadcrumbs={[
          { name: "Home", url: "https://checkbyai.net" },
          { name: "Guides", url: "https://checkbyai.net/cos-guide" },
          { name: "Check Fake CoS", url: "https://checkbyai.net/check-fake-cos" },
        ]}
        structuredData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              "headline": "5 Signs Your Certificate of Sponsorship Might Be Fake",
              "description": "How to spot a fake UK Certificate of Sponsorship. Learn the 5 warning signs of a fraudulent CoS document and what to do if you suspect yours isn't genuine.",
              "author": {
                "@type": "Organization",
                "name": "CheckByAI",
                "url": "https://checkbyai.net",
              },
              "publisher": {
                "@type": "Organization",
                "name": "CheckByAI",
                "url": "https://checkbyai.net",
              },
              "datePublished": "2026-02-16",
              "mainEntityOfPage": "https://checkbyai.net/check-fake-cos",
            },
            {
              "@type": "HowTo",
              "name": "How to Check if Your Certificate of Sponsorship Is Fake",
              "step": [
                {
                  "@type": "HowToStep",
                  "position": 1,
                  "name": "Check the official sponsor register",
                  "text": "Verify that the sponsoring employer appears on the Home Office register of licensed sponsors on gov.uk.",
                },
                {
                  "@type": "HowToStep",
                  "position": 2,
                  "name": "Look for formatting inconsistencies",
                  "text": "Compare the document layout, fonts, and spacing against known genuine CoS documents for any irregularities.",
                },
                {
                  "@type": "HowToStep",
                  "position": 3,
                  "name": "Examine the PDF metadata",
                  "text": "Check whether the PDF was created using official UKVI systems or consumer software such as Word or Photoshop.",
                },
                {
                  "@type": "HowToStep",
                  "position": 4,
                  "name": "Verify the reference number format",
                  "text": "Ensure the CoS reference number is present and follows the correct alphanumeric pattern used by the Home Office.",
                },
                {
                  "@type": "HowToStep",
                  "position": 5,
                  "name": "Check the document timeline",
                  "text": "Verify that creation dates, modification dates, and validity periods are logically consistent and align with standard processing timelines.",
                },
              ],
            },
            {
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "How can I tell if my Certificate of Sponsorship is fake?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Look for five key warning signs: the sponsor not appearing on the official Home Office register, formatting inconsistencies compared to genuine documents, suspicious PDF metadata showing creation in consumer software, incorrect or missing reference numbers, and timeline inconsistencies in creation and modification dates.",
                  },
                },
                {
                  "@type": "Question",
                  "name": "What should I do if I think my CoS is fraudulent?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Do not submit a visa application using a suspected fraudulent CoS. Report the matter to Action Fraud (the UK's national fraud reporting centre), consult a registered OISC immigration adviser, and consider using a verification tool like CheckByAI to analyse the document before taking further action.",
                  },
                },
                {
                  "@type": "Question",
                  "name": "Can a fake CoS be used to apply for a UK visa?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Submitting a fraudulent Certificate of Sponsorship with a UK visa application is a serious offence. It can result in automatic visa refusal, a ban of up to 10 years from future UK immigration applications, and potential criminal prosecution under the Fraud Act 2006.",
                  },
                },
                {
                  "@type": "Question",
                  "name": "How does CheckByAI detect fake CoS documents?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "CheckByAI uses advanced AI-powered forensic analysis to examine PDF metadata, document structure, formatting patterns, reference number validity, and timeline consistency. The system compares your document against verified patterns from genuine CoS documents to identify signs of tampering or fabrication.",
                  },
                },
              ],
            },
          ],
        }}
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
            <span className="editorial-caption bg-destructive/10 text-destructive rounded-full px-3 py-1.5 inline-flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4" />
              Fraud Prevention Guide
            </span>
            <h1 className="editorial-heading text-5xl md:text-6xl text-foreground mb-4">
              5 Signs Your Certificate of Sponsorship Might Be Fake
            </h1>
            <p className="text-muted-foreground editorial-body text-xl max-w-2xl mx-auto">
              Protect yourself from CoS fraud — learn how to spot the warning signs before you risk your visa application
            </p>
          </motion.div>

          <ScrollSection className="mb-10">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-border shadow-sm p-6">
              <p className="text-muted-foreground editorial-body leading-relaxed">
                Fake Certificate of Sponsorship documents are a growing problem in UK immigration. Fraudsters target applicants who are unfamiliar with the visa process, selling fabricated or tampered CoS documents that can lead to automatic visa refusal and a potential ban from future applications. Whether you received your CoS through an agent, a recruiter, or directly from an employer, it is essential to verify its authenticity before submitting your Skilled Worker visa application. Below are the five most common warning signs that your CoS may not be genuine.
              </p>
            </div>
          </ScrollSection>

          <div className="grid gap-6 mb-12">
            {signs.map((sign, index) => (
              <ScrollSection key={sign.number} delay={index * 0.08}>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-border shadow-sm p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center font-bold text-foreground">
                      {sign.number}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {sign.icon}
                        <h2 className="editorial-subheading text-foreground text-lg">{sign.title}</h2>
                      </div>
                      <p className="text-muted-foreground editorial-body text-sm leading-relaxed">{sign.description}</p>
                    </div>
                  </div>
                </div>
              </ScrollSection>
            ))}
          </div>

          <ScrollSection className="mb-10">
            <div className="bg-muted border border-border rounded-xl p-8 text-center">
              <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
              <h2 className="editorial-subheading text-foreground text-2xl mb-2">
                Don't guess — verify your CoS
              </h2>
              <p className="text-muted-foreground editorial-body max-w-xl mx-auto mb-6">
                Our AI-powered verification tool analyses your Certificate of Sponsorship in seconds, checking metadata, formatting, reference numbers, and more — so you can apply for your visa with confidence.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/dashboard">
                  <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Verify Your CoS Now
                  </Button>
                </Link>
                <Link href="/sponsor-monitor">
                  <Button size="lg" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 rounded-full">
                    Check Sponsor Register
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </ScrollSection>

          <ScrollSection>
            <div className="text-center">
              <p className="text-xs text-muted-foreground editorial-body max-w-2xl mx-auto">
                This guide is for educational purposes only and does not constitute legal or immigration advice. CheckByAI is not affiliated with the UK Home Office or UKVI.
              </p>
            </div>
          </ScrollSection>
        </div>
      </div>
    </PageLayout>
  );
}