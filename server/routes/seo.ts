import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
import { getAppUrl } from "../utils/appUrl";

export function registerSeoRoutes(app: Express): void {
  app.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const baseUrl = getAppUrl();
    const urls: Array<{ path: string; priority: string; changefreq: string }> = [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/sponsor-monitor', priority: '0.9', changefreq: 'daily' },
      { path: '/pricing', priority: '0.9', changefreq: 'weekly' },
      { path: '/cos-pricing', priority: '0.8', changefreq: 'weekly' },
      { path: '/dashboard', priority: '0.8', changefreq: 'weekly' },
      { path: '/sponsor-changes', priority: '0.8', changefreq: 'daily' },
      { path: '/ai-guide', priority: '0.7', changefreq: 'monthly' },
      { path: '/cos-guide', priority: '0.7', changefreq: 'monthly' },
      { path: '/technology', priority: '0.7', changefreq: 'monthly' },
      { path: '/login', priority: '0.5', changefreq: 'monthly' },
      { path: '/about', priority: '0.6', changefreq: 'monthly' },
      { path: '/privacy', priority: '0.4', changefreq: 'yearly' },
      { path: '/data-security', priority: '0.4', changefreq: 'yearly' },
      { path: '/check-fake-cos', priority: '0.8', changefreq: 'monthly' },
      { path: '/what-to-do-fake-cos', priority: '0.8', changefreq: 'monthly' },
      { path: '/guides/how-to-check-cos-genuine', priority: '0.6', changefreq: 'monthly' },
      { path: '/guides/cos-scams-red-flags', priority: '0.6', changefreq: 'monthly' },
      { path: '/guides/employers-guide-fake-cos', priority: '0.5', changefreq: 'monthly' },
      { path: '/guides/what-to-do-fake-cos', priority: '0.5', changefreq: 'monthly' },
    ];

    const urlEntries = urls.map(u => `  <url>
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

> Real-time monitoring of the UK Home Office Register of Licensed Sponsors with instant WhatsApp, email and SMS alerts when licences are revoked. Plus AI-powered Certificate of Sponsorship verification.

## Products

- [Notification Engine](${getAppUrl()}/pricing): Real-time UK sponsor licence monitoring. Get instant alerts via WhatsApp, email, and SMS when your employer's licence is revoked, suspended, or downgraded. Plans from £24.99/month.
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

CheckByAI is a UK-focused immigration technology platform. We monitor the Home Office Register of Licensed Sponsors daily and alert subscribers instantly when changes affect their employer. Our CoS verification tool uses forensic AI analysis to detect fraudulent Certificate of Sponsorship documents.

Website: ${getAppUrl()}`;

  const llmsFullExtra = `

## Detailed Product Information

### Notification Engine (Primary Product)
The Notification Engine monitors the UK Home Office Register of Licensed Sponsors, which lists all companies authorised to sponsor migrant workers. The register is updated regularly, and when a sponsor licence is revoked, all workers sponsored by that company may lose their right to work in the UK.

**Starter Plan - £24.99/month (£239.99/year)**
- Monitor up to 2 companies
- Email and WhatsApp alerts
- Same-day alerts delivered at 6 PM UTC
- 30-day change history

**Pro Plan - £49.99/month (£479.99/year)**
- Monitor up to 5 companies
- Email, WhatsApp, and SMS alerts
- Immediate alerts (within minutes of detection)
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
A: Workers sponsored by that company typically have 60 days to find a new sponsor or leave the UK. Our alerts help you act fast.

Q: Is the free search really free?
A: Yes. Anyone can search the sponsor register once per day without creating an account.

Q: How quickly do you detect changes?
A: We check the Home Office register daily. Pro subscribers receive alerts within minutes of detection.

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

  const seoMetaMap: Record<string, { title: string; description: string }> = {
    '/': {
      title: 'Is Your UK Sponsor Licence Safe? | Instant Revocation Alerts | CheckByAI',
      description: 'Don\'t get caught out by a sponsor licence revocation. Get instant WhatsApp, email and SMS alerts the moment your employer\'s licence status changes. Plus verify any Certificate of Sponsorship is genuine.',
    },
    '/sponsor-monitor': {
      title: 'Is Your Employer\'s Sponsor Licence Still Valid? | Free Check | CheckByAI',
      description: 'Check any UK employer\'s sponsor licence status for free. Get instant alerts if it\'s revoked, suspended or downgraded — before it affects your visa.',
    },
    '/pricing': {
      title: 'Protect Your Visa | Sponsor Licence Alerts from £24.99/mo | CheckByAI',
      description: 'Never be blindsided by a sponsor licence revocation. Get instant WhatsApp and email alerts. Starter £24.99/mo (2 companies), Pro £49.99/mo (5 companies, SMS + immediate alerts).',
    },
    '/cos-pricing': {
      title: 'Verify Your CoS is Genuine | Fake Document Detection from £24.99 | CheckByAI',
      description: 'Worried your Certificate of Sponsorship might be fake? Verify it instantly with forensic AI analysis. Detect edited documents, forged metadata, and suspicious formatting.',
    },
    '/sponsor-changes': {
      title: 'UK Sponsor Licence Revocations Today | Live Register Updates | CheckByAI',
      description: 'Which UK sponsor licences were revoked today? See live changes from the Home Office register — additions, removals, downgrades — updated daily.',
    },
    '/dashboard': {
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

  app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (!botPatterns.test(ua)) return next();

    const routeMeta = seoMetaMap[req.path];
    if (!routeMeta) return next();

    if (req.path.startsWith('/api/')) return next();

    const accept = req.headers['accept'] || '';
    if (!accept.includes('text/html')) return next();

    try {
      const indexPath = path.resolve('client/index.html');
      let html = fs.readFileSync(indexPath, 'utf-8');
      const { title, description } = routeMeta;
      const canonical = `${getAppUrl()}${req.path === '/' ? '/' : req.path}`;

      html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
      html = html.replace(/<meta name="title" content="[^"]*"/, `<meta name="title" content="${title}"`);
      html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${description}"`);
      html = html.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${title}"`);
      html = html.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${description}"`);
      html = html.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${canonical}"`);
      html = html.replace(/<meta property="twitter:title" content="[^"]*"/, `<meta property="twitter:title" content="${title}"`);
      html = html.replace(/<meta property="twitter:description" content="[^"]*"/, `<meta property="twitter:description" content="${description}"`);
      html = html.replace(/<meta property="twitter:url" content="[^"]*"/, `<meta property="twitter:url" content="${canonical}"`);
      html = html.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${canonical}"`);

      res.set('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      console.error('Bot meta injection error:', err);
      next();
    }
  });
}
