import { Link } from "wouter";
import { Shield, Target, Users, Lock, Eye, Heart, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { spring, fadeUp } from "@/lib/animations";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";

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

export default function About() {
  const [headerRef, headerInView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <PageLayout>
      <SEOHead
        title="About CheckByAI | Our Mission to Stop Visa Fraud"
        description="CheckByAI was built to protect visa applicants and employers from fake Certificates of Sponsorship. Learn about our mission, technology, and commitment to data privacy."
        canonicalUrl="https://checkbyai.net/about"
        ogTitle="About CheckByAI | Fighting Visa Document Fraud"
        ogDescription="We built CheckByAI because too many people were being scammed with fake visa documents. Learn about our mission."
        keywords="about CheckByAI, CoS verification company, visa fraud prevention, UK immigration technology"
        breadcrumbs={[
          { name: "Home", url: "https://checkbyai.net" },
          { name: "About Us", url: "https://checkbyai.net/about" },
        ]}
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
              About Us
            </span>
            <h1 className="editorial-heading text-5xl md:text-6xl text-foreground mb-4">
              Our Mission: Protecting People from Visa Fraud
            </h1>
            <p className="text-muted-foreground editorial-body text-xl max-w-2xl mx-auto">
              CheckByAI was created because too many people were losing money and risking their immigration status to fraudsters selling fake Certificates of Sponsorship. We built the technology to fight back.
            </p>
          </motion.div>

          <div className="grid gap-8 mb-12">
            <ScrollSection>
              <div className="theme-card bg-card">
                <div className="p-6 border-b border-border flex items-center gap-3">
                  <Target className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Why We Exist</h2>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-muted-foreground editorial-body">
                    Certificate of Sponsorship fraud is a growing crisis in the UK immigration system. Every year, thousands of people pay for what they believe is a genuine job offer and CoS, only to discover the documents are fake. By the time they realise, they have lost thousands of pounds and their immigration status is at serious risk.
                  </p>
                  <p className="text-muted-foreground editorial-body">
                    Victims are left financially devastated and legally vulnerable. A fraudulent CoS can lead to visa refusal, deportation, and a ban from future UK applications. The emotional toll on individuals and families is immense, and the consequences can last for years.
                  </p>
                  <p className="text-muted-foreground editorial-body">
                    Despite the scale of this problem, there were no accessible tools available to help ordinary people verify their documents before submitting a visa application. The official Home Office register is difficult to navigate, and there was no way to check whether a CoS document itself had been tampered with. We built CheckByAI to close that gap.
                  </p>
                </div>
              </div>
            </ScrollSection>

            <ScrollSection>
              <div className="theme-card bg-card">
                <div className="p-6 border-b border-border flex items-center gap-3">
                  <Heart className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">What We Do</h2>
                </div>
                <div className="p-6">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-muted/50 border border-border rounded-xl p-5">
                      <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
                        <Eye className="w-5 h-5 text-foreground" />
                      </div>
                      <h3 className="font-semibold text-foreground mb-2">Sponsor Licence Monitoring</h3>
                      <p className="text-sm text-muted-foreground">
                        We track the UK Home Office register daily and alert you instantly if your employer's licence is revoked.
                      </p>
                    </div>
                    <div className="bg-muted/50 border border-border rounded-xl p-5">
                      <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
                        <Shield className="w-5 h-5 text-foreground" />
                      </div>
                      <h3 className="font-semibold text-foreground mb-2">Document Verification</h3>
                      <p className="text-sm text-muted-foreground">
                        Our forensic AI analyses Certificate of Sponsorship documents to detect fakes, edits, and suspicious formatting.
                      </p>
                    </div>
                    <div className="bg-muted/50 border border-border rounded-xl p-5">
                      <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
                        <Lock className="w-5 h-5 text-foreground" />
                      </div>
                      <h3 className="font-semibold text-foreground mb-2">Data Privacy First</h3>
                      <p className="text-sm text-muted-foreground">
                        Documents are deleted immediately after verification. We never store your original files. UK GDPR compliant.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollSection>

            <ScrollSection>
              <div className="theme-card bg-card">
                <div className="p-6 border-b border-border flex items-center gap-3">
                  <Users className="w-6 h-6 text-foreground" />
                  <h2 className="editorial-subheading text-foreground">Our Principles</h2>
                </div>
                <div className="p-6 space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center font-bold text-foreground">
                      1
                    </div>
                    <div>
                      <h3 className="editorial-subheading text-foreground text-lg mb-1">Transparency</h3>
                      <p className="text-muted-foreground editorial-body">
                        We are not affiliated with the UK Home Office or any government body. We are an independent technology company.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center font-bold text-foreground">
                      2
                    </div>
                    <div>
                      <h3 className="editorial-subheading text-foreground text-lg mb-1">Privacy by Design</h3>
                      <p className="text-muted-foreground editorial-body">
                        We process metadata only. Original documents are permanently deleted within seconds of verification.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center font-bold text-foreground">
                      3
                    </div>
                    <div>
                      <h3 className="editorial-subheading text-foreground text-lg mb-1">Accessibility</h3>
                      <p className="text-muted-foreground editorial-body">
                        Everyone deserves to check their documents. That's why we offer free sponsor register searches and affordable verification plans.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollSection>
          </div>

          <ScrollSection className="mb-12">
            <div className="bg-muted border border-border rounded-xl p-8 text-center">
              <h2 className="editorial-subheading text-foreground text-2xl mb-2">
                Ready to protect yourself?
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Search the official sponsor register or verify your Certificate of Sponsorship document today.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/sponsor-monitor">
                  <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full">
                    Search the Register
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button size="lg" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 rounded-full">
                    Verify a CoS
                  </Button>
                </Link>
              </div>
            </div>
          </ScrollSection>

          <div className="text-center">
            <p className="text-xs text-muted-foreground max-w-2xl mx-auto">
              CheckByAI is an independent technology company and is not affiliated with, endorsed by, or connected to the UK Home Office, UK Visas and Immigration (UKVI), or any UK government department.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
