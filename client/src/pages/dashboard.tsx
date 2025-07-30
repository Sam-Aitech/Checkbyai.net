import COSDashboard from "@/components/COSDashboard";
import SEOHead from "@/components/SEOHead";

export default function DashboardPage() {
  const dashboardSEO = {
    title: "COS Check by AI Dashboard - Upload & Verify Certificate of Sponsorship",
    description: "COS check by AI dashboard - Upload and verify your Certificate of Sponsorship documents using our advanced check by AI verification system. Get instant COS check by AI results with confidence scores for document authenticity.",
    keywords: "COS check by AI, check by AI, COS upload, verify COS documents, COS verification dashboard, Certificate of Sponsorship check, AI COS verification, artificial intelligence COS check, UK visa COS verification",
    canonicalUrl: "https://document-authenticator.replit.app/dashboard",
    ogTitle: "COS Check by AI Dashboard - Certificate of Sponsorship Verification",
    ogDescription: "Upload and verify your Certificate of Sponsorship instantly with check by AI authentication technology powered by artificial intelligence."
  };

  return (
    <>
      <SEOHead {...dashboardSEO} />
      <COSDashboard />
    </>
  );
}