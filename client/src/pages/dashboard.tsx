import COSDashboard from "@/components/COSDashboard";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";

export default function DashboardPage() {
  const dashboardSEO = {
    title: "Certificate of Sponsorship Risk Check | Technical Analysis | CheckByAI",
    description: "Upload your Certificate of Sponsorship PDF for technical risk analysis — hidden metadata, formatting and reference-pattern signals. Not a genuineness verdict; only the Home Office decides. Deleted immediately after checking.",
    keywords: "verify Certificate of Sponsorship, UK CoS checker, upload CoS document, fake CoS detection, AI CoS verification, UK visa document check, sponsor verification",
    canonicalUrl: "https://checkbyai.net/dashboard",
    ogTitle: "Check Your CoS for Fraud-Risk Signals | Technical Analysis",
    ogDescription: "Upload your CoS for a technical risk check — metadata, formatting and reference-pattern signals for human review, not a visa decision.",
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
              "name": "Review Risk Signals",
              "text": "Review technical risk signals with model certainty across genuine, suspicious, fake or needs-review outcomes, for human review — not a visa decision",
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
              "name": "How long does CoS risk analysis take?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Analysis typically completes within 10-30 seconds of upload. The engine examines the document's metadata, format, and patterns and returns technical risk signals for human review."
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
                "text": "Confidence is the model's certainty (0-100) in the shown verdict — not a genuineness score. A Fake 90% means strongly confident it is fake; a Genuine 90% means strongly confident it is genuine. CheckByAI is independent and not the Home Office."
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