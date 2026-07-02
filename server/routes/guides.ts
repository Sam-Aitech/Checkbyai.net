import type { Express, Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import { getAppUrl } from "../utils/appUrl";

const SSR_MARKER = "<!--SSR-->";
const SSR_END_MARKER = "<!--/SSR-->";

const htmlCache = new Map<string, string>();

function readHtmlTemplate(filePath: string): string | null {
  const cached = htmlCache.get(filePath);
  if (cached) return cached;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!fs.existsSync(filePath)) return null;
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const content = fs.readFileSync(filePath, "utf-8");
    htmlCache.set(filePath, content);
    return content;
  } catch {
    return null;
  }
}

const HTML_PATHS = [
  path.resolve("dist/public/index.html"),
  path.resolve("client/index.html"),
];

interface GuideDef {
  path: string;
  title: string;
  description: string;
  canonical: string;
  keywords: string[];
  content: () => string;
  faqSchema: () => string;
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderPage(title: string, description: string, canonical: string, bodyHtml: string): string | null {
  let template: string | null = null;
  for (const p of HTML_PATHS) {
    template = readHtmlTemplate(p);
    if (template) break;
  }
  if (!template) return null;

  const t = escapeAttr(title);
  const d = escapeAttr(description);

  template = template.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`);
  template = template.replace(/<meta name="title" content="[^"]*"/, `<meta name="title" content="${t}"`);
  template = template.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`);
  template = template.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${t}"`);
  template = template.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d}"`);
  template = template.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${canonical}"`);
  template = template.replace(/<meta property="twitter:title" content="[^"]*"/, `<meta property="twitter:title" content="${t}"`);
  template = template.replace(/<meta property="twitter:description" content="[^"]*"/, `<meta property="twitter:description" content="${d}"`);
  template = template.replace(/<meta property="twitter:url" content="[^"]*"/, `<meta property="twitter:url" content="${canonical}"`);
  template = template.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${canonical}"`);

  const startIdx = template.indexOf(SSR_MARKER);
  const endIdx = template.indexOf(SSR_END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    const rootIdx = template.indexOf('<div id="root">');
    if (rootIdx === -1) return null;
    const insertPoint = template.indexOf(">", rootIdx) + 1;
    return template.slice(0, insertPoint) + "\n" + bodyHtml + "\n" + template.slice(insertPoint);
  }

  const prefix = template.slice(0, startIdx + SSR_MARKER.length);
  const suffix = template.slice(endIdx);

  return prefix + "\n" + bodyHtml + "\n" + suffix;
}

const GUIDES: GuideDef[] = [
  {
    path: "sponsor-licence-revoked-what-to-do",
    title: "Sponsor Licence Revoked — What To Do Next (2026 UK Guide) | CheckByAI",
    description: "Your employer's UK sponsor licence has been revoked. Here's exactly what to do: check your visa status, find your curtailment deadline, and start looking for a new sponsor. Step-by-step guide for Skilled Worker visa holders.",
    canonical: "/guides/sponsor-licence-revoked-what-to-do",
    keywords: ["sponsor licence revoked", "sponsor licence revoked what to do", "employer lost sponsor licence", "sponsor licence revoked curtailment 60 days", "what happens when sponsor licence is revoked"],
    content: guidesRevokedContent,
    faqSchema: guidesRevokedFaq,
  },
];

function guidesRevokedContent(): string {
  return `
<article class="guide" itemscope itemtype="https://schema.org/Article" style="max-width:800px;margin:2rem auto;padding:2rem;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.7;color:#1f2937;">
  <meta itemprop="headline" content="Sponsor Licence Revoked — What To Do Next (2026 UK Guide)">
  <meta itemprop="description" content="Your employer's UK sponsor licence has been revoked. Step-by-step guide: check your visa, find your curtailment deadline, find a new sponsor, and protect your right to work in the UK.">
  <meta itemprop="author" content="CheckByAI">
  <meta itemprop="datePublished" content="2026-06-15">
  <meta itemprop="dateModified" content="2026-06-28">

  <nav style="font-size:0.875rem;color:#6b7280;margin-bottom:1.5rem;">
    <a href="/" style="color:#2563eb;text-decoration:none;">Home</a>
    <span style="margin:0 0.5rem;">&rsaquo;</span>
    <span>Guides</span>
    <span style="margin:0 0.5rem;">&rsaquo;</span>
    <span style="color:#1f2937;">Sponsor Licence Revoked &mdash; What To Do</span>
  </nav>

  <h1 style="font-size:2rem;font-weight:800;color:#111827;line-height:1.3;margin-bottom:0.75rem;">Sponsor Licence Revoked &mdash; What To Do Next</h1>
  <p style="color:#6b7280;font-size:0.875rem;margin-bottom:2rem;">Updated 28 June 2026 &middot; 8 min read</p>

  <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:1.5rem;border-radius:0.5rem;margin-bottom:2rem;">
    <strong style="font-size:1.125rem;color:#92400e;">TL;DR:</strong>
    <p style="color:#92400e;margin:0.5rem 0 0;">If your employer's sponsor licence is revoked, you typically have <strong>60 days</strong> (or until your current visa expires, whichever is shorter) to find a new sponsor or leave the UK. Act immediately: confirm the revocation, check your curtailment letter from UKVI, and start applying for jobs with other licensed sponsors. <a href="/sponsor-monitor" style="color:#2563eb;font-weight:600;">Search the sponsor register free</a> to find companies that can sponsor your visa.</p>
  </div>

  <h2 style="font-size:1.5rem;font-weight:700;color:#111827;margin-top:2.5rem;margin-bottom:1rem;">What Does It Mean When a Sponsor Licence Is Revoked?</h2>
  <p>When the Home Office revokes a company's sponsor licence, that employer is <strong>permanently removed</strong> from the Register of Licensed Sponsors. They can no longer:</p>
  <ul style="padding-left:1.5rem;margin-bottom:1.5rem;">
    <li style="margin-bottom:0.5rem;">Assign new Certificates of Sponsorship (CoS)</li>
    <li style="margin-bottom:0.5rem;">Sponsor new overseas workers</li>
    <li style="margin-bottom:0.5rem;">Extend the visas of existing sponsored workers</li>
  </ul>
  <p>Revocation is different from suspension. A <a href="/sponsor-monitor">suspended licence</a> means the employer is under investigation and may be reinstated. Revocation is permanent &mdash; the licence is gone for good.</p>

  <div style="overflow-x:auto;margin:1.5rem 0;">
    <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
      <thead><tr style="background:#f3f4f6;">
        <th style="padding:0.75rem 1rem;text-align:left;border:1px solid #e5e7eb;font-weight:600;">Status</th>
        <th style="padding:0.75rem 1rem;text-align:left;border:1px solid #e5e7eb;font-weight:600;">Meaning</th>
        <th style="padding:0.75rem 1rem;text-align:left;border:1px solid #e5e7eb;font-weight:600;">Can They Sponsor New Workers?</th>
        <th style="padding:0.75rem 1rem;text-align:left;border:1px solid #e5e7eb;font-weight:600;">Your Visa Status</th>
      </tr></thead>
      <tbody>
        <tr><td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;font-weight:600;color:#dc2626;">Revoked</td>
          <td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;">Permanent removal from the register</td>
          <td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;">No</td>
          <td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;">Curtailment &mdash; 60 days to find new sponsor</td>
        </tr>
        <tr><td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;font-weight:600;color:#d97706;">Suspended</td>
          <td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;">Temporary pending investigation</td>
          <td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;">No</td>
          <td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;">Remains valid (may be revoked later)</td>
        </tr>
        <tr><td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;font-weight:600;color:#059669;">Active</td>
          <td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;">Full licence in good standing</td>
          <td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;">Yes</td>
          <td style="padding:0.75rem 1rem;border:1px solid #e5e7eb;">Normal &mdash; no action needed</td>
        </tr>
      </tbody>
    </table>
  </div>

  <p>Between January 2025 and June 2026, the Home Office revoked over <strong>1,500 sponsor licences</strong>. If your employer is on that list, every day counts. Here is the exact process you need to follow.</p>

  <h2 style="font-size:1.5rem;font-weight:700;color:#111827;margin-top:2.5rem;margin-bottom:1rem;">Step 1: Confirm the Revocation</h2>
  <p>Do not rely on rumours or gossip. Verify the revocation yourself using official sources:</p>
  <ol style="padding-left:1.5rem;margin-bottom:1.5rem;">
    <li style="margin-bottom:0.75rem;"><strong>Search the Home Office Register</strong> &mdash; Use our <a href="/sponsor-monitor">free sponsor monitor</a> to search your employer's name and see their current status. If their licence was recently revoked, it will show as revoked with the date of removal.</li>
    <li style="margin-bottom:0.75rem;"><strong>Check your employer's CoS assignment</strong> &mdash; If they have already assigned you a CoS but the licence is revoked, the CoS may be invalid. Use our <a href="/dashboard">AI CoS checker</a> to verify.</li>
    <li style="margin-bottom:0.75rem;"><strong>Wait for UKVI confirmation</strong> &mdash; UK Visas and Immigration will send a formal notification to your employer and may contact you directly.</li>
  </ol>

  <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:1.5rem;border-radius:0.5rem;margin-bottom:2rem;">
    <strong style="color:#1e40af;">Proactive monitoring saves time.</strong>
    <p style="color:#1e3a5f;margin:0.5rem 0 0;">Most workers find out about a revocation weeks or months after it happens. With <a href="/pricing" style="color:#2563eb;font-weight:600;">CheckByAI's instant alerts</a>, you get notified via WhatsApp, email, or SMS the moment your employer's licence status changes &mdash; often before UKVI sends the official letter.</p>
  </div>

  <h2 style="font-size:1.5rem;font-weight:700;color:#111827;margin-top:2.5rem;margin-bottom:1rem;">Step 2: Check Your Visa Curtailment Period</h2>
  <p>When a sponsor licence is revoked, UKVI will <strong>curtail</strong> (shorten) your visa. You will receive a curtailment letter telling you how long you have to find a new sponsor or leave the UK.</p>
  <p>Under the Immigration Rules (paragraph 323AA), your leave is curtailed to <strong>60 days</strong> from the date of the curtailment notice, or the expiry date of your existing visa &mdash; whichever is sooner.</p>
  <p>If you do not receive a curtailment letter within a few weeks, do not assume you are safe. Contact UKVI to confirm your status. Some workers report delays in receiving their curtailment notices, which can eat into the 60-day window.</p>

  <h2 style="font-size:1.5rem;font-weight:700;color:#111827;margin-top:2.5rem;margin-bottom:1rem;">Step 3: Find a New Sponsor</h2>
  <p>Your priority is finding a new employer who holds a valid sponsor licence and is willing to assign you a new CoS. Here is how to find them:</p>
  <ol style="padding-left:1.5rem;margin-bottom:1.5rem;">
    <li style="margin-bottom:0.75rem;"><strong>Search the full sponsor register</strong> &mdash; Over 100,000 companies hold active sponsor licences. Use our <a href="/sponsors">interactive sponsor list</a> to search by name, location, or sector.</li>
    <li style="margin-bottom:0.75rem;"><strong>Filter by licence type</strong> &mdash; Not all sponsors can sponsor Skilled Worker visas. Check that a company has the right licence category for your role.</li>
    <li style="margin-bottom:0.75rem;"><strong>Apply with confidence</strong> &mdash; Before applying, confirm the company is still active on the register. Sponsors can be revoked at any time &mdash; check their current status before accepting a job offer.</li>
  </ol>

  <h3 style="font-size:1.25rem;font-weight:600;color:#111827;margin-top:2rem;margin-bottom:0.75rem;">Companies That Can Sponsor Your Visa</h3>
  <p>Looking for employers that hold a valid sponsor licence? Use these resources:</p>
  <ul style="padding-left:1.5rem;margin-bottom:1.5rem;">
    <li style="margin-bottom:0.5rem;"><a href="/sponsor-monitor">CheckByAI Sponsor Monitor</a> &mdash; Search any company's licence status instantly. Free to use.</li>
    <li style="margin-bottom:0.5rem;"><a href="/sponsors">Full Sponsor Directory</a> &mdash; Browse all 100k+ licensed sponsors on the UK register.</li>
    <li style="margin-bottom:0.5rem;">Job boards with sponsorship filters &mdash; LinkedIn, Indeed, and specialist sites like Sponsorsave or UK Visa Jobs.</li>
  </ul>

  <h2 style="font-size:1.5rem;font-weight:700;color:#111827;margin-top:2.5rem;margin-bottom:1rem;">Step 4: Apply for a New CoS</h2>
  <p>Once you have a job offer from a licensed sponsor, they will assign you a new Certificate of Sponsorship. Key things to check:</p>
  <ul style="padding-left:1.5rem;margin-bottom:1.5rem;">
    <li style="margin-bottom:0.75rem;"><strong>Is the CoS genuine?</strong> &mdash; Fraudulent CoS documents are increasingly common. <a href="/dashboard">Verify any CoS</a> using CheckByAI's forensic AI before submitting a visa application.</li>
    <li style="margin-bottom:0.75rem;"><strong>Does the CoS match your role?</strong> &mdash; The job title, salary, and SOC code on the CoS must match the role you will actually perform.</li>
    <li style="margin-bottom:0.75rem;"><strong>Is the salary compliant?</strong> &mdash; The role must meet the going rate for the occupation and the general salary threshold (&pound;38,700 for most Skilled Worker routes).</li>
  </ul>

  <h2 style="font-size:1.5rem;font-weight:700;color:#111827;margin-top:2.5rem;margin-bottom:1rem;">Step 5: Submit Your Visa Application</h2>
  <p>With a valid CoS from your new sponsor, you can submit a new visa application from within the UK. You do not need to leave the country to switch sponsors. Your application will typically include:</p>
  <ul style="padding-left:1.5rem;margin-bottom:1.5rem;">
    <li style="margin-bottom:0.5rem;">Confirmation of Acceptance for Studies (CAS) or new CoS number</li>
    <li style="margin-bottom:0.5rem;">Proof of English language proficiency (if required)</li>
    <li style="margin-bottom:0.5rem;">Financial evidence (bank statements showing maintenance funds)</li>
    <li style="margin-bottom:0.5rem;">Valid passport and biometric residence permit</li>
  </ul>
  <p>Submit your application before your curtailment deadline. If you miss the deadline, you will be in the UK unlawfully and may face removal or a re-entry ban.</p>

  <h2 style="font-size:1.5rem;font-weight:700;color:#111827;margin-top:2.5rem;margin-bottom:1rem;">What Not To Do</h2>
  <ul style="padding-left:1.5rem;margin-bottom:1.5rem;">
    <li style="margin-bottom:0.75rem;"><strong>Do not ignore it.</strong> Hiding from the problem will not make it go away. The 60-day clock starts ticking the moment UKVI issues the curtailment letter.</li>
    <li style="margin-bottom:0.75rem;"><strong>Do not buy a fake CoS.</strong> Scammers prey on desperate visa holders. A <a href="/check-fake-cos">fake Certificate of Sponsorship</a> will be detected by UKVI and will result in a visa refusal and a 10-year re-entry ban.</li>
    <li style="margin-bottom:0.75rem;"><strong>Do not work illegally.</strong> Once your visa is curtailed, continuing to work for the revoked sponsor may be unlawful. Seek legal advice if unsure.</li>
    <li style="margin-bottom:0.75rem;"><strong>Do not panic.</strong> Thousands of workers go through this process every year. Follow the steps above and you will find a solution.</li>
  </ul>

  <h2 style="font-size:1.5rem;font-weight:700;color:#111827;margin-top:2.5rem;margin-bottom:1rem;">Get Instant Alerts Before It Happens</h2>
  <p>The best way to handle a sponsor licence revocation is to know about it the moment it happens. CheckByAI monitors the full UK Sponsor Register daily and sends instant alerts via WhatsApp, email, or SMS when:</p>
  <ul style="padding-left:1.5rem;margin-bottom:1.5rem;">
    <li style="margin-bottom:0.5rem;">Your employer's licence is revoked, suspended, or downgraded</li>
    <li style="margin-bottom:0.5rem;">Your employer's licence status changes from A-rated to B-rated</li>
    <li style="margin-bottom:0.5rem;">Your employer's name or registered address changes</li>
  </ul>
  <p>Unlike competitors who only send daily digest emails, CheckByAI alerts you <strong>within minutes</strong> of a change being published on the register. Pro subscribers get priority alerts plus SMS notifications for critical changes.</p>

  <div style="text-align:center;margin:2rem 0;">
    <a href="/pricing" style="display:inline-block;padding:1rem 2.5rem;background:#2563eb;color:#fff;border-radius:0.75rem;text-decoration:none;font-weight:600;font-size:1.125rem;">
      Start Monitoring &mdash; Free Tier Available
      <span style="margin-left:0.5rem;">&rarr;</span>
    </a>
    <p style="color:#6b7280;font-size:0.8125rem;margin-top:0.5rem;">Free searches + paid alerts from &pound;24.99/month</p>
  </div>

  <h2 style="font-size:1.5rem;font-weight:700;color:#111827;margin-top:2.5rem;margin-bottom:1rem;">Frequently Asked Questions</h2>
  <div itemscope itemtype="https://schema.org/FAQPage" id="faq-section">
    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" style="margin-bottom:1.5rem;border:1px solid #e5e7eb;border-radius:0.5rem;padding:1.25rem;">
      <h3 itemprop="name" style="font-size:1rem;font-weight:600;color:#111827;margin:0 0 0.5rem;">How long do I have to find a new sponsor after revocation?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text" style="color:#4b5563;font-size:0.9375rem;">You typically have <strong>60 days</strong> from the date of the curtailment notice, or until your current visa expires &mdash; whichever is sooner. UKVI issues a formal curtailment letter specifying your exact deadline. If you do not receive one, contact UKVI to confirm your status.</div>
      </div>
    </div>

    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" style="margin-bottom:1.5rem;border:1px solid #e5e7eb;border-radius:0.5rem;padding:1.25rem;">
      <h3 itemprop="name" style="font-size:1rem;font-weight:600;color:#111827;margin:0 0 0.5rem;">Can I switch employers while my visa is curtailed?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text" style="color:#4b5563;font-size:0.9375rem;">Yes. You can apply for a new visa with a different sponsor from within the UK, provided you submit the application before your curtailment deadline. You do not need to leave the country to switch employers.</div>
      </div>
    </div>

    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" style="margin-bottom:1.5rem;border:1px solid #e5e7eb;border-radius:0.5rem;padding:1.25rem;">
      <h3 itemprop="name" style="font-size:1rem;font-weight:600;color:#111827;margin:0 0 0.5rem;">Does my employer have to tell me their licence is revoked?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text" style="color:#4b5563;font-size:0.9375rem;">There is no legal requirement for your employer to inform you. Many workers find out months later when their visa extension is refused. This is why independent monitoring services like CheckByAI are critical &mdash; we alert you the moment the register changes, regardless of whether your employer tells you.</div>
      </div>
    </div>

    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" style="margin-bottom:1.5rem;border:1px solid #e5e7eb;border-radius:0.5rem;padding:1.25rem;">
      <h3 itemprop="name" style="font-size:1rem;font-weight:600;color:#111827;margin:0 0 0.5rem;">What happens to my Certificate of Sponsorship if the licence is revoked?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text" style="color:#4b5563;font-size:0.9375rem;">Any CoS assigned before the revocation may become invalid. If you are unsure whether your CoS is still valid, use our <a href="/dashboard">free AI CoS checker</a> to verify the document's authenticity and status.</div>
      </div>
    </div>

    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" style="margin-bottom:1.5rem;border:1px solid #e5e7eb;border-radius:0.5rem;padding:1.25rem;">
      <h3 itemprop="name" style="font-size:1rem;font-weight:600;color:#111827;margin:0 0 0.5rem;">Can I get a refund if my employer's licence is revoked?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text" style="color:#4b5563;font-size:0.9375rem;">The Home Office does not refund visa fees when a sponsor licence is revoked. However, you may be eligible for a free visa application to switch to a new sponsor under the circumstances. Consult an immigration solicitor for advice specific to your situation.</div>
      </div>
    </div>

    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" style="margin-bottom:1.5rem;border:1px solid #e5e7eb;border-radius:0.5rem;padding:1.25rem;">
      <h3 itemprop="name" style="font-size:1rem;font-weight:600;color:#111827;margin:0 0 0.5rem;">How can I check if my employer still holds a valid sponsor licence?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text" style="color:#4b5563;font-size:0.9375rem;">You can <a href="/sponsor-monitor">search the Home Office Register of Licensed Sponsors for free on CheckByAI</a>. Enter your employer's name and see their current licence status, rating, and full change history. You can also set up <a href="/pricing">free alerts</a> so you never miss a status change.</div>
      </div>
    </div>
  </div>

  <div style="margin-top:2.5rem;padding:1.5rem;background:#f9fafb;border-radius:0.75rem;">
    <h3 style="font-size:1rem;font-weight:600;color:#111827;margin:0 0 0.75rem;">Related Guides</h3>
    <ul style="padding-left:1.25rem;margin:0;">
      <li style="margin-bottom:0.375rem;"><a href="/check-fake-cos" style="color:#2563eb;">5 Signs Your CoS Might Be Fake</a></li>
      <li style="margin-bottom:0.375rem;"><a href="/sponsor-changes" style="color:#2563eb;">See Today's Sponsor Licence Changes</a></li>
      <li style="margin-bottom:0.375rem;"><a href="/what-to-do-fake-cos" style="color:#2563eb;">Bought a Fake CoS? What To Do</a></li>
      <li><a href="/sponsor-monitor" style="color:#2563eb;">Free UK Sponsor Licence Checker</a></li>
    </ul>
  </div>
</article>
`.trim();
}

function guidesRevokedFaq(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How long do I have to find a new sponsor after revocation?",
        "acceptedAnswer": { "@type": "Answer", "text": "You typically have 60 days from the date of the curtailment notice, or until your current visa expires — whichever is sooner. UKVI issues a formal curtailment letter specifying your exact deadline." }
      },
      {
        "@type": "Question",
        "name": "Can I switch employers while my visa is curtailed?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes. You can apply for a new visa with a different sponsor from within the UK, provided you submit the application before your curtailment deadline. You do not need to leave the country to switch employers." }
      },
      {
        "@type": "Question",
        "name": "Does my employer have to tell me their licence is revoked?",
        "acceptedAnswer": { "@type": "Answer", "text": "There is no legal requirement for your employer to inform you. Many workers find out months later when their visa extension is refused. Independent monitoring services like CheckByAI alert you the moment the register changes." }
      },
      {
        "@type": "Question",
        "name": "What happens to my Certificate of Sponsorship if the licence is revoked?",
        "acceptedAnswer": { "@type": "Answer", "text": "Any CoS assigned before the revocation may become invalid. You can use CheckByAI's free AI CoS checker to verify the document's authenticity and status." }
      },
      {
        "@type": "Question",
        "name": "Can I get a refund if my employer's licence is revoked?",
        "acceptedAnswer": { "@type": "Answer", "text": "The Home Office does not refund visa fees when a sponsor licence is revoked. You may be eligible for a free visa application to switch to a new sponsor. Consult an immigration solicitor." }
      },
      {
        "@type": "Question",
        "name": "How can I check if my employer still holds a valid sponsor licence?",
        "acceptedAnswer": { "@type": "Answer", "text": "You can search the Home Office Register of Licensed Sponsors for free on CheckByAI. Enter your employer's name and see their current licence status, rating, and full change history." }
      }
    ]
  });
}

function sendGuide(guide: GuideDef, _req: Request, res: Response, _next: NextFunction): void {
  const baseUrl = getAppUrl();
  const canonical = `${baseUrl}${guide.canonical}`;
  const bodyRaw = guide.content();

  const articleSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": guide.title,
    "description": guide.description,
    "author": { "@type": "Organization", "name": "CheckByAI" },
    "publisher": {
      "@type": "Organization",
      "name": "CheckByAI",
      "url": baseUrl,
    },
    "datePublished": "2026-06-15",
    "dateModified": "2026-06-28",
    "mainEntityOfPage": canonical,
  });

  const schemaHtml = [
    `<script type="application/ld+json">${articleSchema}</script>`,
    `<script type="application/ld+json">${guide.faqSchema()}</script>`,
  ].join("\n");

  const bodyHtml = bodyRaw + "\n" + schemaHtml;
  const html = renderPage(guide.title, guide.description, canonical, bodyHtml);
  if (!html) {
    res.status(500).send("Internal error");
    return;
  }
  res.set("Content-Type", "text/html");
  res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=600");
  res.send(html);
}

export function registerGuideRoutes(app: Express): void {
  for (const guide of GUIDES) {
    app.get(`/guides/${guide.path}`, (req, res, next) => {
      sendGuide(guide, req, res, next);
    });
  }
}
