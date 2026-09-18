/**
 * Route-specific SSR bodies for key funnels.
 *
 * /sponsors, /dashboard and /what-to-do-fake-cos previously served the
 * generic homepage fallback inside #root, so crawlers/no-JS clients indexed
 * the wrong funnel. These bodies match the hydrated React H1/intent using
 * the same visually-hidden pattern as renderLanding.ts (no competing design,
 * React remounts via createRoot on load).
 */

const SSR_HIDDEN_STYLE =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";

export function sponsorsHTML(): string {
  return `
<div class="ssr-sponsors" style="${SSR_HIDDEN_STYLE}">
  <h1>UK Licensed Sponsor Register</h1>
  <p>
    Search and browse the UK Home Office Register of Licensed Sponsors
    (licence listings only — not CoS document verification). Updated daily
    from official gov.uk data.
  </p>
  <nav aria-label="Primary">
    <a href="/sponsors">Search the sponsor register</a>
    <a href="/sponsor-monitor">Monitor a sponsor</a>
    <a href="/sponsor-changes">Today's register changes</a>
    <a href="/pricing">Alert plans</a>
  </nav>
</div>
`.trim();
}

export function dashboardHTML(): string {
  return `
<div class="ssr-dashboard" style="${SSR_HIDDEN_STYLE}">
  <h1>Is your Certificate of Sponsorship genuine?</h1>
  <p>
    Upload your UK CoS document for technical risk analysis — hidden metadata,
    formatting, and reference-pattern signals for human review. Not a genuineness
    verdict; only the Home Office decides. Login required; closed beta with approval.
    Documents are deleted immediately after checking.
  </p>
  <nav aria-label="Primary">
    <a href="/dashboard">Verify a CoS document</a>
    <a href="/cos-pricing">CoS verification plans</a>
    <a href="/check-fake-cos">Spot a fake CoS</a>
  </nav>
</div>
`.trim();
}

export function fakeCosGuideHTML(): string {
  return `
<div class="ssr-fake-cos-guide" style="${SSR_HIDDEN_STYLE}">
  <h1>What To Do If You've Bought a Fake Certificate of Sponsorship</h1>
  <p>
    If you suspect you've paid for a fraudulent CoS, do not submit a visa
    application with it. Report to Action Fraud and seek advice from a
    registered adviser. This guide is general information, not legal advice.
  </p>
  <nav aria-label="Primary">
    <a href="/what-to-do-fake-cos">Recovery steps</a>
    <a href="/check-fake-cos">Spot a fake CoS</a>
    <a href="/cos-pricing">CoS verification plans</a>
  </nav>
</div>
`.trim();
}

export const ROUTE_SSR_BODIES: Record<string, () => string> = {
  "/sponsors": sponsorsHTML,
  "/dashboard": dashboardHTML,
  "/verify-cos": dashboardHTML,
  "/what-to-do-fake-cos": fakeCosGuideHTML,
};
