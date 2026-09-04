/**
 * Server-rendered HTML body for /sponsor/:id/:slug pages.
 *
 * Crawlers previously received the React shell with only <title>/meta swapped —
 * an empty <div id="root"> with no sponsor content. Google treats 124k such
 * pages as thin/duplicate and won't index them. This module renders the full
 * sponsor content (status, licence details, change history, FAQ) as plain HTML
 * that is injected INSIDE #root, so bots index real content while React
 * replaces it on hydration for browsers.
 */

import type { sponsorCanonical, sponsorChanges } from "@shared/schema";

type Sponsor = typeof sponsorCanonical.$inferSelect;
type SponsorChange = Pick<
  typeof sponsorChanges.$inferSelect,
  "changeType" | "snapshotDate" | "previousValue" | "newValue"
>;

const CHANGE_LABELS: Record<string, string> = {
  NEW_LICENCE: "Licence granted",
  RE_ACTIVATED: "Licence reinstated",
  REMOVED_REVOKED: "Licence revoked / removed",
  UPGRADED: "Rating upgraded",
  DOWNGRADED: "Rating downgraded",
  ROUTE_CHANGE: "Visa route updated",
  NAME_CHANGE: "Company renamed",
};

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateGb(dateStr: string | Date | null): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "NEWLY_GRANTED":
      return "Newly Granted";
    case "GRACE_PERIOD":
      return "Under Review";
    default:
      return "Revoked";
  }
}

function statusSentence(sponsor: Sponsor): string {
  const name = sponsor.currentName;
  const town = sponsor.townCity ? ` based in ${sponsor.townCity}` : "";
  const route = sponsor.route ? ` for the ${sponsor.route} route` : "";
  switch (sponsor.status) {
    case "ACTIVE":
    case "NEWLY_GRANTED":
      return (
        `Yes. ${name}${town} currently holds a valid UK sponsor licence${route}` +
        ` and appears on the Home Office Register of Licensed Sponsors.`
      );
    case "GRACE_PERIOD":
      return (
        `${name}${town} has recently disappeared from the Home Office register and is under review. ` +
        `This can mean the licence was suspended, surrendered, or revoked. ` +
        `If you hold a Certificate of Sponsorship from this company, verify it before relying on it.`
      );
    default: {
      const removed = formatDateGb(sponsor.removedAt);
      return (
        `No. ${name}${town} no longer appears on the Home Office Register of Licensed Sponsors` +
        `${removed ? ` (removed around ${removed})` : ""}. ` +
        `A Certificate of Sponsorship issued by this company cannot support a UK visa application.`
      );
    }
  }
}

/** FAQPage + BreadcrumbList JSON-LD for the sponsor page. */
export function buildSponsorJsonLd(
  sponsor: Sponsor,
  canonical: string,
  baseUrl: string,
): string {
  const label = statusLabel(sponsor.status);
  const granted = formatDateGb(sponsor.grantedAt);

  const faqs: Array<{ q: string; a: string }> = [
    {
      q: `Is ${sponsor.currentName} a licensed UK visa sponsor?`,
      a: statusSentence(sponsor),
    },
    {
      q: `What visa route does ${sponsor.currentName} sponsor?`,
      a: sponsor.route
        ? `${sponsor.currentName} is registered for: ${sponsor.route}.`
        : `The Home Office register does not list a current visa route for ${sponsor.currentName}.`,
    },
  ];
  if (granted) {
    faqs.push({
      q: `When was ${sponsor.currentName}'s sponsor licence granted?`,
      a: `The licence first appeared on the register around ${granted}. Status today: ${label}.`,
    });
  }
  faqs.push({
    q: "What happens if a sponsor licence is revoked?",
    a:
      "Workers sponsored by that company typically have 60 days to find a new licensed sponsor or leave the UK. " +
      "Check the register before accepting any job offer, and never pay for a Certificate of Sponsorship — selling a CoS is illegal.",
  });

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Sponsor Register", item: `${baseUrl}/sponsors` },
      { "@type": "ListItem", position: 3, name: sponsor.currentName, item: canonical },
    ],
  };

  return (
    `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>\n` +
    `<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`
  );
}

/**
 * Plain-HTML body content injected inside <div id="root"> for bots and
 * pre-hydration browsers. Inline styles only — no app CSS is loaded yet.
 */
export function buildSponsorSeoBody(
  sponsor: Sponsor,
  changes: SponsorChange[],
): string {
  const label = statusLabel(sponsor.status);
  const granted = formatDateGb(sponsor.grantedAt);
  const removed = formatDateGb(sponsor.removedAt);
  const isRevoked = sponsor.status !== "ACTIVE" && sponsor.status !== "NEWLY_GRANTED";
  const name = esc(sponsor.currentName);

  const rows: Array<[string, string]> = [["Licence status", label]];
  if (sponsor.townCity) rows.push(["Location", esc(sponsor.townCity)]);
  if (sponsor.route) rows.push(["Visa route", esc(sponsor.route)]);
  if (sponsor.typeRating) rows.push(["Type & rating", esc(sponsor.typeRating)]);
  if (granted) rows.push(["On register since", granted]);
  if (isRevoked && removed) rows.push(["Removed from register", removed]);

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><th scope="row" style="text-align:left;padding:6px 12px;color:#6b7280;font-weight:500;">${k}</th>` +
        `<td style="padding:6px 12px;color:#1f2937;">${v}</td></tr>`,
    )
    .join("");

  const historyItems = changes
    .map((c) => {
      const what = CHANGE_LABELS[c.changeType] ?? c.changeType;
      const detail =
        c.previousValue && c.newValue && c.changeType !== "NEW_LICENCE"
          ? ` — ${esc(c.previousValue)} → ${esc(c.newValue)}`
          : "";
      return `<li style="margin:4px 0;color:#374151;"><strong>${esc(c.snapshotDate)}</strong>: ${what}${detail}</li>`;
    })
    .join("");

  const historyBlock = historyItems
    ? `<h2 style="font-size:1.25rem;margin:1.5rem 0 0.5rem;color:#1f2937;">Licence history</h2>
       <ul style="list-style:disc;padding-left:1.5rem;">${historyItems}</ul>`
    : "";

  const warningBlock = isRevoked
    ? `<p style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px 16px;border-radius:8px;margin:1rem 0;">
         <strong>Warning:</strong> this company is no longer a licensed sponsor. A Certificate of
         Sponsorship from this employer cannot support a UK visa application. If you have paid for
         one, <a href="/what-to-do-fake-cos" style="color:#991b1b;text-decoration:underline;">read what to do next</a>.
       </p>`
    : "";

  return `
    <main style="max-width:760px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif;">
      <nav aria-label="Breadcrumb" style="font-size:0.875rem;color:#6b7280;margin-bottom:1rem;">
        <a href="/" style="color:#2563eb;">Home</a> &rsaquo;
        <a href="/sponsors" style="color:#2563eb;">Sponsor Register</a> &rsaquo;
        <span>${name}</span>
      </nav>
      <h1 style="font-size:1.875rem;font-weight:700;color:#1f2937;margin-bottom:0.5rem;">
        ${name} — ${label} UK Sponsor Licence
      </h1>
      <p style="color:#374151;line-height:1.6;">${esc(statusSentence(sponsor))}</p>
      ${warningBlock}
      <h2 style="font-size:1.25rem;margin:1.5rem 0 0.5rem;color:#1f2937;">Register details</h2>
      <table style="border-collapse:collapse;width:100%;font-size:0.95rem;">${tableRows}</table>
      ${historyBlock}
      <h2 style="font-size:1.25rem;margin:1.5rem 0 0.5rem;color:#1f2937;">Have a Certificate of Sponsorship from ${name}?</h2>
      <p style="color:#374151;line-height:1.6;">
        A real company name on a CoS does not mean the document is genuine — scammers reuse the
        names of licensed sponsors. <a href="/single-check" style="color:#2563eb;text-decoration:underline;">Run a
        one-off &pound;9.99 scam check on your CoS document</a> (no account needed), or
        <a href="/pricing" style="color:#2563eb;text-decoration:underline;">get instant alerts if this sponsor's
        licence status changes</a>.
      </p>
      <nav style="margin-top:2rem;font-size:0.9rem;">
        <a href="/sponsors" style="color:#2563eb;margin-right:1rem;">Search the sponsor register</a>
        <a href="/sponsor-changes" style="color:#2563eb;margin-right:1rem;">Today's register changes</a>
        <a href="/guides/cos-scams-red-flags" style="color:#2563eb;margin-right:1rem;">CoS scam red flags</a>
        <a href="/guides/how-to-check-cos-genuine" style="color:#2563eb;">How to check a CoS is genuine</a>
      </nav>
      <p style="font-size:0.75rem;color:#9ca3af;margin-top:2rem;">
        Register data: Home Office Register of Licensed Sponsors (Workers), used under the
        Open Government Licence v3.0. CheckByAI is not affiliated with the Home Office.
        This page is not legal advice. Data refreshed each working day.
      </p>
    </main>`;
}
