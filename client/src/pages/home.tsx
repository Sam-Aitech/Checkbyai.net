import { useState, Suspense, lazy } from "react";
import { Shield, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import FileUploadSimple from "@/components/FileUploadSimple";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";

const HeroSection = lazy(() => import("@/components/HeroSection"));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin h-8 w-8 bg-primary/10 rounded-xl"></div>
    </div>
  );
}

export default function Home() {
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{type: 'genuine' | 'suspicious' | 'fake', confidence: number} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
  };

  const handleVerificationResult = (result: {type: 'genuine' | 'suspicious' | 'fake', confidence: number}) => {
    setVerificationResult(result);
    setIsLoading(false);
  };

  const handleVerificationError = (error: string) => {
    console.error('Verification error:', error);
    setIsLoading(false);
  };

  const homePageSEO = {
    title: "Is Your UK Sponsor Licence Safe? | Instant Revocation Alerts | CheckByAI",
    description: "Don't get caught out by a sponsor licence revocation. Get instant WhatsApp, email and SMS alerts the moment your employer's licence status changes. Plus verify any Certificate of Sponsorship is genuine.",
    keywords: "sponsor licence revoked alert, UK sponsor monitor, certificate of sponsorship verification, sponsor licence check, visa revocation alert, CoS verification, UK immigration",
    canonicalUrl: "https://checkbyai.net/",
    ogImage: "https://checkbyai.net/og-image.png",
    breadcrumbs: [{ name: "Home", url: "https://checkbyai.net/" }],
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebApplication",
          "name": "UK Sponsor Licence Monitor and CoS Verification",
          "description": "Real-time UK sponsor licence monitoring with instant WhatsApp, email, and SMS alerts when a licence is revoked. Plus AI-powered Certificate of Sponsorship verification.",
          "url": "https://checkbyai.net/",
          "applicationCategory": "SecurityApplication",
          "operatingSystem": "Web Browser",
          "offers": [
            {
              "@type": "Offer",
              "name": "Free Sponsor Search",
              "price": "0",
              "priceCurrency": "GBP",
              "description": "Search the UK sponsor register once per day for free"
            },
            {
              "@type": "Offer",
              "name": "Notification Starter",
              "price": "24.99",
              "priceCurrency": "GBP",
              "priceSpecification": { "@type": "UnitPriceSpecification", "price": "24.99", "priceCurrency": "GBP", "unitText": "MONTH" }
            },
            {
              "@type": "Offer",
              "name": "Notification Pro",
              "price": "49.99",
              "priceCurrency": "GBP",
              "priceSpecification": { "@type": "UnitPriceSpecification", "price": "49.99", "priceCurrency": "GBP", "unitText": "MONTH" }
            }
          ],
          "featureList": [
            "Instant sponsor licence revocation alerts",
            "WhatsApp, email and SMS notifications",
            "Daily Home Office register monitoring",
            "AI-powered CoS document verification",
            "90-day licence change history",
            "Multi-channel notification reliability"
          ],
          "provider": {
            "@type": "Organization",
            "name": "Check By AI",
            "url": "https://checkbyai.net/",
            "logo": "https://checkbyai.net/checkbyai-logo.png",
            "sameAs": ["https://www.youtube.com/@CheckByAi"],
            "address": { "@type": "PostalAddress", "addressCountry": "GB" }
          }
        },
        {
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What happens when a UK sponsor licence is revoked?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "When a UK sponsor licence is revoked, all workers sponsored by that company typically have 60 days to find a new sponsor or leave the UK. CheckByAI's Notification Engine sends instant alerts via WhatsApp, email, and SMS so you can act immediately."
              }
            },
            {
              "@type": "Question",
              "name": "How do I check if my employer has a valid UK sponsor licence?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "You can search the UK Home Office Register of Licensed Sponsors for free on CheckByAI. Simply visit our Sponsor Monitor page and enter your employer's name. We offer one free search per day, or unlimited searches with a subscription."
              }
            },
            {
              "@type": "Question",
              "name": "What is a Certificate of Sponsorship (CoS)?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "A Certificate of Sponsorship (CoS) is an electronic document issued by a UK employer with a sponsor licence. It contains details about the job and the sponsored worker, and is required when applying for a Skilled Worker visa. CheckByAI can verify CoS documents for authenticity using AI forensic analysis."
              }
            },
            {
              "@type": "Question",
              "name": "How quickly does CheckByAI detect sponsor licence changes?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "CheckByAI monitors the Home Office Register of Licensed Sponsors daily. Pro plan subscribers receive alerts within minutes of detection. Starter plan subscribers receive same-day alerts at 6 PM UTC."
              }
            },
            {
              "@type": "Question",
              "name": "Is the sponsor licence search really free?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes, anyone can search the UK sponsor register once every 24 hours without creating an account or providing any personal information. For unlimited searches and real-time alerts, subscription plans start from £24.99 per month."
              }
            }
          ]
        },
        {
          "@type": "WebSite",
          "name": "CheckByAI",
          "url": "https://checkbyai.net/",
          "potentialAction": {
            "@type": "SearchAction",
            "target": "https://checkbyai.net/sponsor-monitor?q={search_term_string}",
            "query-input": "required name=search_term_string"
          }
        }
      ]
    }
  };

  return (
    <PageLayout hideNav hideFooter>
      <SEOHead {...homePageSEO} />
      <Suspense fallback={<LoadingSpinner />}>
        <HeroSection onStartVerification={() => setShowVerificationModal(true)} />
      </Suspense>

      <AnimatePresence>
        {showVerificationModal && (
          <>
            <motion.div
              className="fixed inset-0 bg-foreground/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowVerificationModal(false);
                setVerificationResult(null);
              }}
            />
            <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <motion.div
                className="bg-background dark:bg-card rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-border pointer-events-auto"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 100, damping: 15 }}
              >
                <div className="sticky top-0 bg-background dark:bg-card p-6 border-b border-border flex justify-between items-center">
                  <h2 className="text-2xl font-bold editorial-subheading text-foreground">Document Verification</h2>
                  <button
                    onClick={() => {
                      setShowVerificationModal(false);
                      setVerificationResult(null);
                    }}
                    className="text-muted-foreground hover:text-foreground text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="p-6">
                  {!verificationResult ? (
                    <div>
                      <div className="mb-6 p-4 bg-muted rounded-xl border border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
                            <Shield className="w-5 h-5 text-primary-foreground" />
                          </div>
                          <div>
                            <h3 className="font-semibold editorial-subheading text-foreground">Document Verification Available</h3>
                            <p className="text-muted-foreground text-sm editorial-body">Upload your document to verify its authenticity instantly</p>
                          </div>
                        </div>
                      </div>
                      
                      <FileUploadSimple
                        onFileUpload={handleFileUpload}
                        onVerificationResult={handleVerificationResult}
                        onError={handleVerificationError}
                        onLoading={setIsLoading}
                        isAdmin={false}
                      />
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="mb-6">
                        <div className={`inline-block px-6 py-3 rounded-xl text-lg font-semibold transition-all duration-300 ${
                          verificationResult.type === 'genuine' 
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                            : verificationResult.type === 'suspicious'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
                        }`}>
                          {verificationResult.type === 'genuine' ? 'Genuine' : verificationResult.type === 'suspicious' ? 'Suspicious' : 'Fake'}
                        </div>
                      </div>

                      <div className="space-y-3 mb-6">
                        <p className="text-muted-foreground editorial-body">
                          Confidence: {Math.round(verificationResult.confidence)}%
                        </p>
                        <button
                          onClick={() => {
                            setShowVerificationModal(false);
                            setVerificationResult(null);
                          }}
                          className="w-full bg-primary text-primary-foreground py-3 px-6 rounded-full font-semibold hover:opacity-90 transition-opacity editorial-subheading"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </PageLayout>
  );
}