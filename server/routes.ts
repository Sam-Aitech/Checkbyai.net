import type { Express } from "express";
import { createServer, type Server } from "http";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import Stripe from "stripe";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, and, desc, inArray, gte, lt } from "drizzle-orm";
import { setupAuth, isAuthenticated, isAdmin } from "./auth";
import { checkIpRateLimit, recordIpVerification, getClientIp, hashIpAddress } from "./ipRateLimit";
import { insertVerificationResultSchema, insertFeedbackSchema, companyWatches, sponsorList, sponsorCanonical, sponsorChanges, notificationPreferences, notificationLog, dailyDigest, users, verificationResults, processedCheckouts } from "@shared/schema";
import { authLimiter, verifyLimiter } from "./middleware/rateLimiter";
import { withRetry } from "./utils/dbRetry";
import multer from "multer";
import { z } from "zod";
import { PDFAnalyzer } from "./services/pdfAnalyzer";
import bcrypt from "bcrypt";
import { rebuildSponsorIndex, searchSponsors, isIndexReady } from "./utils/sponsorSearch";
import { normalizeName, downloadAndParseSponsorList, storeSnapshot, getLatestSnapshotDate, generateFingerprint } from "./utils/sponsorListFetcher";
import { runSponsorMonitorJob, startSponsorMonitorCron, isJobRunning, getLastRunInfo, checkAndTriggerIfNeeded } from "./utils/sponsorMonitorJob";
import { generateHeadline, signDigest, deterministicHeadline } from "./services/aiDigest";
import { encryptPhone, decryptPhone } from "./utils/phoneCrypto";
import { sendSMS, sendWhatsApp } from "./services/messaging";

const CHECKOUT_HMAC_SECRET = process.env.CHECKOUT_HMAC_SECRET || process.env.SESSION_SECRET || process.env.STRIPE_SECRET_KEY!;

function signClientReferenceId(userId: string, packageType: string): string {
  const payload = `${userId}::${packageType}`;
  const hmac = crypto.createHmac('sha256', CHECKOUT_HMAC_SECRET).update(payload).digest('hex').slice(0, 16);
  return `${payload}::${hmac}`;
}

function verifyClientReferenceId(clientRefId: string): { userId: string; packageType: string } | null {
  try {
    const parts = clientRefId.split('::');
    if (parts.length !== 3) return null;
    const [userId, packageType, signature] = parts;
    if (!userId || !packageType || !signature || signature.length !== 16) return null;
    const expected = crypto.createHmac('sha256', CHECKOUT_HMAC_SECRET).update(`${userId}::${packageType}`).digest('hex').slice(0, 16);
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    return { userId, packageType };
  } catch {
    return null;
  }
}

function generateReceiptId(): string {
  const random1 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const random2 = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CBA-${random1}-${random2}`;
}

function generateDocumentHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-11-17.clover" as any,
});

// Configure multer for file uploads with security limits
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

async function markSessionProcessed(sessionId: string): Promise<void> {
  await db.insert(processedCheckouts).values({ sessionId }).onConflictDoNothing();
}

async function isSessionProcessed(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ sessionId: processedCheckouts.sessionId })
    .from(processedCheckouts)
    .where(eq(processedCheckouts.sessionId, sessionId));
  return !!row;
}

async function cleanupOldProcessedCheckouts(): Promise<void> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await db.delete(processedCheckouts).where(lt(processedCheckouts.processedAt, cutoff));
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Clean up old processed checkout records on startup (older than 48h)
  cleanupOldProcessedCheckouts().catch((err) => console.error('[Startup] Failed to clean processed checkouts:', err));

  // Request-triggered sponsor monitor check (runs at most once per hour, non-blocking)
  app.use((req, res, next) => {
    checkAndTriggerIfNeeded().catch((err) => console.error('[SponsorMonitor] Trigger check failed:', err));
    next();
  });

  // Health endpoint for external uptime monitors (keeps server alive for cron windows)
  app.get('/api/health', async (req, res) => {
    const lastRun = getLastRunInfo();
    const jobRunning = isJobRunning();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      sponsorMonitor: {
        running: jobRunning,
        lastRun: lastRun ? {
          date: lastRun.date,
          success: lastRun.success,
          recordsProcessed: lastRun.recordsProcessed,
          changesDetected: lastRun.changesDetected,
        } : null,
      },
    });
  });

  // === SEO ROUTES (must be before Vite middleware) ===

  app.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const baseUrl = 'https://checkbyai.net';
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

Sitemap: https://checkbyai.net/sitemap.xml

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

- [Notification Engine](https://checkbyai.net/pricing): Real-time UK sponsor licence monitoring. Get instant alerts via WhatsApp, email, and SMS when your employer's licence is revoked, suspended, or downgraded. Plans from £24.99/month.
- [CoS Verification](https://checkbyai.net/cos-pricing): AI-powered Certificate of Sponsorship document verification. Detect fake or edited CoS documents using forensic metadata analysis.
- [Free Sponsor Search](https://checkbyai.net/sponsor-monitor): Search the UK Home Office Register of Licensed Sponsors for free. Check if any company holds a valid sponsor licence.

## Key Pages

- [Sponsor Licence Monitor](https://checkbyai.net/sponsor-monitor): Search and monitor UK sponsor licences
- [Recent Changes](https://checkbyai.net/sponsor-changes): Daily updates to the UK sponsor register
- [Notification Plans](https://checkbyai.net/pricing): Starter (£24.99/mo) and Pro (£49.99/mo) alert plans
- [CoS Check Plans](https://checkbyai.net/cos-pricing): Document verification credit packages
- [5 Signs Your CoS Might Be Fake](https://checkbyai.net/check-fake-cos): How to spot a fake Certificate of Sponsorship
- [Bought a Fake CoS?](https://checkbyai.net/what-to-do-fake-cos): What to do if you've been scammed with a fraudulent CoS
- [About CheckByAI](https://checkbyai.net/about): Our mission to stop visa fraud
- [Our Technology](https://checkbyai.net/technology): How our AI verification works

## About

CheckByAI is a UK-focused immigration technology platform. We monitor the Home Office Register of Licensed Sponsors daily and alert subscribers instantly when changes affect their employer. Our CoS verification tool uses forensic AI analysis to detect fraudulent Certificate of Sponsorship documents.

Website: https://checkbyai.net`;

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
      const canonical = `https://checkbyai.net${req.path === '/' ? '/' : req.path}`;

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

  // === END SEO ROUTES ===

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Email/Password Login
  app.post('/api/auth/login', authLimiter, async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.hashedPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const passwordMatch = await bcrypt.compare(password, user.hashedPassword);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      req.login(user, (err: any) => {
        if (err) {
          return res.status(500).json({ message: "Login failed" });
        }
        res.json({ message: "Logged in successfully", user });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Check user's daily verification limit
  app.get('/api/auth/check-limit', async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        // Anonymous users get 1 verification per day via localStorage
        return res.json({ canVerify: true, isAnonymous: true, verificationsLeft: 1 });
      }

      const userId = req.user.id;
      const canVerify = await storage.checkDailyLimit(userId);
      const user = await storage.getUser(userId);
      
      if (user?.subscriptionStatus === 'unlimited' || user?.subscriptionStatus === 'enterprise') {
        return res.json({ canVerify: true, isAnonymous: false, verificationsLeft: 'unlimited' });
      }
      
      const today = new Date().toISOString().split('T')[0];
      const usedToday = user?.lastVerificationDate === today ? (user.dailyVerificationsUsed || 0) : 0;
      const verificationsLeft = Math.max(0, 1 - usedToday);
      
      res.json({ canVerify, isAnonymous: false, verificationsLeft });
    } catch (error) {
      console.error("Error checking limit:", error);
      res.status(500).json({ message: "Failed to check limit" });
    }
  });

  // Subscription management routes - redirects to checkout flow
  app.post('/api/create-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.stripeSubscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        if (subscription.status === 'active') {
          return res.json({
            subscriptionId: subscription.id,
            status: 'active'
          });
        }
      }

      if (!user.email) {
        return res.status(400).json({ message: 'No user email on file' });
      }

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        });
        await storage.updateUserStripeInfo(userId, customer.id);
        customerId = customer.id;
      }

      const allPrices = await stripe.prices.list({ active: true, limit: 50, expand: ['data.product'] });
      const unlimitedPrice = allPrices.data.find(p => {
        const prod = p.product as any;
        return prod?.metadata?.packageType === 'unlimited' && p.recurring;
      });

      if (!unlimitedPrice) {
        return res.status(400).json({ 
          message: 'Unlimited subscription plan not configured in Stripe. Please use the checkout flow instead.',
          redirect: '/pricing'
        });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: unlimitedPrice.id, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: { userId, packageType: 'unlimited' },
      });

      res.json({ url: session.url, status: 'redirect' });
    } catch (error: any) {
      console.error("Subscription creation error:", error);
      res.status(500).json({ message: 'Failed to create subscription' });
    }
  });

  // Send simultaneous admin + user emails on subscription purchase
  async function sendSubscriptionNotifications(
    userId: string,
    planName: string,
    packageType: string,
    sessionEmail?: string
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!apiKey) return;

    let userEmail = sessionEmail;
    if (!userEmail) {
      try {
        const user = await storage.getUser(userId);
        userEmail = user?.email;
      } catch (err) {
        console.error('[Subscription] Failed to fetch user email for notifications:', err);
      }
    }

    const planDetails: Record<string, { credits: string; watches: string; timing: string; portal: string }> = {
      starter:              { credits: "50 CoS checks",          watches: "—",             timing: "—",           portal: "/verify" },
      pro:                  { credits: "100 CoS checks",         watches: "—",             timing: "—",           portal: "/verify" },
      unlimited:            { credits: "Unlimited CoS checks",   watches: "10 companies",  timing: "Immediate",   portal: "/verify" },
      notification_starter: { credits: "—",                      watches: "2 companies",   timing: "Same-day",    portal: "/sponsor-monitor" },
      notification_pro:     { credits: "5 CoS checks/month",     watches: "5 companies",   timing: "Immediate",   portal: "/sponsor-monitor" },
    };
    const details = planDetails[packageType] || { credits: "—", watches: "—", timing: "—", portal: "/" };

    const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);padding:28px;border-radius:10px 10px 0 0;">
          <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127881; New Subscriber</h1>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">Plan</td><td style="padding:8px 12px;color:#1d4ed8;font-weight:bold;border-bottom:1px solid #f0f0f0;">${planName}</td></tr>
            <tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">Package Type</td><td style="padding:8px 12px;color:#333;border-bottom:1px solid #f0f0f0;">${packageType}</td></tr>
            <tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">User Email</td><td style="padding:8px 12px;color:#333;border-bottom:1px solid #f0f0f0;">${userEmail || "unknown"}</td></tr>
            <tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">User ID</td><td style="padding:8px 12px;color:#999;font-family:monospace;font-size:12px;border-bottom:1px solid #f0f0f0;">${userId}</td></tr>
            <tr><td style="padding:8px 12px;color:#666;">Timestamp</td><td style="padding:8px 12px;color:#333;">${new Date().toISOString()}</td></tr>
          </table>
        </div>
      </div>`;

    const userHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:28px;border-radius:10px 10px 0 0;">
          <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#10004; You're all set — ${planName}</h1>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
          <p style="color:#333;font-size:15px;margin-top:0;">Thank you for subscribing! Here's what's now unlocked on your account:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
            ${details.credits !== "—" ? `<tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">&#9989; Checks</td><td style="padding:8px 12px;color:#333;font-weight:bold;border-bottom:1px solid #f0f0f0;">${details.credits}</td></tr>` : ""}
            ${details.watches !== "—" ? `<tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">&#128064; Watch list</td><td style="padding:8px 12px;color:#333;font-weight:bold;border-bottom:1px solid #f0f0f0;">${details.watches}</td></tr>` : ""}
            ${details.timing !== "—" ? `<tr><td style="padding:8px 12px;color:#666;border-bottom:1px solid #f0f0f0;">&#9889; Alert speed</td><td style="padding:8px 12px;color:#333;font-weight:bold;border-bottom:1px solid #f0f0f0;">${details.timing}</td></tr>` : ""}
          </table>
          <div style="text-align:center;">
            <a href="https://checkbyai.net${details.portal}" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Get Started</a>
          </div>
          <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? Reply to this email or visit checkbyai.net</p>
        </div>
      </div>`;

    const sends: Promise<any>[] = [];

    if (adminEmail) {
      sends.push(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ from: "CheckByAI <alerts@checkbyai.net>", to: [adminEmail], subject: `New subscriber: ${planName} — ${userEmail || userId}`, html: adminHtml }),
        }).catch(err => console.error("[Subscription] Admin email error:", err))
      );
    }

    if (userEmail) {
      sends.push(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ from: "CheckByAI <no-reply@checkbyai.net>", to: [userEmail], subject: `Welcome to ${planName} — you're all set`, html: userHtml }),
        }).catch(err => console.error("[Subscription] User email error:", err))
      );
    }

    await Promise.all(sends);
    console.log(`[Subscription] Emails sent for ${packageType} — user: ${userEmail || userId}`);
  }

  // Stripe webhook for subscription status updates
  app.post('/api/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        console.error('Webhook error: rawBody not available — ensure express.json verify callback is configured');
        return res.status(400).send('Webhook raw body unavailable');
      }
      event = stripe.webhooks.constructEvent(rawBody, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send('Webhook signature verification failed');
    }

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer?.id;
        
        if (customerId) {
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            const subPkgType = subscription.metadata?.packageType;
            if (subscription.status === 'active') {
              if (subPkgType === 'cos_check') {
                await storage.updateCosCheckSubscription(user.id, true);
              } else {
                const subStatus = subPkgType === 'starter' ? 'starter' : subPkgType === 'pro' ? 'pro' : 'unlimited';
                await storage.updateUserSubscription(user.id, {
                  subscriptionStatus: subStatus,
                  stripeSubscriptionId: subscription.id,
                  stripeCustomerId: customerId,
                });
              }
            } else if (subscription.status === 'canceled' || subscription.status === 'unpaid' || event.type === 'customer.subscription.deleted') {
              if (subPkgType === 'cos_check') {
                await storage.updateCosCheckSubscription(user.id, false);
              } else {
                await storage.updateUserSubscription(user.id, {
                  subscriptionStatus: 'free',
                  stripeSubscriptionId: null,
                });
              }
            }
          }
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId && invoice.subscription) {
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            if (user.subscriptionStatus && user.subscriptionStatus !== 'free') {
              await storage.updateUserSubscription(user.id, {
                subscriptionStatus: user.subscriptionStatus,
                stripeSubscriptionId: invoice.subscription,
                stripeCustomerId: customerId,
              });
            }
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const user = await storage.getUserByStripeCustomerId(customerId);
          if (user) {
            await storage.updateUserSubscription(user.id, {
              subscriptionStatus: 'past_due',
            });
          }
        }
        break;
      }
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        let userId = session.metadata?.userId;
        let packageType = session.metadata?.packageType;
        
        if (!userId && session.client_reference_id) {
          const verified = verifyClientReferenceId(session.client_reference_id);
          if (verified) {
            userId = verified.userId;
            packageType = verified.packageType;
          } else {
            console.error('Invalid client_reference_id signature:', session.client_reference_id);
          }
        }
        
        if (userId && packageType && session.payment_status === 'paid' && !(await isSessionProcessed(session.id))) {
          await markSessionProcessed(session.id);
          const sessionEmail = session.customer_details?.email || session.customer_email || undefined;
          if (packageType === 'starter') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                credits: sql`COALESCE(${users.credits}, 0) + 50`,
                subscriptionStatus: 'starter',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-starter');
            sendSubscriptionNotifications(userId, 'CoS Check Starter', 'starter', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
          } else if (packageType === 'pro') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                credits: sql`COALESCE(${users.credits}, 0) + 100`,
                subscriptionStatus: 'pro',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-pro');
            sendSubscriptionNotifications(userId, 'CoS Check Pro', 'pro', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
          } else if (packageType === 'unlimited') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                subscriptionStatus: 'unlimited',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-unlimited');
            sendSubscriptionNotifications(userId, 'CoS Check Unlimited', 'unlimited', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
          } else if (packageType === 'master') {
            await storage.createPaidSubmission({
              email: session.customer_details?.email || '',
              packageType: 'full',
              paymentStatus: 'paid',
              stripeSessionId: session.id,
              priority: true,
              phoneConsultationRequested: true,
            });
          } else if (packageType === 'notification_starter') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                subscriptionStatus: 'starter',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-notification-starter');
            sendSubscriptionNotifications(userId, 'Notification Engine Starter', 'notification_starter', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
          } else if (packageType === 'notification_pro') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                credits: sql`COALESCE(${users.credits}, 0) + 5`,
                subscriptionStatus: 'pro',
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-notification-pro');
            sendSubscriptionNotifications(userId, 'Notification Engine Pro', 'notification_pro', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
          } else if (packageType === 'cos_check') {
            await withRetry(() => db.transaction(async (tx) => {
              await tx.update(users).set({
                cosCheckSubscription: true,
                cosCheckApproved: true,
                ipExempt: true,
                stripeCustomerId: session.customer,
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            }), 'webhook-checkout-cos-check');
            sendSubscriptionNotifications(userId, 'COS Check Subscription', 'cos_check', sessionEmail).catch((err) => console.error('[Subscription] Notification failed:', err));
          }
        }
        break;
      }
    }

    res.json({ received: true });
  });

  // Get available credit packages/products from Stripe API directly
  app.get('/api/packages', async (req, res) => {
    try {
      const products = await stripe.products.list({ active: true, limit: 20 });
      const prices = await stripe.prices.list({ active: true, limit: 50 });

      const productsMap = new Map();
      for (const product of products.data) {
        const productPrices = prices.data
          .filter(p => p.product === product.id)
          .map(p => ({
            id: p.id,
            unit_amount: p.unit_amount,
            currency: p.currency,
            recurring: p.recurring,
            metadata: p.metadata,
          }));
        
        if (productPrices.length > 0) {
          productsMap.set(product.id, {
            id: product.id,
            name: product.name,
            description: product.description,
            metadata: product.metadata,
            prices: productPrices,
          });
        }
      }
      
      res.json({ packages: Array.from(productsMap.values()) });
    } catch (error: any) {
      console.error('Error fetching packages:', error);
      res.status(500).json({ message: 'Failed to fetch packages' });
    }
  });

  app.post('/api/checkout/sign', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { packageType } = req.body;
      const validTypes = ['starter', 'pro', 'unlimited', 'master', 'notification_starter', 'notification_pro'];
      if (!packageType || !validTypes.includes(packageType)) {
        return res.status(400).json({ message: 'Invalid package type' });
      }
      const clientReferenceId = signClientReferenceId(userId, packageType);
      res.json({ clientReferenceId });
    } catch (error: any) {
      console.error('Sign checkout error:', error);
      res.status(500).json({ message: 'Failed to prepare checkout' });
    }
  });

  // Create checkout session for credit packages (legacy)
  app.post('/api/checkout/credits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { priceId, packageType } = req.body;
      
      if (!priceId || !packageType) {
        return res.status(400).json({ message: 'Missing priceId or packageType' });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      if (!user.email) {
        return res.status(400).json({ message: 'Email required for checkout' });
      }
      
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
          metadata: { userId },
        });
        await storage.updateUserStripeCustomer(userId, customer.id);
        customerId = customer.id;
      }
      
      const isSubscription = packageType === 'unlimited';
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: isSubscription ? 'subscription' : 'payment',
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: {
          userId,
          packageType,
        },
      });
      
      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error('Checkout error:', error);
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  // Get user's current credits
  app.get('/api/credits', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const credits = await storage.getCredits(userId);
      const user = await storage.getUser(userId);
      
      res.json({ 
        credits, 
        subscriptionStatus: user?.subscriptionStatus || 'free',
        isUnlimited: user?.subscriptionStatus === 'unlimited' || user?.subscriptionStatus === 'enterprise' || user?.verificationLimit === -1
      });
    } catch (error: any) {
      console.error('Error fetching credits:', error);
      res.status(500).json({ message: 'Failed to fetch credits' });
    }
  });

  // Verify checkout session completion
  app.get('/api/checkout/verify/:sessionId', isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (session.payment_status === 'paid') {
        const packageType = session.metadata?.packageType;
        const sessionUserId = session.metadata?.userId;
        
        if (sessionUserId && sessionUserId === req.user.id) {
          if (!(await isSessionProcessed(sessionId))) {
            await markSessionProcessed(sessionId);
            if (packageType === 'starter') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  credits: sql`COALESCE(${users.credits}, 0) + 50`,
                  subscriptionStatus: 'starter',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-starter');
            } else if (packageType === 'pro') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  credits: sql`COALESCE(${users.credits}, 0) + 100`,
                  subscriptionStatus: 'pro',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-pro');
            } else if (packageType === 'unlimited') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  subscriptionStatus: 'unlimited',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-unlimited');
            } else if (packageType === 'master') {
              await storage.createPaidSubmission({
                email: session.customer_details?.email || req.user.email || '',
                packageType: 'full',
                paymentStatus: 'paid',
                stripeSessionId: session.id,
                priority: true,
                phoneConsultationRequested: true,
              });
            } else if (packageType === 'notification_starter') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  subscriptionStatus: 'starter',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-notification-starter');
            } else if (packageType === 'notification_pro') {
              await withRetry(() => db.transaction(async (tx) => {
                await tx.update(users).set({
                  credits: sql`COALESCE(${users.credits}, 0) + 5`,
                  subscriptionStatus: 'pro',
                  stripeSubscriptionId: session.subscription as string,
                  stripeCustomerId: session.customer as string,
                  updatedAt: new Date(),
                }).where(eq(users.id, sessionUserId));
              }), 'checkout-verify-notification-pro');
            }
          }
          
          const credits = await storage.getCredits(sessionUserId);
          const user = await storage.getUser(sessionUserId);
          
          res.json({ 
            success: true, 
            packageType,
            credits,
            subscriptionStatus: user?.subscriptionStatus 
          });
        } else {
          res.status(403).json({ message: 'Session does not belong to this user' });
        }
      } else {
        res.json({ success: false, status: session.payment_status });
      }
    } catch (error: any) {
      console.error('Verify checkout error:', error);
      res.status(500).json({ message: 'Failed to verify checkout' });
    }
  });

  // Stripe publishable key endpoint
  app.get('/api/stripe/publishable-key', async (req, res) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error: any) {
      console.error('Error getting publishable key:', error);
      res.status(500).json({ message: 'Failed to get Stripe key' });
    }
  });

  // Document verification route (supports both authenticated and anonymous users)
  app.post('/api/verify', verifyLimiter, upload.single('file'), async (req: any, res) => {
    try {
      // Beta gate: CoS Check is invite-only
      if (!req.isAuthenticated()) {
        return res.status(403).json({
          message: 'CoS Check is currently in closed beta. Please log in and request access.',
          code: 'beta_login_required',
        });
      }

      const betaUserId = req.user.id;
      const betaUser = betaUserId ? await storage.getUser(betaUserId) : null;
      if (!betaUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Access gate: allow if any of the following is true
      const isAdminUser = betaUser.role === 'admin';
      const hasCosSubscription = betaUser.cosCheckSubscription === true;
      const hasPaidPlanWithCos = ['pro', 'unlimited', 'enterprise'].includes(betaUser.subscriptionStatus || '');
      const hasAdminApproval = betaUser.cosCheckApproved === true;

      if (!isAdminUser && !hasCosSubscription && !hasPaidPlanWithCos && !hasAdminApproval) {
        return res.status(403).json({
          message: 'Your account is pending COS Check access. Please contact support or upgrade your subscription.',
          code: 'cos_access_denied',
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      let userId: string | undefined = betaUserId;
      
      // Skip IP rate limit for exempt users (admin-approved or IP-exempt flag)
      if (!betaUser.ipExempt && !isAdminUser) {
        const clientIp = getClientIp(req);
        const hashedIp = hashIpAddress(clientIp);
        const ipRecord = await storage.getIpVerification(hashedIp);
        if (ipRecord) {
          const lastVerification = new Date(ipRecord.lastVerificationDate);
          const now = new Date();
          const daysSinceVerification = (now.getTime() - lastVerification.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceVerification < 1) {
            return res.status(429).json({
              message: 'You have already verified a document today. Upgrade or wait until tomorrow.',
              code: 'ip_rate_limited',
            });
          }
        }
        (req as any).hashedIp = hashedIp;
      }

      // Determine deduction strategy but don't deduct yet (defer until after analysis)
      let useCredits = false;
      let useDailyLimit = false;

      if (userId) {
        const user = betaUser;
        const hasUnlimited = isAdminUser || hasCosSubscription || user.subscriptionStatus === 'unlimited' || user.subscriptionStatus === 'enterprise' || user.verificationLimit === -1;
        
        if (!hasUnlimited) {
          const credits = user.credits || 0;
          if (credits > 0) {
            useCredits = true;
          } else {
            // Check daily free limit before analysis (fast fail)
            const canVerify = await storage.checkDailyLimit(userId);
            if (!canVerify) {
              return res.status(429).json({ 
                message: 'Daily verification limit reached. Purchase credits or upgrade for unlimited verifications.',
                upgradeRequired: true,
                credits: 0
              });
            }
            useDailyLimit = true;
          }
        }
      }

      // Generate document hash for audit trail
      const documentHash = generateDocumentHash(req.file.path);
      const receiptId = generateReceiptId();

      // ── Admin-override short-circuit ──────────────────────────────────────
      // If an admin has previously reviewed this exact document (same hash)
      // and marked it as fake with a reason, honour that verdict immediately —
      // no AI re-analysis is run.
      const priorAdminFlag = await storage.getAdminFlaggedVerificationByHash(documentHash);

      let result: string;
      let analysis: any;
      let metadata: any;
      let isAdminOverride = false;

      if (priorAdminFlag) {
        isAdminOverride = true;
        result = 'fake';
        const reason = priorAdminFlag.adminFeedback || 'Flagged as fake by a human reviewer.';
        analysis = {
          result: 'fake',
          confidence: 99,
          details: {
            summary: `This document was previously reviewed by an administrator and confirmed fake. ${reason}`,
          },
          checks: [
            {
              name: 'Admin Human Review Override',
              passed: false,
              severity: 'critical',
              message: `A human administrator has reviewed this exact document and determined it is NOT genuine. Reason: ${reason}`,
            },
          ],
        };
        metadata = (priorAdminFlag.metadata as any) || {};
      } else {
        // Normal AI analysis path — load admin knowledge to feed into analysis
        const pdfAnalyzer = new PDFAnalyzer();
        const extractedMetadata = await pdfAnalyzer.extractMetadata(req.file.path);
        const trustedPatterns = await storage.getTrustedPatterns();

        // Load admin-accumulated knowledge in parallel (non-fatal if missing)
        const [activeRules, hitlFakes] = await Promise.all([
          storage.getActiveGlobalAiRules().catch(() => []),
          storage.getAdminFakeKnowledge(20).catch(() => []),
        ]);

        const adminContext = {
          globalRules: activeRules.map((r: any) => ({
            category: r.category,
            ruleText: r.ruleText,
            priority: r.priority,
          })),
          hitlKnowledge: hitlFakes.map((v: any) => ({
            filename: v.filename,
            result: v.result,
            confidence: v.confidence,
            adminFeedback: v.adminFeedback,
            metadata: v.metadata,
          })),
        };

        const analysisResult = await pdfAnalyzer.analyzeAgainstTrustedPatterns(
          extractedMetadata,
          trustedPatterns,
          adminContext,
        );
        result = analysisResult.result;
        analysis = analysisResult;
        metadata = {
          producer: extractedMetadata.producer,
          creator: extractedMetadata.creator,
          created: extractedMetadata.creationDate,
          modified: extractedMetadata.modificationDate,
          fontCount: extractedMetadata.fontCount,
        };
      }
      // ─────────────────────────────────────────────────────────────────────

      // Atomically deduct credit + store result (if one fails, both roll back)
      const verificationId = await withRetry(() => db.transaction(async (tx) => {
        if (useCredits && userId) {
          await tx.update(users).set({
            credits: sql`GREATEST(COALESCE(${users.credits}, 0) - 1, 0)`,
            updatedAt: new Date(),
          }).where(eq(users.id, userId));
        } else if (useDailyLimit && userId) {
          const today = new Date().toISOString().split('T')[0];
          const [currentUser] = await tx.select({
            dailyVerificationsUsed: users.dailyVerificationsUsed,
            lastVerificationDate: users.lastVerificationDate,
          }).from(users).where(eq(users.id, userId));
          const usageToday = currentUser?.lastVerificationDate === today
            ? (currentUser.dailyVerificationsUsed || 0) + 1 : 1;
          await tx.update(users).set({
            dailyVerificationsUsed: usageToday,
            lastVerificationDate: today,
            updatedAt: new Date(),
          }).where(eq(users.id, userId));
        }
        const insertValues: any = {
          userId,
          filename: req.file!.originalname,
          result,
          confidence: Math.floor(analysis.confidence),
          metadata: isAdminOverride ? (priorAdminFlag!.metadata ?? {}) : metadata,
          analysisDetails: analysis,
          ipAddress: req.ip,
          receiptId,
          documentHash,
        };
        // Carry forward admin override fields so this record is also marked
        if (isAdminOverride) {
          insertValues.adminStatus = 'fake';
          insertValues.adminFeedback = priorAdminFlag!.adminFeedback;
          insertValues.adminReviewedBy = priorAdminFlag!.adminReviewedBy;
          insertValues.adminReviewedAt = priorAdminFlag!.adminReviewedAt;
        }
        const [verification] = await tx.insert(verificationResults).values(insertValues).returning();
        return verification.id;
      }), 'verify-result');

      res.json({
        id: verificationId,
        receiptId,
        documentHash,
        result,
        confidence: analysis.confidence,
        details: analysis.details,
        checks: analysis.checks || [],
        forensicAnalysis: analysis.details?.forensicAnalysis || null,
        adminOverride: isAdminOverride,
        metadata: isAdminOverride ? {} : metadata,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Verification error:', error);
      res.status(500).json({ message: 'Verification failed' });
    } finally {
      // Delete uploaded file immediately after processing (security measure)
      if (req.file && req.file.path) {
        try {
          const fs = await import('fs');
          fs.promises.unlink(req.file.path).catch(() => {
            // Silently fail if file already deleted
          });
        } catch (err) {
          console.error('Error deleting uploaded file:', err);
        }
      }
    }
  });

  // Verification receipt endpoint
  app.get('/api/receipt/:receiptId', async (req, res) => {
    try {
      const { receiptId } = req.params;
      const verification = await storage.getVerificationByReceiptId(receiptId);
      
      if (!verification) {
        return res.status(404).json({ message: 'Receipt not found' });
      }

      const receiptData = {
        receiptId: verification.receiptId,
        documentHash: verification.documentHash,
        result: verification.result,
        confidence: verification.confidence,
        verifiedAt: verification.verifiedAt,
        checksPerformed: (verification.analysisDetails as any)?.checks?.length || 0,
        integrityHash: crypto.createHash('sha256')
          .update(`${verification.receiptId}:${verification.documentHash}:${verification.result}:${verification.confidence}:${verification.verifiedAt}`)
          .digest('hex')
      };

      res.json(receiptData);
    } catch (error) {
      console.error("Error fetching receipt:", error);
      res.status(500).json({ message: "Failed to fetch receipt" });
    }
  });

  // User verification history
  app.get('/api/my-verifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const verifications = await storage.getVerificationsByUserId(userId);
      
      const history = verifications.map(v => ({
        id: v.id,
        receiptId: v.receiptId,
        documentHash: v.documentHash,
        filename: v.filename,
        result: v.result,
        confidence: v.confidence,
        verifiedAt: v.verifiedAt,
        adminStatus: v.adminStatus,
        checks: (v.analysisDetails as any)?.checks || [],
      }));
      
      res.json(history);
    } catch (error) {
      console.error("Error fetching verification history:", error);
      res.status(500).json({ message: "Failed to fetch verification history" });
    }
  });

  const freeSearchTracker = new Map<string, number>();
  setInterval(() => {
    const now = Date.now();
    const entries = Array.from(freeSearchTracker.entries());
    for (const [ip, ts] of entries) {
      if (now - ts > 24 * 60 * 60 * 1000) freeSearchTracker.delete(ip);
    }
  }, 60 * 60 * 1000);

  app.get('/api/sponsors/free-search', async (req: any, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      if (q.length < 3) {
        return res.status(400).json({ message: "Search query must be at least 3 characters long." });
      }

      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'unknown';
      const lastSearch = freeSearchTracker.get(ip);
      if (lastSearch && Date.now() - lastSearch < 24 * 60 * 60 * 1000) {
        return res.status(429).json({
          message: "You've used your free search for today. Subscribe to the Notification Engine for unlimited searches and real-time alerts.",
          limitReached: true,
        });
      }

      if (!isIndexReady()) {
        await rebuildSponsorIndex();
        if (!isIndexReady()) {
          return res.status(503).json({ message: "Sponsor search index is not yet available. Please try again shortly." });
        }
      }

      const results = searchSponsors(q, 10);
      freeSearchTracker.set(ip, Date.now());
      res.json({ results, freeSearchUsed: true });
    } catch (error) {
      console.error("Error in free sponsor search:", error);
      res.status(500).json({ message: "Failed to search sponsors." });
    }
  });

  app.get('/api/daily-digest/current', async (_req: any, res) => {
    try {
      const result = await db
        .select()
        .from(dailyDigest)
        .where(eq(dailyDigest.displayedOnLanding, true))
        .orderBy(desc(dailyDigest.snapshotDate))
        .limit(1);

      if (result.length === 0) {
        return res.json({ available: false });
      }

      const digest = result[0];
      const variants = (digest.headlineVariants as any[]) || [];
      const idx = digest.selectedVariantIndex ?? 0;
      const selected = variants[idx] || variants[0] || { headline: digest.headlineGenerated, subheadline: "", emotion: "neutral", focus: "general" };

      const signature = signDigest({
        date: digest.snapshotDate,
        added: digest.addedCount,
        updated: digest.updatedCount,
        removed: digest.removedCount,
      });

      const isSeed = digest.aiModel === "deterministic-seed";

      const [activeResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.status, "ACTIVE"));
      const activeSponsors = activeResult?.count ?? 0;

      res.json({
        available: true,
        type: isSeed ? "overview" : "daily",
        date: digest.snapshotDate,
        headline: selected.headline || digest.headlineGenerated,
        emotion: selected.emotion || "neutral",
        focus: selected.focus || "general",
        counts: {
          added: digest.addedCount,
          updated: digest.updatedCount,
          removed: digest.removedCount,
        },
        activeSponsors,
        signature,
      });
    } catch (error) {
      console.error("Error fetching daily digest:", error);
      res.status(500).json({ message: "Failed to fetch daily digest." });
    }
  });

  app.post('/api/admin/daily-digest/refresh', isAdmin, async (req: any, res) => {
    try {
      const latestChanges = await db
        .select({
          changeType: sponsorChanges.changeType,
          organisationName: sponsorChanges.organisationName,
          count: sql<number>`count(*)::int`,
        })
        .from(sponsorChanges)
        .groupBy(sponsorChanges.changeType, sponsorChanges.organisationName)
        .orderBy(desc(sql`count(*)`))
        .limit(50);

      const today = new Date().toISOString().split("T")[0];
      let addedCount = 0, updatedCount = 0, removedCount = 0;
      const removedCompanies: string[] = [];
      const addedCompanies: string[] = [];

      if (latestChanges.length > 0) {
        for (const c of latestChanges) {
          if (c.changeType === "ADDED" || c.changeType === "NEW_LICENCE") {
            addedCount += c.count;
            if (addedCompanies.length < 5) addedCompanies.push(c.organisationName);
          } else if (c.changeType === "REMOVED") {
            removedCount += c.count;
            if (removedCompanies.length < 10) removedCompanies.push(c.organisationName);
          } else if (["UPGRADED", "DOWNGRADED", "ROUTE_CHANGE", "NAME_CHANGE"].includes(c.changeType)) {
            updatedCount += c.count;
          }
        }
      } else {
        const stats = await db
          .select({
            active: sql<number>`count(*) filter (where ${sponsorCanonical.status} = 'ACTIVE')::int`,
            revoked: sql<number>`count(*) filter (where ${sponsorCanonical.status} = 'REMOVED')::int`,
          })
          .from(sponsorCanonical);
        addedCount = stats[0]?.active || 0;
        removedCount = stats[0]?.revoked || 0;
      }

      const headlineResult = await generateHeadline({
        snapshotDate: today,
        addedCount,
        updatedCount,
        removedCount,
        removedCompanies,
        addedCompanies,
      });

      await db.update(dailyDigest).set({ displayedOnLanding: false });
      await db.insert(dailyDigest).values({
        snapshotDate: today,
        addedCount,
        updatedCount,
        removedCount,
        headlineGenerated: headlineResult.headline,
        headlineVariants: headlineResult.variants,
        displayedOnLanding: true,
        selectedVariantIndex: 0,
        aiModel: headlineResult.model,
      }).onConflictDoUpdate({
        target: dailyDigest.snapshotDate,
        set: {
          headlineGenerated: headlineResult.headline,
          headlineVariants: headlineResult.variants,
          displayedOnLanding: true,
          selectedVariantIndex: 0,
          aiModel: headlineResult.model,
          generatedAt: new Date(),
        },
      });

      res.json({ success: true, headline: headlineResult.headline, model: headlineResult.model });
    } catch (error: any) {
      console.error("Error refreshing daily digest:", error);
      res.status(500).json({ message: "Failed to refresh digest.", error: error.message });
    }
  });

  // Sponsor search endpoint
  app.get('/api/sponsors/search', isAuthenticated, async (req: any, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      if (q.length < 3) {
        return res.status(400).json({ message: "Search query must be at least 3 characters long." });
      }

      if (!isIndexReady()) {
        await rebuildSponsorIndex();
        if (!isIndexReady()) {
          return res.status(503).json({ message: "Sponsor search index is not yet available. Please try again shortly." });
        }
      }

      const results = searchSponsors(q, 20);
      res.json(results);
    } catch (error) {
      console.error("Error searching sponsors:", error);
      res.status(500).json({ message: "Failed to search sponsors." });
    }
  });

  app.get('/api/sponsors/:fingerprint/history', isAuthenticated, async (req: any, res) => {
    try {
      const { fingerprint } = req.params;
      if (!fingerprint || typeof fingerprint !== 'string') {
        return res.status(400).json({ message: "Fingerprint is required." });
      }

      const canonical = await db
        .select()
        .from(sponsorCanonical)
        .where(eq(sponsorCanonical.fingerprint, fingerprint))
        .limit(1);

      if (canonical.length === 0) {
        return res.status(404).json({ message: "Company not found." });
      }

      const record = canonical[0];
      const allNames = [record.currentName, ...(record.historicalNames || [])];

      const changes = await db
        .select()
        .from(sponsorChanges)
        .where(inArray(sponsorChanges.organisationName, allNames))
        .orderBy(desc(sponsorChanges.detectedAt))
        .limit(100);

      const history = changes.map(c => ({
        id: c.id,
        date: c.detectedAt,
        event: c.changeType,
        organisationName: c.organisationName,
        previousValue: c.previousValue,
        newValue: c.newValue,
        snapshotDate: c.snapshotDate,
      }));

      res.json({
        fingerprint: record.fingerprint,
        currentName: record.currentName,
        townCity: record.townCity,
        typeRating: record.typeRating,
        route: record.route,
        status: record.status,
        firstSeen: record.firstSeen,
        lastSeen: record.lastSeen,
        historicalNames: record.historicalNames || [],
        history,
      });
    } catch (error) {
      console.error("Error fetching sponsor history:", error);
      res.status(500).json({ message: "Failed to fetch sponsor history." });
    }
  });

  // ==========================================
  // Company Watch Endpoints
  // ==========================================

  const { getWatchLimit: getWatchLimitFromTier, getTierConfig, isChannelAllowed } = await import("./utils/tierConfig");

  function getWatchLimit(subscriptionStatus: string | null): number {
    return getWatchLimitFromTier(subscriptionStatus);
  }

  app.post('/api/watches', isAuthenticated, async (req: any, res) => {
    try {
      const watchSchema = z.object({
        organisation_name: z.string().trim().min(1, "Organisation name is required").max(300),
        town_city: z.string().trim().max(200).optional(),
        fingerprint: z.string().max(500).optional(),
      });
      const parsed = watchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(', ') });
      }
      const { organisation_name, town_city, fingerprint: fpParam } = parsed.data;

      const userSub = req.user.subscriptionStatus || "free";
      if (userSub === "free" || !userSub) {
        return res.status(403).json({
          message: "Upgrade to Starter plan to add companies to your watchlist. Free users can view search results and history only.",
          requiresUpgrade: true,
        });
      }

      const userId = req.user.id;
      const normalized = normalizeName(organisation_name.trim());

      let canonicalMatch;
      if (fpParam) {
        const match = await db
          .select()
          .from(sponsorCanonical)
          .where(and(
            eq(sponsorCanonical.fingerprint, fpParam),
            eq(sponsorCanonical.status, "ACTIVE"),
          ))
          .limit(1);
        canonicalMatch = match[0] || null;
      }

      if (!canonicalMatch) {
        const fp = generateFingerprint(organisation_name.trim(), town_city || "", "");
        const fpMatch = await db
          .select()
          .from(sponsorCanonical)
          .where(and(
            eq(sponsorCanonical.fingerprint, fp),
            eq(sponsorCanonical.status, "ACTIVE"),
          ))
          .limit(1);
        canonicalMatch = fpMatch[0] || null;
      }

      if (!canonicalMatch) {
        const normalizedCity = town_city ? normalizeName(town_city.trim()) : null;
        const activeRecords = await db
          .select()
          .from(sponsorCanonical)
          .where(eq(sponsorCanonical.status, "ACTIVE"));

        canonicalMatch = activeRecords.find(m => {
          const mNorm = normalizeName(m.currentName);
          if (mNorm !== normalized) return false;
          if (normalizedCity && m.townCity) {
            return normalizeName(m.townCity) === normalizedCity;
          }
          return true;
        }) || null;
      }

      if (!canonicalMatch) {
        return res.status(404).json({ message: "Company not found in the current sponsor register. Please check the name and try again." });
      }

      const existingWatch = await db
        .select()
        .from(companyWatches)
        .where(and(
          eq(companyWatches.userId, userId),
          eq(companyWatches.organisationNameNormalized, normalized),
        ))
        .limit(1);

      if (existingWatch.length > 0 && existingWatch[0].isActive) {
        return res.status(409).json({ message: "You are already watching this company." });
      }

      const limit = getWatchLimit(req.user.subscriptionStatus);
      if (limit !== -1) {
        const activeWatches = await db
          .select({ id: companyWatches.id })
          .from(companyWatches)
          .where(and(
            eq(companyWatches.userId, userId),
            eq(companyWatches.isActive, true),
          ));

        if (activeWatches.length >= limit) {
          return res.status(403).json({
            message: `You have reached your watch limit of ${limit}. Upgrade your plan to watch more companies.`,
            currentCount: activeWatches.length,
            limit,
          });
        }
      }

      if (existingWatch.length > 0) {
        await db
          .update(companyWatches)
          .set({ isActive: true, fingerprint: canonicalMatch.fingerprint })
          .where(eq(companyWatches.id, existingWatch[0].id));
        return res.json({ message: "Watch reactivated.", watch: { ...existingWatch[0], isActive: true } });
      }

      const [newWatch] = await db
        .insert(companyWatches)
        .values({
          userId,
          organisationName: canonicalMatch.currentName,
          organisationNameNormalized: normalized,
          townCity: town_city?.trim() || canonicalMatch.townCity,
          fingerprint: canonicalMatch.fingerprint,
          isActive: true,
        })
        .returning();

      res.status(201).json({ message: "Watch created.", watch: newWatch });
    } catch (error) {
      console.error("Error creating watch:", error);
      res.status(500).json({ message: "Failed to create watch." });
    }
  });

  app.get('/api/watches', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const watches = await db
        .select()
        .from(companyWatches)
        .where(eq(companyWatches.userId, userId))
        .orderBy(desc(companyWatches.createdAt));

      const enriched = await Promise.all(
        watches.map(async (watch) => {
          let currentStatus: { listed: boolean; typeRating: string | null; route: string | null; status: string } = {
            listed: false,
            typeRating: null,
            route: null,
            status: "UNKNOWN",
          };

          if (watch.fingerprint) {
            const canonical = await db
              .select({
                typeRating: sponsorCanonical.typeRating,
                route: sponsorCanonical.route,
                status: sponsorCanonical.status,
                currentName: sponsorCanonical.currentName,
              })
              .from(sponsorCanonical)
              .where(eq(sponsorCanonical.fingerprint, watch.fingerprint))
              .limit(1);

            if (canonical.length > 0) {
              currentStatus = {
                listed: canonical[0].status === "ACTIVE",
                typeRating: canonical[0].typeRating,
                route: canonical[0].route,
                status: canonical[0].status,
              };
            }
          } else {
            const normalized = watch.organisationNameNormalized;
            const normalizedCity = watch.townCity ? normalizeName(watch.townCity) : null;
            const allCanonical = await db
              .select({
                fingerprint: sponsorCanonical.fingerprint,
                currentName: sponsorCanonical.currentName,
                townCity: sponsorCanonical.townCity,
                typeRating: sponsorCanonical.typeRating,
                route: sponsorCanonical.route,
                status: sponsorCanonical.status,
              })
              .from(sponsorCanonical);

            const match = allCanonical.find(c => {
              const cNorm = normalizeName(c.currentName);
              if (cNorm !== normalized) return false;
              if (normalizedCity && c.townCity) {
                return normalizeName(c.townCity) === normalizedCity;
              }
              return true;
            });

            if (match) {
              currentStatus = {
                listed: match.status === "ACTIVE",
                typeRating: match.typeRating,
                route: match.route,
                status: match.status,
              };
              db.update(companyWatches)
                .set({ fingerprint: match.fingerprint })
                .where(eq(companyWatches.id, watch.id))
                .catch((err) => console.error('[CompanyWatch] Failed to update fingerprint for watch id', watch.id, err));
            }
          }

          const recentChanges = await db
            .select()
            .from(sponsorChanges)
            .where(eq(sponsorChanges.organisationName, watch.organisationName))
            .orderBy(desc(sponsorChanges.detectedAt))
            .limit(5);

          return {
            ...watch,
            currentStatus,
            recentChanges,
          };
        }),
      );

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching watches:", error);
      res.status(500).json({ message: "Failed to fetch watches." });
    }
  });

  app.delete('/api/watches/:id', isAuthenticated, async (req: any, res) => {
    try {
      const watchId = parseInt(req.params.id, 10);
      if (isNaN(watchId)) {
        return res.status(400).json({ message: "Invalid watch ID." });
      }

      const existing = await db
        .select()
        .from(companyWatches)
        .where(eq(companyWatches.id, watchId))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ message: "Watch not found." });
      }

      if (existing[0].userId !== req.user.id) {
        return res.status(403).json({ message: "You can only manage your own watches." });
      }

      await db
        .update(companyWatches)
        .set({ isActive: false })
        .where(eq(companyWatches.id, watchId));

      res.json({ message: "Watch deactivated." });
    } catch (error) {
      console.error("Error deactivating watch:", error);
      res.status(500).json({ message: "Failed to deactivate watch." });
    }
  });

  app.patch('/api/watches/:id/reactivate', isAuthenticated, async (req: any, res) => {
    try {
      const watchId = parseInt(req.params.id, 10);
      if (isNaN(watchId)) {
        return res.status(400).json({ message: "Invalid watch ID." });
      }

      const existing = await db
        .select()
        .from(companyWatches)
        .where(eq(companyWatches.id, watchId))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ message: "Watch not found." });
      }

      if (existing[0].userId !== req.user.id) {
        return res.status(403).json({ message: "You can only manage your own watches." });
      }

      if (existing[0].isActive) {
        return res.json({ message: "Watch is already active." });
      }

      await db
        .update(companyWatches)
        .set({ isActive: true })
        .where(eq(companyWatches.id, watchId));

      res.json({ message: "Watch reactivated." });
    } catch (error) {
      console.error("Error reactivating watch:", error);
      res.status(500).json({ message: "Failed to reactivate watch." });
    }
  });

  // ==========================================
  // Notification Preferences Endpoints
  // ==========================================

  const phoneOtpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();
  const otpRateLimit = new Map<string, { count: number; resetAt: number }>();
  const MAX_OTP_ATTEMPTS = 5;
  const MAX_OTP_REQUESTS = 3;
  const OTP_RATE_WINDOW = 10 * 60 * 1000;

  const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

  function cleanupExpiredOtps() {
    const now = Date.now();
    Array.from(phoneOtpStore.entries()).forEach(([key, val]) => {
      if (val.expiresAt < now) phoneOtpStore.delete(key);
    });
    Array.from(otpRateLimit.entries()).forEach(([key, val]) => {
      if (val.resetAt < now) otpRateLimit.delete(key);
    });
  }

  app.get('/api/notification-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const result = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);

      if (result.length === 0) {
        return res.json({
          emailEnabled: true,
          email: req.user.email || null,
          whatsappEnabled: false,
          whatsappNumber: null,
          whatsappVerified: false,
          smsEnabled: false,
          smsNumber: null,
          smsVerified: false,
        });
      }

      const prefs = result[0];
      res.json({
        emailEnabled: prefs.emailEnabled,
        email: prefs.email,
        whatsappEnabled: prefs.whatsappEnabled,
        whatsappNumber: prefs.whatsappNumber ? decryptPhone(prefs.whatsappNumber) : null,
        whatsappVerified: prefs.whatsappVerified,
        smsEnabled: prefs.smsEnabled,
        smsNumber: prefs.smsNumber ? decryptPhone(prefs.smsNumber) : null,
        smsVerified: prefs.smsVerified,
      });
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ message: "Failed to fetch notification preferences." });
    }
  });

  app.put('/api/notification-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const notifPrefSchema = z.object({
        email_enabled: z.boolean().optional(),
        whatsapp_enabled: z.boolean().optional(),
        whatsapp_number: z.string().max(20).optional().nullable(),
        sms_enabled: z.boolean().optional(),
        sms_number: z.string().max(20).optional().nullable(),
      });
      const prefParsed = notifPrefSchema.safeParse(req.body);
      if (!prefParsed.success) {
        return res.status(400).json({ message: prefParsed.error.errors.map(e => e.message).join(', ') });
      }
      const { email_enabled, whatsapp_enabled, whatsapp_number, sms_enabled, sms_number } = prefParsed.data;

      if (whatsapp_number && !PHONE_REGEX.test(whatsapp_number)) {
        return res.status(400).json({ message: "Invalid WhatsApp number. Please provide a number starting with + followed by country code and digits (e.g. +447700900000)." });
      }
      if (sms_number && !PHONE_REGEX.test(sms_number)) {
        return res.status(400).json({ message: "Invalid SMS number. Please provide a number starting with + followed by country code and digits (e.g. +447700900000)." });
      }

      if (whatsapp_enabled && !whatsapp_number) {
        return res.status(400).json({ message: "Please provide a WhatsApp number to enable WhatsApp notifications." });
      }
      if (sms_enabled && !sms_number) {
        return res.status(400).json({ message: "Please provide an SMS number to enable SMS notifications." });
      }

      const userPlan = req.user.subscriptionStatus || "free";
      if (whatsapp_enabled && !isChannelAllowed(userPlan, "whatsapp")) {
        return res.status(403).json({ message: "WhatsApp notifications are available on Pro plan and above. Please upgrade to enable this channel." });
      }
      if (sms_enabled && !isChannelAllowed(userPlan, "sms")) {
        return res.status(403).json({ message: "SMS notifications are available on Unlimited plan and above. Please upgrade to enable this channel." });
      }

      const existing = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);

      if (whatsapp_enabled) {
        const storedNumber = existing.length > 0 && existing[0].whatsappNumber ? decryptPhone(existing[0].whatsappNumber) : null;
        const isVerified = existing.length > 0 && existing[0].whatsappVerified && storedNumber === whatsapp_number;
        if (!isVerified) {
          return res.status(400).json({ message: "Please verify your WhatsApp number before enabling WhatsApp notifications." });
        }
      }

      if (sms_enabled) {
        const storedNumber = existing.length > 0 && existing[0].smsNumber ? decryptPhone(existing[0].smsNumber) : null;
        const isVerified = existing.length > 0 && existing[0].smsVerified && storedNumber === sms_number;
        if (!isVerified) {
          return res.status(400).json({ message: "Please verify your SMS number before enabling SMS notifications." });
        }
      }

      const values = {
        userId,
        emailEnabled: email_enabled ?? true,
        email: req.user.email || null,
        whatsappEnabled: whatsapp_enabled ?? false,
        whatsappNumber: whatsapp_number ? encryptPhone(whatsapp_number) : null,
        smsEnabled: sms_enabled ?? false,
        smsNumber: sms_number ? encryptPhone(sms_number) : null,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(notificationPreferences)
          .set(values)
          .where(eq(notificationPreferences.userId, userId));
      } else {
        await db.insert(notificationPreferences).values(values);
      }

      res.json({ message: "Notification preferences updated." });
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ message: "Failed to update notification preferences." });
    }
  });

  app.get('/api/tier-config', isAuthenticated, async (req: any, res) => {
    try {
      const userPlan = req.user.subscriptionStatus || "free";
      const config = getTierConfig(userPlan);
      res.json({
        plan: userPlan,
        watchLimit: config.watchLimit,
        channels: config.channels,
        alertTiming: config.alertTiming,
        apiAccess: config.apiAccess,
        weeklyReports: config.weeklyReports,
        csvUpload: config.csvUpload,
        webhooks: config.webhooks,
      });
    } catch (error) {
      console.error("Error fetching tier config:", error);
      res.status(500).json({ message: "Failed to fetch tier configuration." });
    }
  });

  app.post('/api/notification-preferences/verify-phone', isAuthenticated, async (req: any, res) => {
    try {
      const { phone_number, channel } = req.body;

      if (!phone_number || !PHONE_REGEX.test(phone_number)) {
        return res.status(400).json({ message: "Please provide a valid phone number starting with + (e.g. +447700900000)." });
      }
      if (!channel || !['whatsapp', 'sms'].includes(channel)) {
        return res.status(400).json({ message: "Channel must be 'whatsapp' or 'sms'." });
      }

      const userPlan = req.user.subscriptionStatus || "free";
      if (!isChannelAllowed(userPlan, channel as "whatsapp" | "sms")) {
        const minPlan = channel === 'whatsapp' ? 'Pro' : 'Unlimited';
        return res.status(403).json({ message: `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} notifications require ${minPlan} plan or above.` });
      }

      cleanupExpiredOtps();

      const rateLimitKey = `${req.user.id}:${channel}`;
      const rateEntry = otpRateLimit.get(rateLimitKey);
      if (rateEntry && rateEntry.resetAt > Date.now() && rateEntry.count >= MAX_OTP_REQUESTS) {
        return res.status(429).json({ message: "Too many verification requests. Please wait 10 minutes before trying again." });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const key = `${req.user.id}:${channel}:${phone_number}`;
      phoneOtpStore.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });

      if (rateEntry && rateEntry.resetAt > Date.now()) {
        rateEntry.count++;
      } else {
        otpRateLimit.set(rateLimitKey, { count: 1, resetAt: Date.now() + OTP_RATE_WINDOW });
      }

      const otpMessage = `Your CheckByAI verification code is: ${code}. It expires in 10 minutes.`;

      let deliveryResult;
      try {
        if (channel === 'sms') {
          deliveryResult = await sendSMS(phone_number, otpMessage);
        } else {
          deliveryResult = await sendWhatsApp(phone_number, otpMessage);
        }
      } catch (sendErr: any) {
        console.error(`[NotificationOTP] Error sending OTP via ${channel}:`, sendErr.message);
        phoneOtpStore.delete(key);
        return res.status(502).json({ message: `Failed to deliver verification code via ${channel}. Please check the number and try again.` });
      }

      if (!deliveryResult.success) {
        console.error(`[NotificationOTP] ${channel} delivery failed for ${phone_number}: ${deliveryResult.error}`);
        phoneOtpStore.delete(key);
        return res.status(502).json({ message: `Failed to deliver verification code via ${channel}. Please check the number and try again.` });
      }

      console.log(`[NotificationOTP] Code sent via ${channel} to ${phone_number} (user ${req.user.id})`);

      res.json({ message: `Verification code sent to ${phone_number} via ${channel}.` });
    } catch (error) {
      console.error("Error sending verification code:", error);
      res.status(500).json({ message: "Failed to send verification code." });
    }
  });

  app.post('/api/notification-preferences/confirm-phone', isAuthenticated, async (req: any, res) => {
    try {
      const { phone_number, channel, code } = req.body;

      if (!phone_number || !channel || !code) {
        return res.status(400).json({ message: "Phone number, channel, and code are required." });
      }
      if (!['whatsapp', 'sms'].includes(channel)) {
        return res.status(400).json({ message: "Channel must be 'whatsapp' or 'sms'." });
      }

      cleanupExpiredOtps();

      const key = `${req.user.id}:${channel}:${phone_number}`;
      const stored = phoneOtpStore.get(key);

      if (!stored) {
        return res.status(400).json({ message: "No verification code found. Please request a new code." });
      }
      if (stored.expiresAt < Date.now()) {
        phoneOtpStore.delete(key);
        return res.status(400).json({ message: "Verification code has expired. Please request a new code." });
      }
      if (stored.attempts >= MAX_OTP_ATTEMPTS) {
        phoneOtpStore.delete(key);
        return res.status(429).json({ message: "Too many failed attempts. Please request a new code." });
      }
      if (stored.code !== String(code).trim()) {
        stored.attempts++;
        return res.status(400).json({ message: "Invalid verification code." });
      }

      phoneOtpStore.delete(key);

      const userId = req.user.id;
      const existing = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);

      const encryptedNumber = encryptPhone(phone_number);
      const updateFields = channel === 'whatsapp'
        ? { whatsappNumber: encryptedNumber, whatsappVerified: true, updatedAt: new Date() }
        : { smsNumber: encryptedNumber, smsVerified: true, updatedAt: new Date() };

      if (existing.length > 0) {
        await db
          .update(notificationPreferences)
          .set(updateFields)
          .where(eq(notificationPreferences.userId, userId));
      } else {
        await db.insert(notificationPreferences).values({
          userId,
          emailEnabled: true,
          email: req.user.email || null,
          ...updateFields,
        });
      }

      res.json({ message: `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} number verified successfully.` });
    } catch (error) {
      console.error("Error confirming phone:", error);
      res.status(500).json({ message: "Failed to verify phone number." });
    }
  });

  // Notification history endpoint
  app.get('/api/notifications/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const results = await db
        .select({
          id: notificationLog.id,
          channel: notificationLog.channel,
          status: notificationLog.status,
          sentAt: notificationLog.sentAt,
          organisationName: sponsorChanges.organisationName,
          changeType: sponsorChanges.changeType,
          previousValue: sponsorChanges.previousValue,
          newValue: sponsorChanges.newValue,
          detectedAt: sponsorChanges.detectedAt,
        })
        .from(notificationLog)
        .innerJoin(sponsorChanges, eq(notificationLog.changeId, sponsorChanges.id))
        .where(eq(notificationLog.userId, userId))
        .orderBy(desc(notificationLog.sentAt))
        .limit(50);

      res.json(results);
    } catch (error) {
      console.error("Error fetching notification history:", error);
      res.status(500).json({ message: "Failed to fetch notification history." });
    }
  });

  // Stats endpoint
  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Admin routes
  app.get('/api/admin/trusted-patterns', isAdmin, async (req, res) => {
    try {
      const patterns = await storage.getTrustedPatterns();
      res.json(patterns);
    } catch (error) {
      console.error("Error fetching trusted patterns:", error);
      res.status(500).json({ message: "Failed to fetch trusted patterns" });
    }
  });

  app.post('/api/admin/trusted-patterns', isAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Extract metadata and patterns from uploaded file using Node.js
      const pdfAnalyzer = new PDFAnalyzer();
      const metadata = await pdfAnalyzer.extractMetadata(req.file.path);
      // For trusted patterns, we'll store the metadata as the pattern
      const patterns = { metadata, documentType: 'trusted_cos' };
      
      // Get optional AI instructions from request body
      const aiInstructions = req.body?.aiInstructions || null;
      
      const patternId = await storage.createTrustedPattern(
        req.file.originalname,
        metadata,
        patterns,
        aiInstructions
      );

      res.json({ id: patternId, message: 'Trusted pattern created successfully', aiInstructions: !!aiInstructions });
    } catch (error) {
      console.error("Error creating trusted pattern:", error);
      res.status(500).json({ message: "Failed to create trusted pattern" });
    }
  });

  app.delete('/api/admin/trusted-patterns/:id', isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTrustedPattern(id);
      res.json({ message: 'Trusted pattern deleted successfully' });
    } catch (error) {
      console.error("Error deleting trusted pattern:", error);
      res.status(500).json({ message: "Failed to delete trusted pattern" });
    }
  });

  // Admin-only metadata extraction (no rate limiting, no verification record)
  app.post('/api/admin/extract-metadata', isAdmin, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const pdfAnalyzer = new PDFAnalyzer();
      const metadata = await pdfAnalyzer.extractMetadata(req.file.path);

      res.json({
        metadata: {
          producer: metadata.producer,
          creator: metadata.creator,
          created: metadata.creationDate,
          modified: metadata.modificationDate,
          fontCount: metadata.fontCount,
          fonts: metadata.fonts,
          pdfVersion: metadata.pdfVersion,
          isEncrypted: metadata.isEncrypted,
          hasDigitalSignature: metadata.hasDigitalSignature,
        },
        forensic: metadata.forensic,
      });
    } catch (error) {
      console.error("Error extracting metadata:", error);
      res.status(500).json({ message: "Failed to extract metadata" });
    } finally {
      // Clean up uploaded file
      if (req.file?.path) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  });

  app.get('/api/admin/recent-activity', isAdmin, async (req, res) => {
    try {
      const activity = await storage.getRecentActivity(20);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  // Paginated verification logs with filtering
  app.get('/api/admin/verification-logs', isAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const status = req.query.status as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const search = req.query.search as string | undefined;
      
      const result = await storage.getPaginatedVerificationLogs({
        page,
        limit,
        status,
        startDate,
        endDate,
        search
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching verification logs:", error);
      res.status(500).json({ message: "Failed to fetch verification logs" });
    }
  });

  // AI forensic analysis of a verification result
  app.post('/api/admin/analyze-reasoning/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const verification = await storage.getVerificationById(id);
      
      if (!verification) {
        return res.status(404).json({ message: "Verification not found" });
      }

      // Fetch global AI rules, trusted patterns, and HITL knowledge for context
      const globalRules = await storage.getActiveGlobalAiRules();
      const trustedPatterns = await storage.getTrustedPatterns();
      const hitlKnowledge = await storage.getAdminFakeKnowledge(15); // Last 15 admin-flagged fakes
      
      // Build knowledge context
      let knowledgeContext = '';
      
      if (globalRules.length > 0) {
        knowledgeContext += '\n<admin_global_rules>\n';
        globalRules.forEach((rule, idx) => {
          knowledgeContext += `Rule #${idx + 1} [${rule.category}] (Priority: ${rule.priority}): ${rule.ruleText}\n`;
        });
        knowledgeContext += '</admin_global_rules>\n';
      }
      
      // HITL Knowledge: Human expert feedback on previously flagged fakes
      if (hitlKnowledge.length > 0) {
        knowledgeContext += '\n<human_expert_corrections>\n';
        knowledgeContext += 'CRITICAL: The following documents were marked as FAKE by human experts after the AI called them genuine or suspicious.\n';
        knowledgeContext += 'Learn from these corrections and DO NOT repeat the same mistakes.\n\n';
        hitlKnowledge.forEach((entry, idx) => {
          const metadata = entry.metadata as any;
          knowledgeContext += `[Case ${idx + 1}]\n`;
          knowledgeContext += `  File: ${entry.filename}\n`;
          knowledgeContext += `  Producer: ${metadata?.producer || 'Unknown'}\n`;
          knowledgeContext += `  AI said: ${entry.result} (${entry.confidence}% confidence)\n`;
          knowledgeContext += `  Human verdict: FAKE\n`;
          knowledgeContext += `  Expert reasoning: ${entry.adminFeedback || 'No details'}\n\n`;
        });
        knowledgeContext += '</human_expert_corrections>\n';
      }
      
      // Find matching pattern instructions based on producer
      const docProducer = (verification.metadata as any)?.producer || '';
      const matchingPatterns = trustedPatterns.filter(p => {
        const patternProducer = (p.metadata as any)?.producer || '';
        return patternProducer && docProducer.toLowerCase().includes(patternProducer.toLowerCase().split(' ')[0]);
      });
      
      if (matchingPatterns.length > 0) {
        knowledgeContext += '\n<pattern_specific_instructions>\n';
        matchingPatterns.forEach(p => {
          if (p.aiInstructions) {
            knowledgeContext += `Pattern "${p.filename}": ${p.aiInstructions}\n`;
          }
        });
        knowledgeContext += '</pattern_specific_instructions>\n';
      }

      // Set up SSE for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const { createChatCompletionWithFallback, getAvailableProviders, hasAnyProvider } = await import('./services/aiService');

      if (!hasAnyProvider()) {
        return res.status(503).json({ message: 'No AI providers are currently available. Please configure at least one AI integration.' });
      }

      const systemPrompt = `You are a forensic document analyst specializing in UK Certificate of Sponsorship (COS) documents. 
Analyze documents based on metadata AND the specific forensic knowledge base provided below.

${knowledgeContext ? `<knowledge_base>\n${knowledgeContext}\n</knowledge_base>` : ''}

CRITICAL INSTRUCTIONS:
1. Your previous outputs have been OVERCONFIDENT. You must now PRIORITIZE 'Forensic Metadata' over visual appearance.
2. When making your analysis, you MUST explicitly state if you are following any specific Admin Rules or Human Expert Corrections from the knowledge base.
3. If human experts have previously flagged similar patterns as FAKE, lower your confidence and flag the document accordingly.
4. For example: "Per Admin Rule #3 regarding Sunday modifications, this document is flagged as suspicious."
5. Or: "Per Human Expert Correction Case #2, this producer pattern was previously identified as fake."
6. Be conservative - it is better to flag a genuine document as suspicious than to miss a fake.`;

      const prompt = `Analyze the following verification result and provide expert insights.

Verification Result:
- Status: ${verification.result}
- Confidence: ${verification.confidence}%
- Filename: ${verification.filename}

Metadata:
${JSON.stringify(verification.metadata, null, 2)}

Analysis Details:
${JSON.stringify(verification.analysisDetails, null, 2)}

Provide a detailed forensic analysis covering:
1. **Summary**: Brief overview of the document's authenticity assessment
2. **Key Findings**: Most significant indicators that influenced the verdict
3. **Admin Rules Applied**: List any admin rules from the knowledge base that influenced this analysis
4. **Red Flags**: Any suspicious patterns or anomalies detected
5. **Legitimate Indicators**: Evidence supporting authenticity
6. **Recommendations**: Next steps for the admin or user
7. **Confidence Assessment**: Explain why the confidence level is ${verification.confidence}%

Format your response in clear, professional markdown.`;

      // Use fallback AI service (OpenAI -> Claude -> DeepSeek)
      const { stream, provider } = await createChatCompletionWithFallback([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ], { maxTokens: 2000 });

      res.write(`data: ${JSON.stringify({ provider, availableProviders: getAvailableProviders() })}\n\n`);

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in AI analysis:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to analyze verification" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Analysis failed" })}\n\n`);
        res.end();
      }
    }
  });

  // System health endpoint
  app.get('/api/admin/system-health', isAdmin, async (req, res) => {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      // Get database connection status
      let dbStatus = 'healthy';
      let dbConnectionCount = 0;
      try {
        const result = await db.execute(sql`SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()`);
        dbConnectionCount = Number((result.rows[0] as any)?.count || 0);
      } catch (e) {
        dbStatus = 'error';
      }

      // Get verification stats for last 24 hours
      const stats = await storage.getStats();

      res.json({
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
        uptime: Math.round(uptime),
        database: {
          status: dbStatus,
          connections: dbConnectionCount,
        },
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching system health:", error);
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  // Manual trigger for sponsor monitor job
  app.post('/api/admin/sponsor-monitor/run', isAdmin, async (req: any, res) => {
    try {
      if (isJobRunning()) {
        return res.status(409).json({ message: "Sponsor monitor job is already running. Please wait for it to finish." });
      }

      res.json({ message: "Sponsor monitor job started. This may take several minutes." });

      runSponsorMonitorJob("manual-admin", true).catch((err) => {
        console.error("[SponsorMonitorJob] Manual run error:", err);
      });
    } catch (error) {
      console.error("Error triggering sponsor monitor job:", error);
      res.status(500).json({ message: "Failed to trigger sponsor monitor job." });
    }
  });

  // Initialize sponsor monitor with first snapshot
  app.post('/api/admin/sponsor-monitor/initialize', isAdmin, async (req: any, res) => {
    try {
      const existingDate = await getLatestSnapshotDate();
      if (existingDate) {
        return res.status(409).json({
          message: `A snapshot already exists (${existingDate}). Use the daily run or manual trigger to update.`,
          latestSnapshot: existingDate,
        });
      }

      console.log("[SponsorMonitor] Admin-triggered initialization starting...");
      const records = await downloadAndParseSponsorList();

      if (records.length === 0) {
        return res.status(502).json({ message: "CSV download returned 0 records. The gov.uk data source may be temporarily unavailable." });
      }

      const today = new Date().toISOString().split("T")[0];
      await storeSnapshot(records, today);
      await rebuildSponsorIndex();

      console.log(`[SponsorMonitor] Initialization complete: ${records.length} records stored for ${today}`);
      res.json({
        message: "Initial snapshot loaded successfully.",
        snapshotDate: today,
        recordCount: records.length,
      });
    } catch (error: any) {
      console.error("[SponsorMonitor] Initialization failed:", error);
      res.status(500).json({ message: "Failed to initialize sponsor monitor. " + (error.message || "") });
    }
  });

  // Sponsor monitor status dashboard
  app.get('/api/admin/sponsor-monitor/status', isAdmin, async (req: any, res) => {
    try {
      const latestDate = await getLatestSnapshotDate();

      let snapshotRecordCount = 0;
      if (latestDate) {
        const countResult = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(sponsorList)
          .where(eq(sponsorList.snapshotDate, latestDate));
        snapshotRecordCount = countResult[0]?.count ?? 0;
      }

      const lastRunChanges = await db
        .select({
          changeType: sponsorChanges.changeType,
          count: sql<number>`count(*)::int`,
          snapshotDate: sponsorChanges.snapshotDate,
        })
        .from(sponsorChanges)
        .groupBy(sponsorChanges.snapshotDate, sponsorChanges.changeType)
        .orderBy(desc(sponsorChanges.snapshotDate))
        .limit(20);

      let lastRunDate: string | null = null;
      const lastRunSummary: Record<string, number> = {};
      if (lastRunChanges.length > 0) {
        lastRunDate = lastRunChanges[0].snapshotDate;
        for (const row of lastRunChanges) {
          if (row.snapshotDate === lastRunDate) {
            lastRunSummary[row.changeType] = row.count;
          }
        }
      }

      const lastRunMemory = getLastRunInfo();

      const activeWatchResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(companyWatches)
        .where(eq(companyWatches.isActive, true));
      const activeWatchCount = activeWatchResult[0]?.count ?? 0;

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const notifResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationLog)
        .where(
          and(
            eq(notificationLog.status, "sent"),
            gte(notificationLog.sentAt, oneDayAgo)
          )
        );
      const notificationsSent24h = notifResult[0]?.count ?? 0;

      res.json({
        latestSnapshot: latestDate,
        snapshotRecordCount,
        lastRun: lastRunMemory || (lastRunDate ? { date: lastRunDate, success: true, changes: lastRunSummary } : null),
        activeWatchCount,
        notificationsSent24h,
        jobRunning: isJobRunning(),
      });
    } catch (error) {
      console.error("Error fetching sponsor monitor status:", error);
      res.status(500).json({ message: "Failed to fetch sponsor monitor status." });
    }
  });

  app.get('/api/admin/sponsor-monitor/recent-changes', isAdmin, async (req: any, res) => {
    try {
      const changes = await db
        .select({
          id: sponsorChanges.id,
          organisationName: sponsorChanges.organisationName,
          changeType: sponsorChanges.changeType,
          previousValue: sponsorChanges.previousValue,
          newValue: sponsorChanges.newValue,
          detectedAt: sponsorChanges.detectedAt,
          snapshotDate: sponsorChanges.snapshotDate,
        })
        .from(sponsorChanges)
        .orderBy(desc(sponsorChanges.detectedAt))
        .limit(50);
      res.json(changes);
    } catch (error) {
      console.error("Error fetching recent changes:", error);
      res.status(500).json({ message: "Failed to fetch recent changes." });
    }
  });

  app.get('/api/admin/sponsor-monitor/top-watched', isAdmin, async (req: any, res) => {
    try {
      const topWatched = await db
        .select({
          organisationName: companyWatches.organisationName,
          watcherCount: sql<number>`count(*)::int`,
        })
        .from(companyWatches)
        .where(eq(companyWatches.isActive, true))
        .groupBy(companyWatches.organisationName)
        .orderBy(desc(sql`count(*)`))
        .limit(20);
      res.json(topWatched);
    } catch (error) {
      console.error("Error fetching top watched:", error);
      res.status(500).json({ message: "Failed to fetch top watched companies." });
    }
  });

  app.get('/api/admin/sponsor-monitor/notification-stats', isAdmin, async (req: any, res) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const stats = await db
        .select({
          channel: notificationLog.channel,
          status: notificationLog.status,
          count: sql<number>`count(*)::int`,
          day: sql<string>`date_trunc('day', ${notificationLog.sentAt})::date::text`,
        })
        .from(notificationLog)
        .where(gte(notificationLog.sentAt, sevenDaysAgo))
        .groupBy(notificationLog.channel, notificationLog.status, sql`date_trunc('day', ${notificationLog.sentAt})`)
        .orderBy(desc(sql`date_trunc('day', ${notificationLog.sentAt})`));
      res.json(stats);
    } catch (error) {
      console.error("Error fetching notification stats:", error);
      res.status(500).json({ message: "Failed to fetch notification stats." });
    }
  });

  // Sponsor monitor storage stats
  app.get('/api/admin/sponsor-monitor/storage', isAdmin, async (req: any, res) => {
    try {
      const totalResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sponsorList);
      const totalRecords = totalResult[0]?.count ?? 0;

      const dateRange = await db
        .select({
          earliest: sql<string>`min(${sponsorList.snapshotDate})::text`,
          latest: sql<string>`max(${sponsorList.snapshotDate})::text`,
          snapshotCount: sql<number>`count(distinct ${sponsorList.snapshotDate})::int`,
        })
        .from(sponsorList);

      res.json({
        totalRecords,
        earliestSnapshot: dateRange[0]?.earliest || null,
        latestSnapshot: dateRange[0]?.latest || null,
        snapshotCount: dateRange[0]?.snapshotCount ?? 0,
      });
    } catch (error) {
      console.error("Error fetching sponsor storage stats:", error);
      res.status(500).json({ message: "Failed to fetch storage stats." });
    }
  });

  // Cleanup old sponsor snapshots (keep only latest)
  app.post('/api/admin/sponsor-monitor/cleanup', isAdmin, async (req: any, res) => {
    try {
      const latestDate = await getLatestSnapshotDate();
      if (!latestDate) {
        return res.status(404).json({ message: "No snapshots found to clean up." });
      }

      const countBefore = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sponsorList);
      const totalBefore = countBefore[0]?.count ?? 0;

      await db.delete(sponsorList).where(
        sql`${sponsorList.snapshotDate} < ${latestDate}`
      );

      const countAfter = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sponsorList);
      const totalAfter = countAfter[0]?.count ?? 0;
      const deletedRecords = totalBefore - totalAfter;

      res.json({
        message: `Cleaned up ${deletedRecords.toLocaleString()} old records. Kept latest snapshot (${latestDate}).`,
        deletedRecords,
        remainingRecords: totalAfter,
        keptSnapshot: latestDate,
      });
    } catch (error) {
      console.error("Error cleaning up sponsor snapshots:", error);
      res.status(500).json({ message: "Failed to clean up old snapshots." });
    }
  });

  app.post('/api/admin/migrate-canonical', isAdmin, async (req: any, res) => {
    try {
      const existingCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sponsorCanonical);

      if ((existingCount[0]?.count ?? 0) > 0) {
        return res.status(409).json({
          message: `Canonical table already has ${existingCount[0].count} records. To re-run, clear the table first.`,
          existingCount: existingCount[0].count,
        });
      }

      const latestDate = await getLatestSnapshotDate();
      if (!latestDate) {
        return res.status(404).json({ message: "No sponsor list snapshots found. Run the monitor job first." });
      }

      const snapshot = await db
        .select()
        .from(sponsorList)
        .where(eq(sponsorList.snapshotDate, latestDate));

      if (snapshot.length === 0) {
        return res.status(404).json({ message: "Latest snapshot is empty." });
      }

      const today = new Date().toISOString().split("T")[0];
      let inserted = 0;
      let skipped = 0;
      const batchSize = 500;
      const canonicalRecords = snapshot.map((r) => {
        const fp = generateFingerprint(r.organisationName, r.townCity || "", r.route || "");
        return {
          fingerprint: fp,
          currentName: r.organisationName,
          townCity: r.townCity || null,
          typeRating: r.typeRating || null,
          route: r.route || null,
          status: "ACTIVE" as const,
          firstSeen: today,
          lastSeen: today,
          consecutiveMisses: 0,
          historicalNames: [] as string[],
        };
      });

      const seen = new Set<string>();
      const deduplicated = canonicalRecords.filter((r) => {
        if (seen.has(r.fingerprint)) {
          skipped++;
          return false;
        }
        seen.add(r.fingerprint);
        return true;
      });

      for (let i = 0; i < deduplicated.length; i += batchSize) {
        const batch = deduplicated.slice(i, i + batchSize);
        await db.insert(sponsorCanonical).values(batch).onConflictDoNothing();
        inserted += batch.length;
      }

      await (await import("./utils/sponsorSearch")).rebuildSponsorIndex();

      console.log(`[Migration] Canonical table populated: ${inserted} records inserted, ${skipped} duplicates skipped from snapshot ${latestDate}.`);

      res.json({
        message: `Migration complete. ${inserted} canonical records created from snapshot ${latestDate}.`,
        inserted,
        skipped,
        snapshotDate: latestDate,
        snapshotRecords: snapshot.length,
      });
    } catch (error) {
      console.error("Error migrating canonical data:", error);
      res.status(500).json({ message: "Failed to migrate canonical data." });
    }
  });

  // Public sponsor changes endpoint (last 7 days, grouped by date)
  app.get('/api/sponsor-changes', async (req, res) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const changes = await db
        .select({
          id: sponsorChanges.id,
          organisationName: sponsorChanges.organisationName,
          changeType: sponsorChanges.changeType,
          previousValue: sponsorChanges.previousValue,
          newValue: sponsorChanges.newValue,
          detectedAt: sponsorChanges.detectedAt,
          snapshotDate: sponsorChanges.snapshotDate,
        })
        .from(sponsorChanges)
        .where(gte(sponsorChanges.detectedAt, sevenDaysAgo))
        .orderBy(desc(sponsorChanges.detectedAt))
        .limit(500);

      const grouped: Record<string, typeof changes> = {};
      for (const change of changes) {
        const dateKey = change.snapshotDate || (change.detectedAt ? new Date(change.detectedAt).toISOString().split('T')[0] : 'unknown');
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(change);
      }

      res.json({ changes, grouped, totalCount: changes.length });
    } catch (error) {
      console.error("Error fetching public sponsor changes:", error);
      res.status(500).json({ message: "Failed to fetch sponsor changes." });
    }
  });

  // Admin test endpoint for simulated detection cycle
  app.post('/api/admin/sponsor-monitor/test', isAdmin, async (req: any, res) => {
    try {
      const { organisationName, changeType, previousValue, newValue } = req.body;

      if (!organisationName || !changeType) {
        return res.status(400).json({ message: "organisationName and changeType are required." });
      }

      const validTypes = ["REMOVED", "ADDED", "DOWNGRADED", "UPGRADED", "ROUTE_CHANGE"];
      if (!validTypes.includes(changeType)) {
        return res.status(400).json({ message: `changeType must be one of: ${validTypes.join(", ")}` });
      }

      const today = new Date().toISOString().split("T")[0];
      const [savedChange] = await db
        .insert(sponsorChanges)
        .values({
          organisationName,
          changeType,
          previousValue: previousValue || null,
          newValue: newValue || null,
          snapshotDate: today,
        })
        .returning();

      const { notifyAffectedUsers } = await import("./utils/notificationDispatcher");
      const notifResult = await notifyAffectedUsers(savedChange);

      res.json({
        message: "Test change created and notifications dispatched.",
        change: savedChange,
        notifications: notifResult,
      });
    } catch (error) {
      console.error("Error running sponsor monitor test:", error);
      res.status(500).json({ message: "Failed to run test detection cycle." });
    }
  });

  // Trust producer from verification - Pattern Override
  app.post('/api/admin/trust-producer', isAdmin, async (req: any, res) => {
    try {
      const trustProducerSchema = z.object({
        producer: z.string().trim().min(1, "Producer name is required").max(500),
        verificationId: z.number().int().optional(),
      });
      const tpParsed = trustProducerSchema.safeParse(req.body);
      if (!tpParsed.success) {
        return res.status(400).json({ message: tpParsed.error.errors.map(e => e.message).join(', ') });
      }
      const { producer, verificationId } = tpParsed.data;

      // Get the verification to extract metadata
      const verification = await storage.getVerificationById(verificationId);
      
      // Create a trusted pattern from this producer
      const patternId = await storage.createTrustedPattern(
        `trusted-producer-${producer.replace(/\s+/g, '-').toLowerCase()}`,
        { 
          producer,
          source: 'pattern-override',
          trustedAt: new Date().toISOString(),
          sourceVerificationId: verificationId,
        },
        { trustedProducers: [producer] }
      );

      res.json({ 
        message: `Producer "${producer}" is now trusted`,
        patternId
      });
    } catch (error) {
      console.error("Error trusting producer:", error);
      res.status(500).json({ message: "Failed to trust producer" });
    }
  });

  // User management - list users with stats
  app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const search = req.query.search as string | undefined;
      
      const result = await storage.getPaginatedUsers({ page, limit, search });
      res.json(result);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Restrict/unrestrict user
  app.post('/api/admin/users/:id/restrict', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { restricted, reason } = req.body;
      
      await storage.updateUserRestriction(userId, restricted, reason);

      const targetUser = await storage.getUser(userId);
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && targetUser?.email) {
        const html = restricted
          ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">Account Restricted</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Your CheckByAI account has been restricted${reason ? `: <strong>${reason}</strong>` : '.'}</p>
                <p style="color:#333;font-size:15px;">If you believe this is a mistake, please contact us at <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a>.</p>
              </div>
            </div>`
          : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#16a34a 0%,#22c55e 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">Account Restriction Removed</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Good news — the restriction on your CheckByAI account has been lifted. You now have full access again.</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="https://checkbyai.net/dashboard" style="background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Dashboard</a>
                </div>
                <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
              </div>
            </div>`;
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            from: "CheckByAI <noreply@checkbyai.net>",
            to: [targetUser.email],
            subject: restricted ? "Your CheckByAI account has been restricted" : "Your CheckByAI account restriction has been removed",
            html,
          }),
        }).catch(err => console.error("[Restrict] Email error:", err));
      }
      
      res.json({ 
        message: restricted ? 'User has been restricted' : 'User restriction removed',
        userId,
        restricted
      });
    } catch (error) {
      console.error("Error updating user restriction:", error);
      res.status(500).json({ message: "Failed to update user restriction" });
    }
  });

  // Set user verification limit (admin only)
  app.patch('/api/admin/users/:id/limit', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const limitSchema = z.object({
        limit: z.union([z.literal(null), z.literal(-1), z.number().int().positive()]),
      });
      const limitParsed = limitSchema.safeParse(req.body);
      if (!limitParsed.success) {
        return res.status(400).json({ message: "limit must be null, -1 (unlimited), or a positive integer" });
      }
      const { limit } = limitParsed.data;
      
      const updatedUser = await storage.updateUserVerificationLimit(userId, limit);
      
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      let limitDescription = 'Default (1/day)';
      if (limit === -1) limitDescription = 'Unlimited';
      else if (limit !== null && limit > 0) limitDescription = `${limit} verifications`;

      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && updatedUser.email) {
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);padding:28px;border-radius:10px 10px 0 0;">
            <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">Verification Limit Updated</h1>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
            <p style="color:#333;font-size:15px;margin-top:0;">Your COS verification limit has been updated by an administrator.</p>
            <div style="background:#f0f4ff;padding:16px;border-radius:8px;margin:16px 0;text-align:center;">
              <span style="font-size:22px;font-weight:bold;color:#1d4ed8;">${limitDescription}</span>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="https://checkbyai.net/dashboard" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Go to Dashboard</a>
            </div>
            <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
          </div>
        </div>`;
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            from: "CheckByAI <noreply@checkbyai.net>",
            to: [updatedUser.email],
            subject: "Your COS verification limit has been updated",
            html,
          }),
        }).catch(err => console.error("[Limit] Email error:", err));
      }
      
      res.json({ 
        message: `Verification limit set to: ${limitDescription}`,
        userId,
        verificationLimit: limit
      });
    } catch (error) {
      console.error("Error updating user verification limit:", error);
      res.status(500).json({ message: "Failed to update verification limit" });
    }
  });

  // Approve or revoke CoS Check beta access (admin only)
  app.patch('/api/admin/users/:id/cos-approval', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { approved } = req.body;

      if (typeof approved !== 'boolean') {
        return res.status(400).json({ message: 'approved must be a boolean' });
      }

      await storage.updateCosCheckApproval(userId, approved);
      const updatedUser = await storage.getUser(userId);

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Send email to user on approval or revocation
      if (updatedUser.email) {
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const html = approved
            ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);padding:28px;border-radius:10px 10px 0 0;">
                  <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127381; CoS Check Access Approved</h1>
                </div>
                <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                  <p style="color:#333;font-size:15px;margin-top:0;">Great news — your account has been approved for <strong>CoS Check</strong>.</p>
                  <p style="color:#333;font-size:15px;">You can now upload and verify Certificates of Sponsorship using our forensic AI detection system.</p>
                  <div style="text-align:center;margin:24px 0;">
                    <a href="https://checkbyai.net/dashboard" style="background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Start Verifying</a>
                  </div>
                  <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
                </div>
              </div>`
            : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:linear-gradient(135deg,#6b7280 0%,#9ca3af 100%);padding:28px;border-radius:10px 10px 0 0;">
                  <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">CoS Check Access Removed</h1>
                </div>
                <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                  <p style="color:#333;font-size:15px;margin-top:0;">Your CoS Check access has been removed by an administrator.</p>
                  <p style="color:#333;font-size:15px;">If you believe this is a mistake, please contact us at <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a>.</p>
                </div>
              </div>`;
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
              from: "CheckByAI <noreply@checkbyai.net>",
              to: [updatedUser.email],
              subject: approved ? "Your CoS Check access has been approved" : "Your CoS Check access has been removed",
              html,
            }),
          }).catch(err => console.error("[CoS Approval] Email error:", err));
        }
      }

      res.json({
        message: approved ? 'Beta access granted' : 'Beta access revoked',
        userId,
        cosCheckApproved: approved,
      });
    } catch (error) {
      console.error("Error updating CoS Check approval:", error);
      res.status(500).json({ message: "Failed to update beta approval" });
    }
  });

  // Get all system settings (admin only)
  app.get('/api/admin/system-settings', isAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAllSystemSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching system settings:", error);
      res.status(500).json({ message: "Failed to fetch system settings" });
    }
  });

  // Update a system setting (admin only)
  app.patch('/api/admin/system-settings/:key', isAdmin, async (req: any, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (value === undefined || value === null) {
        return res.status(400).json({ message: 'value is required' });
      }
      await storage.setSystemSetting(key, String(value));
      res.json({ message: `Setting '${key}' updated`, key, value: String(value) });
    } catch (error) {
      console.error("Error updating system setting:", error);
      res.status(500).json({ message: "Failed to update system setting" });
    }
  });

  // Set IP exemption for a user (admin only)
  app.patch('/api/admin/users/:id/ip-exempt', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { exempt } = req.body;
      if (typeof exempt !== 'boolean') {
        return res.status(400).json({ message: 'exempt must be a boolean' });
      }
      await storage.updateIpExempt(userId, exempt);
      res.json({ message: exempt ? 'IP rate limit exemption granted' : 'IP rate limit exemption removed', userId, ipExempt: exempt });
    } catch (error) {
      console.error("Error updating IP exemption:", error);
      res.status(500).json({ message: "Failed to update IP exemption" });
    }
  });

  // Set COS check subscription for a user (admin only)
  app.patch('/api/admin/users/:id/cos-subscription', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { active } = req.body;
      if (typeof active !== 'boolean') {
        return res.status(400).json({ message: 'active must be a boolean' });
      }
      await storage.updateCosCheckSubscription(userId, active);

      const targetUser = await storage.getUser(userId);
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey && targetUser?.email) {
        const html = active
          ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">&#127881; COS Check Subscription Activated</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Your <strong>COS Check subscription</strong> has been activated. You now have full access to COS document verification.</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="https://checkbyai.net/dashboard" style="background:#059669;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">Start Verifying</a>
                </div>
                <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">Questions? <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a></p>
              </div>
            </div>`
          : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#6b7280 0%,#9ca3af 100%);padding:28px;border-radius:10px 10px 0 0;">
                <h1 style="color:#fff;margin:0;text-align:center;font-size:20px;">COS Check Subscription Deactivated</h1>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
                <p style="color:#333;font-size:15px;margin-top:0;">Your COS Check subscription has been deactivated.</p>
                <p style="color:#333;font-size:15px;">If you have questions, please contact us at <a href="mailto:support@checkbyai.net" style="color:#1d4ed8;">support@checkbyai.net</a>.</p>
              </div>
            </div>`;
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            from: "CheckByAI <noreply@checkbyai.net>",
            to: [targetUser.email],
            subject: active ? "Your COS Check subscription has been activated" : "Your COS Check subscription has been deactivated",
            html,
          }),
        }).catch(err => console.error("[COS Subscription] Email error:", err));
      }

      res.json({ message: active ? 'COS check subscription activated' : 'COS check subscription deactivated', userId, cosCheckSubscription: active });
    } catch (error) {
      console.error("Error updating COS check subscription:", error);
      res.status(500).json({ message: "Failed to update COS check subscription" });
    }
  });

  // Delete a user (admin only — cannot delete admin accounts)
  app.delete('/api/admin/users/:id', isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (targetUser.role === 'admin') {
        return res.status(403).json({ message: 'Admin accounts cannot be deleted' });
      }
      await storage.deleteUser(userId);
      res.json({ message: 'User deleted successfully', userId });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Export verification as PDF report
  app.get('/api/admin/export-report/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const verification = await storage.getVerificationById(id);
      
      if (!verification) {
        return res.status(404).json({ message: 'Verification not found' });
      }

      // Generate simple text-based report (PDFKit integration would be next step)
      const report = {
        title: 'COS Verification Forensic Report',
        generatedAt: new Date().toISOString(),
        verification: {
          id: verification.id,
          filename: verification.filename,
          result: verification.result,
          confidence: verification.confidence,
          verifiedAt: verification.verifiedAt,
        },
        metadata: verification.metadata,
        analysisDetails: verification.analysisDetails,
      };

      res.json(report);
    } catch (error) {
      console.error("Error exporting report:", error);
      res.status(500).json({ message: "Failed to export report" });
    }
  });

  // Global AI Rules CRUD endpoints
  app.get('/api/admin/global-rules', isAdmin, async (req, res) => {
    try {
      const rules = await storage.getGlobalAiRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching global rules:", error);
      res.status(500).json({ message: "Failed to fetch global rules" });
    }
  });

  const globalRuleSchema = z.object({
    category: z.enum(['date_check', 'producer_check', 'metadata_check', 'pattern_check', 'red_flag', 'trusted_marker']),
    ruleText: z.string().min(5).max(1000),
    priority: z.number().min(0).max(100).optional().default(0),
  });

  app.post('/api/admin/global-rules', isAdmin, async (req: any, res) => {
    try {
      const parsed = globalRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(', ') });
      }

      const { category, ruleText, priority } = parsed.data;

      const rule = await storage.createGlobalAiRule({
        category,
        ruleText,
        priority,
      });

      res.json(rule);
    } catch (error) {
      console.error("Error creating global rule:", error);
      res.status(500).json({ message: "Failed to create global rule" });
    }
  });

  app.patch('/api/admin/global-rules/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { category, ruleText, priority, isActive } = req.body;

      const rule = await storage.updateGlobalAiRule(id, {
        ...(category && { category }),
        ...(ruleText && { ruleText }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
      });

      res.json(rule);
    } catch (error) {
      console.error("Error updating global rule:", error);
      res.status(500).json({ message: "Failed to update global rule" });
    }
  });

  app.delete('/api/admin/global-rules/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGlobalAiRule(id);
      res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
      console.error("Error deleting global rule:", error);
      res.status(500).json({ message: "Failed to delete global rule" });
    }
  });

  app.post('/api/admin/global-rules/:id/toggle', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isActive } = req.body;
      
      await storage.toggleGlobalAiRule(id, isActive);
      res.json({ message: `Rule ${isActive ? 'activated' : 'deactivated'}` });
    } catch (error) {
      console.error("Error toggling global rule:", error);
      res.status(500).json({ message: "Failed to toggle global rule" });
    }
  });

  // Teach AI from verification - creates global rule from forgery markers
  const teachAiSchema = z.object({
    verificationId: z.number().optional(),
    category: z.enum(['date_check', 'producer_check', 'metadata_check', 'pattern_check', 'red_flag', 'trusted_marker']).default('red_flag'),
    ruleText: z.string().min(5).max(1000),
    priority: z.number().min(0).max(100).default(10),
  });

  app.post('/api/admin/teach-ai', isAdmin, async (req: any, res) => {
    try {
      const parsed = teachAiSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(', ') });
      }

      const { verificationId, category, ruleText, priority } = parsed.data;

      // If verificationId provided, we're learning from a specific verification
      let enrichedRuleText = ruleText;
      if (verificationId) {
        const verification = await storage.getVerificationById(verificationId);
        if (verification) {
          enrichedRuleText = `[Learned from verification #${verificationId} - ${verification.result}] ${ruleText}`;
        }
      }

      const rule = await storage.createGlobalAiRule({
        category,
        ruleText: enrichedRuleText,
        priority,
      });

      res.json({ 
        message: 'AI has learned this pattern',
        rule 
      });
    } catch (error) {
      console.error("Error teaching AI:", error);
      res.status(500).json({ message: "Failed to teach AI" });
    }
  });

  // Update trusted pattern AI instructions
  app.patch('/api/admin/trusted-patterns/:id/instructions', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { aiInstructions } = req.body;
      
      await storage.updateTrustedPatternInstructions(id, aiInstructions);
      res.json({ message: 'Pattern instructions updated' });
    } catch (error) {
      console.error("Error updating pattern instructions:", error);
      res.status(500).json({ message: "Failed to update pattern instructions" });
    }
  });

  // Feedback routes
  app.post('/api/feedback', async (req: any, res) => {
    try {
      const feedbackData = insertFeedbackSchema.parse(req.body);
      
      // Add userId if authenticated
      if (req.isAuthenticated()) {
        feedbackData.userId = req.user.id;
      }
      
      const newFeedback = await storage.createFeedback(feedbackData);
      res.json(newFeedback);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid feedback data", errors: error.errors });
      }
      console.error("Error creating feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  app.get('/api/feedback/stats', isAdmin, async (req, res) => {
    try {
      const stats = await storage.getFeedbackStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching feedback stats:", error);
      res.status(500).json({ message: "Failed to fetch feedback stats" });
    }
  });

  // Paid verification routes
  app.post('/api/paid/create-checkout', async (req, res) => {
    try {
      const { packageType, priceAmount } = req.body;
      
      if (!packageType || !['normal', 'full'].includes(packageType)) {
        return res.status(400).json({ message: 'Invalid package type' });
      }

      const prices = {
        normal: 1999, // £19.99 in pence
        full: 4999,   // £49.99 in pence
      };

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'gbp',
              product_data: {
                name: packageType === 'full' ? 'Full CoS Verification Package' : 'Normal CoS Verification',
                description: packageType === 'full' 
                  ? 'Priority review, phone consultation, employer verification, detailed analysis'
                  : 'AI + expert verification with guaranteed report',
              },
              unit_amount: prices[packageType as keyof typeof prices],
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.headers.origin}/submit?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/pricing`,
        metadata: {
          packageType,
        },
      });

      // Create a pending submission record
      const submission = await storage.createPaidSubmission({
        email: '', // Will be updated after payment
        packageType,
        paymentStatus: 'pending',
        stripeSessionId: session.id,
        priority: packageType === 'full',
        phoneConsultationRequested: packageType === 'full',
      });

      res.json({ url: session.url, sessionId: session.id, submissionId: submission.id });
    } catch (error: any) {
      console.error('Checkout creation error:', error);
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  // Get submission by session ID (for after payment)
  app.get('/api/paid/submission/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const submission = await storage.getPaidSubmissionBySessionId(sessionId);
      
      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      // Check if payment is completed
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (session.payment_status === 'paid' && submission.paymentStatus !== 'paid') {
        // Update submission with payment info and customer email
        await storage.updatePaidSubmission(submission.id, {
          paymentStatus: 'paid',
          email: session.customer_details?.email || '',
        });
      }

      const updatedSubmission = await storage.getPaidSubmissionBySessionId(sessionId);
      res.json(updatedSubmission);
    } catch (error: any) {
      console.error('Get submission error:', error);
      res.status(500).json({ message: 'Failed to get submission' });
    }
  });

  // Submit questionnaire and documents
  app.post('/api/paid/submit/:submissionId', upload.fields([
    { name: 'cosDocument', maxCount: 1 },
    { name: 'supportingDocuments', maxCount: 5 },
  ]), async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.submissionId);
      const submission = await storage.getPaidSubmission(submissionId);
      
      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      if (submission.paymentStatus !== 'paid') {
        return res.status(400).json({ message: 'Payment not completed' });
      }

      const {
        howApplied,
        emailsReceived,
        confirmationDetails,
        employerName,
        jobTitle,
        cosReferenceNumber,
        additionalNotes,
      } = req.body;

      // Get file paths
      const cosDocumentPath = req.files?.cosDocument?.[0]?.path || null;
      const supportingDocumentsPath = req.files?.supportingDocuments?.map((f: any) => f.path) || [];

      await storage.updatePaidSubmission(submissionId, {
        howApplied,
        emailsReceived,
        confirmationDetails,
        employerName,
        jobTitle,
        cosReferenceNumber,
        additionalNotes,
        cosDocumentPath,
        supportingDocumentsPath,
        reviewStatus: 'pending',
      });

      res.json({ message: 'Submission received successfully', submissionId });
    } catch (error: any) {
      console.error('Submit error:', error);
      res.status(500).json({ message: 'Failed to submit' });
    }
  });

  // Get submission status
  app.get('/api/paid/status/:submissionId', async (req, res) => {
    try {
      const submissionId = parseInt(req.params.submissionId);
      const submission = await storage.getPaidSubmission(submissionId);
      
      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      res.json({
        id: submission.id,
        packageType: submission.packageType,
        reviewStatus: submission.reviewStatus,
        expertVerdict: submission.expertVerdict,
        reportDelivered: submission.reportDelivered,
        createdAt: submission.createdAt,
      });
    } catch (error: any) {
      console.error('Status error:', error);
      res.status(500).json({ message: 'Failed to get status' });
    }
  });

  // Admin: Get all paid submissions
  app.get('/api/admin/paid-submissions', isAdmin, async (req, res) => {
    try {
      const submissions = await storage.getAllPaidSubmissions();
      res.json(submissions);
    } catch (error: any) {
      console.error('Get submissions error:', error);
      res.status(500).json({ message: 'Failed to get submissions' });
    }
  });

  // Admin: Update submission with expert review
  app.patch('/api/admin/paid-submissions/:id', isAdmin, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const {
        reviewStatus,
        expertVerdict,
        expertConfidence,
        documentAnalysisReport,
        alterationsDetected,
        recommendations,
        employerVerificationResult,
      } = req.body;

      const submission = await storage.updatePaidSubmission(submissionId, {
        reviewStatus,
        expertVerdict,
        expertConfidence,
        documentAnalysisReport,
        alterationsDetected,
        recommendations,
        employerVerificationResult,
        assignedTo: req.user.id,
      });

      res.json(submission);
    } catch (error: any) {
      console.error('Update submission error:', error);
      res.status(500).json({ message: 'Failed to update submission' });
    }
  });

  // Admin: Verify employer sponsor licence
  app.post('/api/admin/paid-submissions/:id/verify-employer', isAdmin, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getPaidSubmission(submissionId);
      
      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      if (submission.packageType !== 'full') {
        return res.status(400).json({ message: 'Employer verification is only available for Full Package' });
      }

      if (!submission.employerName) {
        return res.status(400).json({ message: 'Employer name is required for verification' });
      }

      // UK Home Office Sponsor Licence Register check
      // The register is available at: https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers
      // We'll simulate checking against this and provide structured results
      
      const employerName = submission.employerName.toLowerCase().trim();
      
      // This would normally query an external database or API
      // For now, we provide a structured verification result
      const verificationResult = {
        employerName: submission.employerName,
        verifiedAt: new Date().toISOString(),
        status: 'manual_review_required',
        message: 'Employer verification requires manual check against UK Home Office Sponsor Register',
        recommendedChecks: [
          'Verify employer exists on gov.uk sponsor licence register',
          'Check employer trading name matches',
          'Confirm sponsor licence tier (Skilled Worker)',
          'Check licence is not suspended or revoked',
          'Verify Companies House registration if applicable'
        ],
        governmentResources: {
          sponsorRegister: 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
          companiesHouse: 'https://find-and-update.company-information.service.gov.uk/'
        },
        notes: 'Manual verification against official UK government sources is recommended for highest accuracy.'
      };

      // Update submission with verification result
      await storage.updatePaidSubmission(submissionId, {
        employerVerificationResult: verificationResult,
      });

      res.json({ 
        message: 'Employer verification data recorded', 
        verificationResult 
      });
    } catch (error: any) {
      console.error('Employer verification error:', error);
      res.status(500).json({ message: 'Failed to verify employer' });
    }
  });

  // Admin: Send report to user via email
  app.post('/api/admin/paid-submissions/:id/send-report', isAdmin, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getPaidSubmission(submissionId);
      
      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      if (submission.reviewStatus !== 'completed') {
        return res.status(400).json({ message: 'Review must be completed before sending report' });
      }

      if (!submission.email) {
        return res.status(400).json({ message: 'No email address on file' });
      }

      // Generate HTML report
      const verdictColors: Record<string, string> = {
        genuine: '#22c55e',
        suspicious: '#f59e0b',
        fake: '#ef4444',
        inconclusive: '#6b7280',
      };

      const verdictColor = verdictColors[submission.expertVerdict || 'inconclusive'] || '#6b7280';
      
      const reportHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #003366 0%, #0066CC 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .verdict { background: ${verdictColor}; color: white; padding: 15px 30px; border-radius: 8px; display: inline-block; font-size: 24px; font-weight: bold; text-transform: uppercase; }
            .confidence { font-size: 18px; margin-top: 10px; }
            .section { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .section h3 { color: #003366; margin-top: 0; border-bottom: 2px solid #0066CC; padding-bottom: 10px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .package-badge { background: ${submission.packageType === 'full' ? '#0066CC' : '#6b7280'}; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Certificate of Sponsorship Verification Report</h1>
            <span class="package-badge">${submission.packageType === 'full' ? 'Full Package' : 'Normal Verification'}</span>
          </div>
          <div class="content">
            <div style="text-align: center; margin-bottom: 30px;">
              <div class="verdict">${submission.expertVerdict || 'Pending'}</div>
              <div class="confidence">Confidence: ${submission.expertConfidence || 0}%</div>
            </div>

            <div class="section">
              <h3>Submission Details</h3>
              <p><strong>Employer:</strong> ${submission.employerName || 'Not provided'}</p>
              <p><strong>Job Title:</strong> ${submission.jobTitle || 'Not provided'}</p>
              <p><strong>CoS Reference:</strong> ${submission.cosReferenceNumber || 'Not provided'}</p>
              <p><strong>Submission Date:</strong> ${new Date(submission.createdAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>

            <div class="section">
              <h3>Expert Analysis</h3>
              <p>${submission.documentAnalysisReport || 'No detailed analysis available.'}</p>
            </div>

            ${submission.recommendations ? `
            <div class="section">
              <h3>Recommendations</h3>
              <p>${submission.recommendations}</p>
            </div>
            ` : ''}

            ${submission.packageType === 'full' && submission.employerVerificationResult ? `
            <div class="section">
              <h3>Employer Verification</h3>
              <p>${JSON.stringify(submission.employerVerificationResult)}</p>
            </div>
            ` : ''}
          </div>
          <div class="footer">
            <p>This report was generated by CoS Verify UK</p>
            <p>For questions, contact support@cosverify.uk</p>
            <p>Report ID: ${submission.id} | Generated: ${new Date().toISOString()}</p>
          </div>
        </body>
        </html>
      `;

      // Send email using Resend
      if (!process.env.RESEND_API_KEY) {
        return res.status(500).json({ message: 'Email service not configured' });
      }

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'CoS Verify UK <reports@cosverify.uk>',
          to: [submission.email],
          subject: `Your CoS Verification Report - ${submission.expertVerdict?.toUpperCase() || 'COMPLETE'}`,
          html: reportHtml,
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        console.error('Resend error:', errorData);
        return res.status(500).json({ message: 'Failed to send email' });
      }

      // Update submission as report delivered
      await storage.updatePaidSubmission(submissionId, {
        reportDelivered: true,
        reportDeliveredAt: new Date(),
      });

      res.json({ message: 'Report sent successfully' });
    } catch (error: any) {
      console.error('Send report error:', error);
      res.status(500).json({ message: 'Failed to send report' });
    }
  });

  // ========================================
  // HITL (Human-in-the-Loop) Feedback Routes
  // ========================================

  // Update verification log with admin feedback
  app.patch('/api/logs/:id/feedback', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { adminStatus, adminFeedback, accuracyScore } = req.body;

      if (!['pending', 'approved', 'fake'].includes(adminStatus)) {
        return res.status(400).json({ message: 'Invalid admin status' });
      }

      const verification = await storage.getVerificationById(id);
      if (!verification) {
        return res.status(404).json({ message: 'Verification log not found' });
      }

      // Update the verification with admin feedback — flip result immediately when marking fake
      const updated = await storage.updateVerificationFeedback(id, {
        adminStatus,
        adminFeedback: adminFeedback || null,
        adminReviewedBy: req.user.id,
        adminReviewedAt: new Date(),
        accuracyScore: adminStatus === 'fake' ? 0 : (accuracyScore || null),
        overrideResult: adminStatus === 'fake' ? 'fake' : undefined,
      });

      // Auto-create a permanent Global AI Rule from the admin's reasoning
      if (adminStatus === 'fake' && adminFeedback?.trim()) {
        try {
          const overrideDate = new Date().toISOString().split('T')[0];
          const originalResult = verification.result;
          const originalConfidence = verification.confidence;
          const producer = (verification.metadata as any)?.producer || 'Unknown';
          const ruleText =
            `CRITICAL ADMIN OVERRIDE [${overrideDate}]: Document initially verified as '${originalResult}' (${originalConfidence}% confidence) was confirmed FAKE by a human expert.\n` +
            `Producer: ${producer}\n` +
            `Admin reasoning: ${adminFeedback.trim()}\n` +
            `Action required: Apply heightened scrutiny to documents with similar metadata patterns. Do not classify as Genuine without explicit justification.`;

          await storage.createGlobalAiRule({
            category: 'hitl-override',
            ruleText,
            priority: 100,
            isActive: true,
          });
        } catch (ruleError) {
          console.error('Failed to create AI rule from admin override (non-fatal):', ruleError);
        }
      }

      res.json({ 
        message: 'Feedback recorded',
        verification: updated,
        ruleAdded: adminStatus === 'fake' && !!adminFeedback?.trim(),
      });
    } catch (error) {
      console.error('Error updating verification feedback:', error);
      res.status(500).json({ message: 'Failed to update feedback' });
    }
  });

  // Delete a verification log entry (admin only)
  app.delete('/api/logs/:id', isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const log = await storage.getVerificationById(id);
      if (!log) return res.status(404).json({ message: 'Log not found' });
      await storage.deleteVerificationLog(id);
      res.json({ message: 'Log deleted' });
    } catch (error) {
      console.error('Error deleting verification log:', error);
      res.status(500).json({ message: 'Failed to delete log' });
    }
  });

  // Get knowledge base - aggregated admin "Fake" feedback for AI context injection
  app.get('/api/knowledge-base', isAdmin, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 15;
      const knowledge = await storage.getAdminFakeKnowledge(limit);
      
      // Build knowledge context string for AI prompt injection
      let knowledgeContext = '';
      if (knowledge.length > 0) {
        knowledgeContext = 'IMPORTANT HUMAN FEEDBACK CONTEXT:\n';
        knowledgeContext += 'In previous verifications, human experts have flagged the following patterns as FAKE:\n\n';
        
        knowledge.forEach((entry, idx) => {
          const metadata = entry.metadata as any;
          knowledgeContext += `[Case ${idx + 1}] File: ${entry.filename}\n`;
          knowledgeContext += `Producer: ${metadata?.producer || 'Unknown'}\n`;
          knowledgeContext += `AI said: ${entry.result} (${entry.confidence}% confidence)\n`;
          knowledgeContext += `Admin override: FAKE\n`;
          knowledgeContext += `Admin reasoning: ${entry.adminFeedback || 'No details provided'}\n\n`;
        });

        knowledgeContext += 'DO NOT repeat the mistake of marking similar patterns as Genuine.\n';
        knowledgeContext += 'Prioritize forensic metadata analysis over visual appearance.\n';
      }

      res.json({
        entries: knowledge,
        count: knowledge.length,
        knowledgeContext,
      });
    } catch (error) {
      console.error('Error fetching knowledge base:', error);
      res.status(500).json({ message: 'Failed to fetch knowledge base' });
    }
  });

  // Get verification logs with HITL status for admin review
  app.get('/api/admin/verification-logs-hitl', isAdmin, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const adminStatus = req.query.adminStatus as string;
      
      const logs = await storage.getVerificationLogsWithHITL(page, limit, adminStatus);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching HITL logs:', error);
      res.status(500).json({ message: 'Failed to fetch logs' });
    }
  });

  rebuildSponsorIndex().catch((err) => {
    console.error("[SponsorSearch] Failed to build initial index:", err);
  });

  startSponsorMonitorCron();

  const httpServer = createServer(app);
  return httpServer;
}