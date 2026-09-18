import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
import { getAppUrl } from "../utils/appUrl";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { sponsorCanonical, sponsorChanges } from "@shared/schema";
import { toSlug } from "./sponsorPages";
import { logger } from "../utils/logger";
import {
  buildSponsorSeoBody,
  buildSponsorJsonLd,
  statusLabel,
  escapeHtml as escapeAttr,
  toSafeJsonLd,
  ROOT_INJECTION_REGEX,
} from "../utils/sponsorSeoHtml";
import { ROUTE_SSR_BODIES } from "../ssr/renderRoutePage";
import { cacheGet, cacheSet } from "../utils/redisClient";

// In-memory HTML template cache — eliminates repeated disk reads per bot request.
// Key = resolved file path; value = file contents (string).
// Cleared in tests by setting htmlCache = new Map() if needed.
const htmlCache = new Map<string, string>();

function readHtmlTemplate(filePath: string): string | null {
  const cached = htmlCache.get(filePath);
  if (cached) return cached;
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    htmlCache.set(filePath, content);
    return content;
  } catch {
    return null;
  }
}

// Candidate HTML template paths — production build first, dev source fallback.
const HTML_PATHS = [
  path.resolve("dist/public/index.html"),
  path.resolve("client/index.html"),
];

const CORE_URLS: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/sponsor-monitor', priority: '0.9', changefreq: 'daily' },
  { path: '/sponsors', priority: '0.9', changefreq: 'daily' },
  { path: '/pricing', priority: '0.9', changefreq: 'weekly' },
  { path: '/cos-pricing', priority: '0.8', changefreq: 'weekly' },
  { path: '/dashboard', priority: '0.8', changefreq: 'weekly' },
  { path: '/sponsor-changes', priority: '0.8', changefreq: 'daily' },
  { path: '/ai-guide', priority: '0.7', changefreq: 'monthly' },
  { path: '/cos-guide', priority: '0.7', changefreq: 'monthly' },
  { path: '/technology', priority: '0.7', changefreq: 'monthly' },
  { path: '/login', priority: '0.5', changefreq: 'monthly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/check-fake-cos', priority: '0.8', changefreq: 'monthly' },
  { path: '/what-to-do-fake-cos', priority: '0.8', changefreq: 'monthly' },
];

// Shared <title>/meta/og/twitter/canonical rewrite for route-level SSR and
// bot meta injection — single copy so the two call sites can't drift.
function rewriteRouteMeta(
  html: string,
  routePath: string,
  meta: { title: string; description: string },
): string {
  const t = escapeAttr(meta.title);
  const d = escapeAttr(meta.description);
  const canonical = escapeAttr(`${getAppUrl()}${routePath === "/" ? "/" : routePath}`);

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`);
  html = html.replace(/<meta name="title" content="[^"]*"/, `<meta name="title" content="${t}"`);
  html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`);
  html = html.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${t}"`);
  html = html.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d}"`);
  html = html.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${canonical}"`);
  html = html.replace(/<meta property="twitter:title" content="[^"]*"/, `<meta property="twitter:title" content="${t}"`);
  html = html.replace(/<meta property="twitter:description" content="[^"]*"/, `<meta property="twitter:description" content="${d}"`);
  html = html.replace(/<meta property="twitter:url" content="[^"]*"/, `<meta property="twitter:url" content="${canonical}"`);
  html = html.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${canonical}"`);
  return html;
}

/** Accept-header gate shared by every HTML-only SEO handler. */
function wantsHtml(req: any): boolean {
  const accept = req.headers["accept"] || "";
  return accept.includes("text/html");
}

/** First available shell template (built output, then dev source). */
function readShellTemplate(): string | null {
  for (const p of HTML_PATHS) {
    const html = readHtmlTemplate(p);
    if (html) return html;
  }
  return null;
}

/** Send an HTML page with a CDN-friendly cache header. */
function sendHtmlPage(res: any, html: string): void {
  res.set("Content-Type", "text/html");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(html);
}

export function registerSeoRoutes(app: Express): void {

  // Sitemap INDEX — points to core pages + 124k sponsor detail pages
  app.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const baseUrl = getAppUrl();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap-core.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-sponsors.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  });

  // Core pages sitemap (static routes)
  app.get('/sitemap-core.xml', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const baseUrl = getAppUrl();
    const urlEntries = CORE_URLS.map(u => `  <url>
    <loc>${baseUrl}${u.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  });

  app.get('/robots.txt', (req, res) => {
    const content = `User-agent: *
Allow: /

Sitemap: ${getAppUrl()}/sitemap.xml
Sitemap: ${getAppUrl()}/sitemap-sponsors.xml

User-agent: GPTBot
Allow: /
Allow: /llms.txt
Allow: /llms-full.txt

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Applebot-Extended
Allow: /

Disallow: /api/
Disallow: /admin
Disallow: /uploads/`;

    res.set('Content-Type', 'text/plain');
    res.send(content);
  });

  const llmsBaseContent = `# CheckByAI - UK Sponsor Licence Monitor & CoS Verification

> Weeknight monitoring of the UK Home Office Register of Licensed Sponsors with same-day (Starter, 18:00 UTC) and twice-daily (Pro, 07:00 & 19:00 UTC) digest alerts when licences change. Plus AI-powered Certificate of Sponsorship verification.

## Products

- [CoS Verification](${getAppUrl()}/cos-pricing): AI-powered Certificate of Sponsorship document verification from £4.99. Detect fake or edited CoS documents using forensic metadata analysis.
- [Notification Engine](${getAppUrl()}/pricing): UK sponsor licence monitoring via scheduled digests. Get alerted via WhatsApp, email, and SMS when your employer's licence status changes. Alert Pass from £9.99/year; monthly plans from £24.99/month.
- [CoS Verification](${getAppUrl()}/cos-pricing): AI-powered Certificate of Sponsorship document verification. Detect fake or edited CoS documents using forensic metadata analysis.
- [Free Sponsor Search](${getAppUrl()}/sponsor-monitor): Search the UK Home Office Register of Licensed Sponsors for free. Check if any company holds a valid sponsor licence.

## Key Pages

- [Sponsor Licence Monitor](${getAppUrl()}/sponsor-monitor): Search and monitor UK sponsor licences
- [Recent Changes](${getAppUrl()}/sponsor-changes): Daily updates to the UK sponsor register
- [Notification Plans](${getAppUrl()}/pricing): Starter (£24.99/mo) and Pro (£49.99/mo) alert plans
- [CoS Check Plans](${getAppUrl()}/cos-pricing): Document verification credit packages
- [5 Signs Your CoS Might Be Fake](${getAppUrl()}/check-fake-cos): How to spot a fake Certificate of Sponsorship
- [Bought a Fake CoS?](${getAppUrl()}/what-to-do-fake-cos): What to do if you've been scammed with a fraudulent CoS
- [About CheckByAI](${getAppUrl()}/about): Our mission to stop visa fraud
- [Our Technology](${getAppUrl()}/technology): How our AI verification works

## About

CheckByAI is a UK-focused immigration technology platform. We monitor the Home Office Register of Licensed Sponsors daily and alert subscribers when changes affect their employer. Our CoS verification tool uses forensic AI analysis to detect fraudulent Certificate of Sponsorship documents.

Website: ${getAppUrl()}`;

  const llmsFullExtra = `

## Detailed Product Information

### Notification Engine (Primary Product)
The Notification Engine monitors the UK Home Office Register of Licensed Sponsors, which lists all companies authorised to sponsor migrant workers. A sponsor licence change can affect sponsored workers. Check current GOV.UK guidance for the steps that apply.

**Starter Plan - £24.99/month (or Alert Pass £9.99/year for 1 company)**
- Monitor up to 2 companies
- Email and WhatsApp alerts
- Same-day alerts delivered at 6 PM UTC
- 30-day change history

**Pro Plan - £49.99/month (or Alert Pass Pro £19.99/year for up to 5 companies)**
- Monitor up to 5 companies
- Email, WhatsApp, and SMS alerts
- Twice-daily alerts (07:00 and 19:00 UTC)
- 90-day change history
- 5 CoS verification checks per month
- Priority support

### CoS Verification
AI-powered forensic analysis of Certificate of Sponsorship PDF documents. The system examines:
- PDF producer and creator metadata
- XMP modification history
- Font consistency analysis
- Date format validation
- Suspicious software signatures (e.g., Photoshop, online PDF editors)

Results are classified as Genuine, Suspicious, or Fake with confidence scores.

### Free Features
- One free sponsor licence search per 24 hours (no account required)
- View recent register changes
- Educational guides on CoS verification

## Common Questions

Q: What happens when a sponsor licence is revoked?
A: A sponsor licence change can affect sponsored workers. Check current GOV.UK guidance for the steps that apply to your situation. Our alerts help you act fast.

Q: Is the free search really free?
A: Yes. Anyone can search the sponsor register once per day without creating an account.

Q: How quickly do you detect changes?
A: We check the Home Office register every weeknight (~00:30 UTC). Starter subscribers receive a same-day digest at 18:00 UTC; Pro subscribers receive twice-daily digests at 07:00 and 19:00 UTC.

Q: Do you store uploaded documents?
A: No. Documents are analysed in memory and permanently deleted immediately after verification. We only retain the verification result metadata.`;

  app.get('/llms.txt', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(llmsBaseContent);
  });

  app.get('/llms-full.txt', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(llmsBaseContent + llmsFullExtra);
  });

  // ── Dynamic meta injection for /sponsor/:id/:slug bot requests ──────────────
  // For real browsers the React page handles the title; for bots (and social
  // link previews) we read the DB and return fully-populated HTML.
  app.get('/sponsor/:id/:slug?', async (req: any, res, next) => {
    const accept = req.headers['accept'] || '';
    if (!accept.includes('text/html')) return next();

    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return next();

    try {
      // Fully rendered page is cached per sponsor; the nightly monitor job
      // flushes "sponsors:*" so pages refresh after each register update.
      const pageCacheKey = `sponsors:seopage:${id}`;
      const cachedPage = await cacheGet<string>(pageCacheKey);
      if (cachedPage) {
        res.set("Content-Type", "text/html");
        res.set("Cache-Control", "public, max-age=3600");
        res.send(cachedPage);
        return;
      }

      const [sponsor] = await db
        .select()
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.id, id))
        .limit(1);

      if (!sponsor) return next();

      const recentChanges = await db
        .select({
          changeType:    sponsorChanges.changeType,
          snapshotDate:  sponsorChanges.snapshotDate,
          previousValue: sponsorChanges.previousValue,
          newValue:      sponsorChanges.newValue,
        })
        .from(sponsorChanges)
        .where(eq(sponsorChanges.fingerprint, sponsor.fingerprint))
        .orderBy(desc(sponsorChanges.detectedAt))
        .limit(10);

      const base = getAppUrl();
      const slug = toSlug(sponsor.currentName);
      const canonical = `${base}/sponsor/${id}/${slug}`;

      const label = statusLabel(sponsor.status);

      const location  = sponsor.townCity ? ` in ${sponsor.townCity}` : '';
      const routePart = sponsor.route     ? ` (${sponsor.route})`    : '';
      const grantedYr = sponsor.grantedAt ? new Date(sponsor.grantedAt).getFullYear() : null;

      const title =
        `${sponsor.currentName} — ${label} UK Sponsor Licence | CheckByAI`;

      const description = sponsor.status === 'REMOVED_REVOKED'
        ? `${sponsor.currentName}${location} no longer appears on the UK sponsor register. ` +
          `A sponsor licence change can affect sponsored workers — check GOV.UK guidance. See full licence history on CheckByAI.`
        : `${sponsor.currentName}${location} holds a ${label} UK sponsor licence${routePart}` +
          `${grantedYr ? `, active since ${grantedYr}` : ''}. ` +
          `Get alerted if their status changes — free on CheckByAI.`;

      const schema = toSafeJsonLd({
        "@context": "https://schema.org",
        "@type":    "Organization",
        "name":     sponsor.currentName,
        "url":      canonical,
        ...(sponsor.townCity ? {
          "address": {
            "@type":           "PostalAddress",
            "addressLocality": sponsor.townCity,
            "addressCountry":  "GB",
          },
        } : {}),
      });

      // Try built path first (production), fall back to source (dev) — both cached in memory
      let html: string | null = null;
      for (const p of HTML_PATHS) {
        html = readHtmlTemplate(p);
        if (html) break;
      }
      if (!html) return next();

      const t = escapeAttr(title);
      const d = escapeAttr(description);

      html = html.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`);
      html = html.replace(/<meta name="title" content="[^"]*"/, `<meta name="title" content="${t}"`);
      html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`);
      html = html.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${t}"`);
      html = html.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d}"`);
      html = html.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${canonical}"`);
      html = html.replace(/<meta property="twitter:title" content="[^"]*"/, `<meta property="twitter:title" content="${t}"`);
      html = html.replace(/<meta property="twitter:description" content="[^"]*"/, `<meta property="twitter:description" content="${d}"`);
      html = html.replace(/<meta property="twitter:url" content="[^"]*"/, `<meta property="twitter:url" content="${canonical}"`);
      html = html.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${canonical}"`);
      const jsonLd = buildSponsorJsonLd(sponsor, canonical, base);
      html = html.replace('</head>', `<script type="application/ld+json">${schema}</script>\n${jsonLd}\n</head>`);

      // Replace the generic shell content inside #root with server-rendered
      // sponsor content so crawlers index real page content (status, history,
      // FAQ) instead of the generic marketing fallback. Browsers get it too on
      // first paint, then React's createRoot().render() overwrites it — a
      // plain client-side remount, not hydration. The root div closes
      // immediately before a <script> tag in both dev (module script) and
      // built (ld+json, module hoisted to head) HTML; the shell content
      // itself contains no script tags.
      //
      // Uses a replacer function, not a `$1${seoBody}$2` replacement string —
      // seoBody is DB-sourced and a literal "$" in it (a `$&`/`$1`/etc.
      // sequence) would otherwise be interpreted as a replacement-pattern
      // token by String.replace and corrupt the output.
      const seoBody = buildSponsorSeoBody(sponsor, recentChanges);
      const preInjectionHtml = html;
      html = html.replace(
        ROOT_INJECTION_REGEX,
        (_match, p1: string, p2: string) => `${p1}${seoBody}${p2}`,
      );

      res.set('Content-Type', 'text/html');
      // CDN-friendly: sponsor pages are static between nightly runs
      res.set('Cache-Control', 'public, max-age=3600');

      if (html === preInjectionHtml) {
        // #root template didn't match (e.g. build shell changed shape) —
        // the shell shipped without our SEO body. Serve it anyway (still
        // better than a 404) but don't cache a broken render for 6h.
        logger.warn({ sponsorId: id }, 'Sponsor SEO body injection did not match #root template; not caching');
        res.send(html);
        return;
      }

      await cacheSet(pageCacheKey, html, 21600); // 6h; flushed nightly via sponsors:*
      res.send(html);
    } catch (err) {
      logger.error({ err }, 'Sponsor page meta injection error:');
      next();
    }
  });

  // Shared by /dashboard and its /verify-cos alias — one copy, not two.
  const dashboardMeta = {
    title: 'Certificate of Sponsorship Risk Check | Technical Analysis | CheckByAI',
    description: 'Upload your Certificate of Sponsorship PDF for technical risk analysis — hidden metadata, formatting and reference-pattern signals. Not a genuineness verdict; only the Home Office decides.',
  };

  const seoMetaMap: Record<string, { title: string; description: string }> = {
    '/': {
      title: 'Is Your UK Sponsor Licence Safe? | Twice-Daily Revocation Alerts | CheckByAI',
      description: 'Don\'t get caught out by a sponsor licence revocation. We check the Home Office register every weeknight and alert subscribers via WhatsApp, email and SMS — twice daily for Pro, same-day for Starter — when your employer\'s licence status changes.',
    },
    '/sponsor-monitor': {
      title: 'Is Your Employer\'s Sponsor Licence Still Valid? | Free Check | CheckByAI',
      description: 'Check any UK employer\'s sponsor licence status for free. Get alerted if it\'s revoked, suspended or downgraded — before it affects your visa.',
    },
    '/pricing': {
      title: 'Protect Your Visa | Sponsor Licence Alerts from £24.99/mo | CheckByAI',
      description: 'Never be blindsided by a sponsor licence revocation. Get WhatsApp and email alerts. Starter £24.99/mo (2 companies, same-day alerts), Pro £49.99/mo (5 companies, SMS + twice-daily alerts).',
    },
    '/sponsors': {
      title: 'UK Licensed Sponsor Register — Browse 124,000+ Employers | CheckByAI',
      description: 'Search and browse the UK Home Office Register of Licensed Sponsors (licence listings only — not CoS document verification). Updated daily from official gov.uk data.',
    },
    '/cos-pricing': {
      title: 'CoS Fraud-Risk Check | Technical Document Analysis | CheckByAI',
      description: 'Worried your Certificate of Sponsorship might be fake? Get technical risk analysis — hidden metadata, formatting and reference-pattern signals. Not a genuineness verdict; only the Home Office decides.',
    },
    '/sponsor-changes': {
      title: 'UK Sponsor Licence Revocations Today | Live Register Updates | CheckByAI',
      description: 'Which UK sponsor licences were revoked today? See live changes from the Home Office register — additions, removals, downgrades — updated daily.',
    },
    '/dashboard': {
      title: 'Verify Your Certificate of Sponsorship | Detect Fake CoS Documents | CheckByAI',
      description: 'Upload your Certificate of Sponsorship and find out if it\'s genuine in under 60 seconds. Our forensic AI detects fakes, edits, and suspicious formatting. Your document is deleted immediately after checking.',
    },
    '/verify-cos': {
      title: 'Verify Your Certificate of Sponsorship | Detect Fake CoS Documents | CheckByAI',
      description: 'Upload your Certificate of Sponsorship and find out if it\'s genuine in under 60 seconds. Our forensic AI detects fakes, edits, and suspicious formatting. Your document is deleted immediately after checking.',
    },
    '/technology': {
      title: 'How We Detect Fake Documents | Forensic AI Technology | CheckByAI',
      description: 'Learn how our forensic AI catches fake Certificates of Sponsorship that humans miss. Metadata extraction, pattern analysis, and machine learning — explained.',
    },
    '/ai-guide': {
      title: 'How AI Catches Fake Visa Documents | Detection Guide | CheckByAI',
      description: 'Understand how artificial intelligence detects forged visa documents through metadata forensics, pattern recognition, and document fingerprinting.',
    },
    '/cos-guide': {
      title: 'What Is a Certificate of Sponsorship? | Verification Guide | CheckByAI',
      description: 'Everything you need to know about UK Certificates of Sponsorship. How to spot a fake CoS, what to check, and how to verify yours is genuine.',
    },
    '/login': {
      title: 'Sign In | CheckByAI — Protect Your UK Visa',
      description: 'Sign in to manage your sponsor licence alerts and verify Certificates of Sponsorship.',
    },
    '/check-fake-cos': {
      title: '5 Signs Your Certificate of Sponsorship Might Be Fake | CheckByAI',
      description: 'How to spot a fake UK Certificate of Sponsorship. Learn the 5 warning signs of a fraudulent CoS document and what to do if you suspect yours isn\'t genuine.',
    },
    '/what-to-do-fake-cos': {
      title: 'Bought a Fake CoS? Here\'s What To Do Next | CheckByAI',
      description: 'If you\'ve paid for a fake Certificate of Sponsorship, act fast. Step-by-step guide: report to Action Fraud, contact an immigration solicitor, and recover your money.',
    },
    '/about': {
      title: 'About CheckByAI | Our Mission to Stop Visa Fraud',
      description: 'CheckByAI was built to protect visa applicants and employers from fake Certificates of Sponsorship. Learn about our mission, technology, and commitment to data privacy.',
    },
  };

  const botPatterns = /bot|crawl|spider|slurp|Googlebot|Bingbot|GPTBot|PerplexityBot|facebookexternalhit|Twitterbot|LinkedInBot/i;

  // ── Full SSR bodies for key funnels (all HTML clients, not bots-only) ──
  // /sponsors, /dashboard (/verify-cos) and /what-to-do-fake-cos previously
  // served the generic homepage fallback inside #root. Inject route-matched
  // hidden bodies so initial HTML carries the correct funnel H1/intent.
  for (const routePath of Object.keys(ROUTE_SSR_BODIES)) {
    app.get(routePath, (req: any, res, next) => {
      try {
        const accept = req.headers["accept"] || "";
        if (!accept.includes("text/html")) return next();
        let html: string | null = null;
        for (const p of HTML_PATHS) {
          html = readHtmlTemplate(p);
          if (html) break;
        }
        if (!html) return next();
        const routeMeta = seoMetaMap[routePath];
        if (routeMeta) {
          const t = escapeAttr(routeMeta.title);
          const d = escapeAttr(routeMeta.description);
          const canonical = escapeAttr(`${getAppUrl()}${routePath}`);
          html = html.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`);
          html = html.replace(/<meta name="title" content="[^"]*"/, `<meta name="title" content="${t}"`);
          html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`);
          html = html.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${t}"`);
          html = html.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d}"`);
          html = html.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${canonical}"`);
          html = html.replace(/<meta property="twitter:title" content="[^"]*"/, `<meta property="twitter:title" content="${t}"`);
          html = html.replace(/<meta property="twitter:description" content="[^"]*"/, `<meta property="twitter:description" content="${d}"`);
          html = html.replace(/<meta property="twitter:url" content="[^"]*"/, `<meta property="twitter:url" content="${canonical}"`);
          html = html.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${canonical}"`);
        }
        const seoBody = ROUTE_SSR_BODIES[routePath]();
        html = html.replace(
          ROOT_INJECTION_REGEX,
          (_match: string, p1: string, p2: string) => `${p1}${seoBody}${p2}`,
        );
        res.set("Content-Type", "text/html");
        res.set("Cache-Control", "public, max-age=3600");
        res.send(html);
      } catch (err) {
        logger.error({ err, routePath }, "Route SSR injection error:");
        next();
      }
    });
  }

  app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (!botPatterns.test(ua)) return next();

    const routeMeta = seoMetaMap[req.path];
    if (!routeMeta) return next();

    if (req.path.startsWith('/api/')) return next();

    const accept = req.headers['accept'] || '';
    if (!accept.includes('text/html')) return next();

    try {
      let html: string | null = null;
      for (const p of HTML_PATHS) {
        html = readHtmlTemplate(p);
        if (html) break;
      }
      if (!html) return next();
      const { title, description } = routeMeta;
      html = rewriteRouteMeta(html, req.path, { title, description });

      res.set('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      logger.error({ err }, 'Bot meta injection error:');
      next();
    }
  });
}
