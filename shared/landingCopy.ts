/**
 * Shared landing-page copy — single source of truth for the hydrated hero
 * (client/src/components/HeroSection.tsx) and the SSR pre-render
 * (server/ssr/renderLanding.ts). Importing from both sides keeps headline
 * hierarchy, supporting copy, and CTA labels identical so hydration never
 * produces a perceptible redesign. Plain constants only — no JSX, no APIs.
 */
export const LANDING_COPY = {
  hero: {
    eyebrow: "Automated UK Sponsor Licence Monitoring",
    titleMain: "Automated UK Sponsor Licence",
    titleAccent: "& Integrity Monitoring",
    sub: "We check the sponsor register every weeknight at ~00:30 UTC and alert you when your employer's status changes: Pro subscribers twice daily at 07:00 and 19:00 UTC, Starter subscribers by 18:00 UTC the same day.",
    primaryCta: "Monitor a Sponsor",
    secondaryCta: "Browse Register",
    searchPlaceholder: "Search any employer, e.g. NHS, Tata, Deloitte…",
    searchHelper: "Free, unlimited searches. No login required. 124,000+ licensed sponsors.",
  },
  trust: [
    "Instant revocation alerts",
    "WhatsApp, email & SMS channels",
    "UK GDPR compliant",
  ],
  check: {
    eyebrow: "Is Your Employer Still Licensed?",
    title: "Check Your Sponsor Right Now",
    sub: "124,000+ licensed sponsors from the official UK Home Office Register. Free, unlimited, no login required.",
  },
  why: {
    eyebrow: "Why You Need Alerts",
    title: "The Home Office Will Not Warn You",
    sub: "When a sponsor licence is revoked, your visa application is silently rejected. We make sure you know first.",
  },
  cos: {
    eyebrow: "Also Available",
    title: "AI-Assisted Certificate of Sponsorship Authenticity Check",
    sub: "Received a Certificate of Sponsorship from a prospective employer? Upload the PDF to assess whether the document appears unaltered or has been modified. No personal data is retained at any stage.",
    cta: "Verify Your CoS",
  },
  revoked: {
    title: "Recently Revoked Licences",
    sub: "Latest removals from the Home Office register, updated nightly.",
    cta: "View All Changes",
  },
} as const;
