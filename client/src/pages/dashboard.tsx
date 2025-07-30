import COSDashboard from "@/components/COSDashboard";
import SEOHead from "@/components/SEOHead";

export default function DashboardPage() {
  const dashboardSEO = {
    title: "COS Check Dashboard - Upload & Verify Certificate of Sponsorship",
    description: "Upload and verify your Certificate of Sponsorship (COS) documents using our advanced AI-powered COS verification system. Get instant COS check results with confidence scores for document authenticity.",
    keywords: "COS upload, verify COS documents, COS verification dashboard, Certificate of Sponsorship check, COS authenticity check, UK visa COS verification",
    canonicalUrl: "https://document-authenticator.replit.app/dashboard",
    ogTitle: "COS Check Dashboard - Certificate of Sponsorship Verification",
    ogDescription: "Upload and verify your Certificate of Sponsorship instantly with AI-powered COS authentication technology."
  };

  return (
    <>
      <SEOHead {...dashboardSEO} />
      <COSDashboard />
    </>
  );
}