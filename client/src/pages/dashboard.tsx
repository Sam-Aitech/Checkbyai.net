import COSDashboard from "@/components/COSDashboard";
import SEOHead from "@/components/SEOHead";

export default function DashboardPage() {
  const dashboardSEO = {
    title: "Document Verification Dashboard - Upload & Verify Documents",
    description: "Upload and verify your documents using our advanced AI-powered verification system. Get instant results with confidence scores for document authenticity.",
    keywords: "document upload, verify documents, PDF verification, document dashboard, document authenticity check",
    canonicalUrl: "https://document-authenticator.replit.app/dashboard",
    ogTitle: "Document Verification Dashboard",
    ogDescription: "Upload and verify your documents instantly with AI-powered document authentication technology."
  };

  return (
    <>
      <SEOHead {...dashboardSEO} />
      <COSDashboard />
    </>
  );
}