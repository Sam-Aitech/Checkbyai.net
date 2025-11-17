import COSDashboard from "@/components/COSDashboard";
import SEOHead from "@/components/SEOHead";

export default function DashboardPage() {
  const dashboardSEO = {
    title: "Upload & Verify Certificate of Sponsorship | UK CoS Checker",
    description: "Upload your UK Certificate of Sponsorship and get instant AI-powered verification. Detect fake CoS documents with confidence scores and detailed authenticity reports. Fast, private, and accurate.",
    keywords: "verify Certificate of Sponsorship, UK CoS checker, upload CoS document, fake CoS detection, AI CoS verification, UK visa document check, sponsor verification",
    canonicalUrl: "https://checkbyai.net/dashboard",
    ogTitle: "Verify Your Certificate of Sponsorship | AI CoS Checker",
    ogDescription: "Upload and verify your Certificate of Sponsorship instantly with AI-powered authentication. Protect yourself from fake documents and visa scams."
  };

  return (
    <>
      <SEOHead {...dashboardSEO} />
      <COSDashboard />
    </>
  );
}