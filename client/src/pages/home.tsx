import { useState, Suspense, lazy } from "react";
import { Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import FileUploadSimple from "@/components/FileUploadSimple";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";

const HeroSection = lazy(() => import("@/components/HeroSection"));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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

  // SEO data for home page
  const homePageSEO = {
    title: "AI Certificate of Sponsorship Checker | Verify UK CoS Documents",
    description: "Verify your UK Certificate of Sponsorship instantly with AI-powered fraud detection. Protect yourself from fake CoS documents and visa scams. Free verification for UK visa applicants.",
    keywords: "certificate of sponsorship verification, verify UK CoS, AI CoS checker, fake CoS detection, UK visa document verification, sponsor license verification, CoS authenticity check",
    canonicalUrl: "https://checkbyai.net/",
    ogImage: "https://checkbyai.net/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "Certificate of Sponsorship Verification Tool",
      "description": "AI-powered verification service for UK Certificates of Sponsorship. Detects fake CoS documents and helps visa applicants verify sponsor authenticity before applying for UK work visas.",
      "url": "https://checkbyai.net/",
      "applicationCategory": "SecurityApplication",
      "operatingSystem": "Web Browser",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "GBP"
      },
      "featureList": [
        "AI-powered document verification",
        "PDF metadata analysis", 
        "Fake document detection",
        "Real-time verification results",
        "Secure document processing"
      ],
      "provider": {
        "@type": "Organization",
        "name": "Check By AI",
        "url": "https://checkbyai.net/"
      }
    }
  };

  return (
    <PageLayout hideFooter>
      <SEOHead {...homePageSEO} />
      <Suspense fallback={<LoadingSpinner />}>
        <HeroSection onStartVerification={() => setShowVerificationModal(true)} />
      </Suspense>

      {showVerificationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Document Verification</h2>
              <button
                onClick={() => {
                  setShowVerificationModal(false);
                  setVerificationResult(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              {!verificationResult ? (
                <div>
                  <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-blue-800 dark:text-blue-200">Document Verification Available</h3>
                        <p className="text-blue-700 dark:text-blue-300 text-sm">Upload your document to verify its authenticity instantly</p>
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
                    <div className={`inline-block px-6 py-3 rounded-full text-lg font-semibold transition-all duration-700 ease-in-out transform hover:scale-105 ${
                      verificationResult.type === 'genuine' 
                        ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg shadow-green-500/25 animate-pulse'
                        : verificationResult.type === 'suspicious'
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg shadow-yellow-500/25 animate-bounce'
                        : 'bg-gradient-to-r from-red-400 to-rose-500 text-white shadow-lg shadow-red-500/25 animate-pulse'
                    }`}>
                      {verificationResult.type === 'genuine' ? 'Genuine' : verificationResult.type === 'suspicious' ? 'Suspicious' : 'Fake'}
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <p className="text-gray-600 dark:text-gray-300">
                      Confidence: {Math.round(verificationResult.confidence)}%
                    </p>
                    <button
                      onClick={() => {
                        setShowVerificationModal(false);
                        setVerificationResult(null);
                      }}
                      className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}