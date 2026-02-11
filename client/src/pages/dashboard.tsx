import COSDashboard from "@/components/COSDashboard";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";

export default function DashboardPage() {
  const dashboardSEO = {
    title: "Upload & Verify Certificate of Sponsorship | UK CoS Checker",
    description: "Upload your UK Certificate of Sponsorship and get instant AI-powered verification. Detect fake CoS documents with confidence scores and detailed authenticity reports. Fast, private, and accurate.",
    keywords: "verify Certificate of Sponsorship, UK CoS checker, upload CoS document, fake CoS detection, AI CoS verification, UK visa document check, sponsor verification",
    canonicalUrl: "https://checkbyai.net/dashboard",
    ogTitle: "Verify Your Certificate of Sponsorship | AI CoS Checker",
    ogDescription: "Upload and verify your Certificate of Sponsorship instantly with AI-powered authentication. Protect yourself from fake documents and visa scams.",
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Home",
              "item": "https://checkbyai.net/"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Verify CoS",
              "item": "https://checkbyai.net/dashboard"
            }
          ]
        },
        {
          "@type": "HowTo",
          "name": "How to Verify Your Certificate of Sponsorship",
          "description": "Step-by-step guide to verify your UK Certificate of Sponsorship using AI-powered fraud detection",
          "step": [
            {
              "@type": "HowToStep",
              "name": "Upload Document",
              "text": "Click 'Upload Document' and select your Certificate of Sponsorship PDF file from your device",
              "position": 1
            },
            {
              "@type": "HowToStep",
              "name": "AI Analysis",
              "text": "Our AI engine analyzes the document's metadata, format, and patterns against our trusted database",
              "position": 2
            },
            {
              "@type": "HowToStep",
              "name": "Review Results",
              "text": "Get instant verification results with confidence score showing if your CoS is genuine, suspicious, or fake",
              "position": 3
            }
          ],
          "totalTime": "PT1M"
        },
        {
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "How long does CoS verification take?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Verification is instant - typically completed within 10-30 seconds. Our AI analyzes your document immediately upon upload."
              }
            },
            {
              "@type": "Question",
              "name": "Is my Certificate of Sponsorship data secure?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes, we process documents securely and do not store your personal information. Files are analyzed in memory and deleted immediately after verification."
              }
            },
            {
              "@type": "Question",
              "name": "What file formats are supported?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "We currently support PDF files only, as this is the standard format for UK Certificates of Sponsorship issued by the Home Office."
              }
            },
            {
              "@type": "Question",
              "name": "What does the confidence score mean?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "The confidence score (0-100%) indicates how certain our AI is about the verification result. Higher scores mean greater confidence in the authenticity assessment."
              }
            }
          ]
        }
      ]
    }
  };

  return (
    <PageLayout>
      <SEOHead {...dashboardSEO} />
      <COSDashboard />
    </PageLayout>
  );
}