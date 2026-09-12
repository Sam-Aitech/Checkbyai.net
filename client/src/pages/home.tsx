import { Suspense, lazy } from "react";
import SEOHead from "@/components/SEOHead";
import PageLayout from "@/components/PageLayout";

const HeroSection = lazy(() => import("@/components/HeroSection"));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>
  );
}

export default function Home() {
  const homePageSEO = {
    title: "UK Sponsor Licence Monitoring & Sponsored Job Alerts | CheckByAI",
    description: "Protect your UK sponsorship with sponsor licence monitoring and alerts via email, WhatsApp or SMS. Alert Pass Pro also sends sponsored job opportunity alerts by email.",
    keywords: "sponsor licence revoked alert, UK sponsor monitor, sponsor licence check, visa revocation alert, sponsored job alerts, UK immigration, alert pass",
    canonicalUrl: "https://checkbyai.net/",
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebApplication",
          "name": "CheckByAI - UK Sponsor Licence Monitoring",
          "alternateName": ["Alert Pass", "Sponsor Licence Monitor", "UK Sponsor Alert"],
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "description": "Monitor a UK employer's sponsor licence status and get alerted by email, WhatsApp or SMS when it changes. Alert Pass Pro adds sponsored job opportunity alerts.",
          "featureList": [
            "Sponsor licence status monitoring",
            "Email, WhatsApp and SMS alerts",
            "Same-day and twice-daily alert tiers",
            "Sponsor change history",
            "Sponsored job opportunity alerts (Alert Pass Pro)",
            "AI-assisted Certificate of Sponsorship verification (separate product)",
          ],
          "offers": [
            { "@type": "Offer", "name": "Alert Pass (Annual)", "price": "9.99", "priceCurrency": "GBP" },
            { "@type": "Offer", "name": "Alert Pass Pro (Annual)", "price": "19.99", "priceCurrency": "GBP" },
          ],
        },
        {
          "@type": "WebSite",
          "url": "https://checkbyai.net/",
          "potentialAction": {
            "@type": "SearchAction",
            "target": "https://checkbyai.net/sponsor-monitor?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        },
        {
          "@type": "Organization",
          "name": "Check By AI",
          "url": "https://checkbyai.net/",
          "description": "Sponsor licence monitoring, sponsored job alerts, and Certificate of Sponsorship verification for UK visa holders.",
        },
      ],
    },
  };

  return (
    <PageLayout hideNav hideFooter>
      <SEOHead {...homePageSEO} />
      <Suspense fallback={<LoadingSpinner />}>
        <HeroSection />
      </Suspense>
    </PageLayout>
  );
}
