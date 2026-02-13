import type { Express } from "express";
import { createServer, type Server } from "http";
import * as fs from "fs";
import * as crypto from "crypto";
import Stripe from "stripe";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, and, desc, inArray, gte } from "drizzle-orm";
import { setupAuth, isAuthenticated, isAdmin } from "./auth";
import { checkIpRateLimit, recordIpVerification, getClientIp, hashIpAddress } from "./ipRateLimit";
import { insertVerificationResultSchema, insertFeedbackSchema, companyWatches, sponsorList, sponsorCanonical, sponsorChanges, notificationPreferences, notificationLog } from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import { PDFAnalyzer } from "./services/pdfAnalyzer";
import bcrypt from "bcrypt";
import { rebuildSponsorIndex, searchSponsors, isIndexReady } from "./utils/sponsorSearch";
import { normalizeName, downloadAndParseSponsorList, storeSnapshot, getLatestSnapshotDate, generateFingerprint } from "./utils/sponsorListFetcher";
import { runSponsorMonitorJob, startSponsorMonitorCron, isJobRunning, getLastRunInfo } from "./utils/sponsorMonitorJob";
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

const processedCheckoutSessions = new Map<string, number>();
const IDEMPOTENCY_MAX_SIZE = 1000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function markSessionProcessed(sessionId: string) {
  if (processedCheckoutSessions.size >= IDEMPOTENCY_MAX_SIZE) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    processedCheckoutSessions.forEach((timestamp, key) => {
      if (now - timestamp > IDEMPOTENCY_TTL_MS) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(k => processedCheckoutSessions.delete(k));
    if (processedCheckoutSessions.size >= IDEMPOTENCY_MAX_SIZE) {
      const oldest = processedCheckoutSessions.keys().next().value;
      if (oldest) processedCheckoutSessions.delete(oldest);
    }
  }
  processedCheckoutSessions.set(sessionId, Date.now());
}

function isSessionProcessed(sessionId: string): boolean {
  const timestamp = processedCheckoutSessions.get(sessionId);
  if (!timestamp) return false;
  if (Date.now() - timestamp > IDEMPOTENCY_TTL_MS) {
    processedCheckoutSessions.delete(sessionId);
    return false;
  }
  return true;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

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
  app.post('/api/auth/login', async (req: any, res) => {
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
      
      if (user?.subscriptionStatus === 'pro') {
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

  // Stripe webhook for subscription status updates
  app.post('/api/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
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
            if (subscription.status === 'active') {
              await storage.updateUserSubscription(user.id, {
                subscriptionStatus: 'pro',
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: customerId,
              });
            } else if (subscription.status === 'canceled' || subscription.status === 'unpaid' || event.type === 'customer.subscription.deleted') {
              await storage.updateUserSubscription(user.id, {
                subscriptionStatus: 'free',
                stripeSubscriptionId: null,
              });
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
            await storage.updateUserSubscription(user.id, {
              subscriptionStatus: 'pro',
              stripeSubscriptionId: invoice.subscription,
              stripeCustomerId: customerId,
            });
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
        
        if (userId && packageType && session.payment_status === 'paid' && !isSessionProcessed(session.id)) {
          markSessionProcessed(session.id);
          if (packageType === 'starter') {
            await storage.addCredits(userId, 50);
          } else if (packageType === 'pro') {
            await storage.addCredits(userId, 100);
          } else if (packageType === 'unlimited') {
            await storage.updateUserSubscription(userId, {
              subscriptionStatus: 'pro',
              stripeSubscriptionId: session.subscription,
              stripeCustomerId: session.customer,
            });
          } else if (packageType === 'master') {
            await storage.createPaidSubmission({
              email: session.customer_details?.email || '',
              packageType: 'full',
              paymentStatus: 'paid',
              stripeSessionId: session.id,
              priority: true,
              phoneConsultationRequested: true,
            });
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
      const validTypes = ['starter', 'pro', 'unlimited', 'master'];
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
        isUnlimited: user?.subscriptionStatus === 'pro' || user?.verificationLimit === -1
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
          if (!isSessionProcessed(sessionId)) {
            markSessionProcessed(sessionId);
            if (packageType === 'starter') {
              await storage.addCredits(sessionUserId, 50);
            } else if (packageType === 'pro') {
              await storage.addCredits(sessionUserId, 100);
            } else if (packageType === 'unlimited') {
              await storage.updateUserSubscription(sessionUserId, {
                subscriptionStatus: 'pro',
                stripeSubscriptionId: session.subscription as string,
                stripeCustomerId: session.customer as string,
              });
            } else if (packageType === 'master') {
              await storage.createPaidSubmission({
                email: session.customer_details?.email || req.user.email || '',
                packageType: 'full',
                paymentStatus: 'paid',
                stripeSessionId: session.id,
                priority: true,
                phoneConsultationRequested: true,
              });
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
  app.post('/api/verify', upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      let userId: string | undefined;
      let hashedIp: string | undefined;
      
      // Check authentication and limits
      if (req.isAuthenticated()) {
        // Authenticated users: check user-based limits
        userId = req.user.id;
        if (userId) {
          const user = await storage.getUser(userId);
          
          if (!user) {
            return res.status(404).json({ message: 'User not found' });
          }
          
          // Priority 1: Unlimited subscription (pro status or verificationLimit -1)
          const hasUnlimited = user.subscriptionStatus === 'pro' || user.verificationLimit === -1;
          
          if (!hasUnlimited) {
            // Priority 2: Check purchased credits
            const credits = user.credits || 0;
            
            if (credits > 0) {
              // Deduct one credit
              await storage.deductCredits(userId, 1);
            } else {
              // Priority 3: Check daily free limit
              const canVerify = await storage.checkDailyLimit(userId);
              
              if (!canVerify) {
                return res.status(429).json({ 
                  message: 'Daily verification limit reached. Purchase credits or upgrade for unlimited verifications.',
                  upgradeRequired: true,
                  credits: 0
                });
              }
              
              // Update daily usage count for free tier users
              await storage.updateDailyVerificationUsage(userId);
            }
          }
        }
      } else {
        // Anonymous users: check IP-based rate limit (7 days)
        const clientIp = getClientIp(req);
        hashedIp = hashIpAddress(clientIp);
        
        const ipRecord = await storage.getIpVerification(hashedIp);
        
        if (ipRecord) {
          const lastVerification = new Date(ipRecord.lastVerificationDate);
          const now = new Date();
          const daysSinceVerification = (now.getTime() - lastVerification.getTime()) / (1000 * 60 * 60 * 24);
          
          if (daysSinceVerification < 7) {
            const daysRemaining = Math.ceil(7 - daysSinceVerification);
            const hoursRemaining = Math.ceil((7 - daysSinceVerification) * 24);
            
            return res.status(429).json({
              message: "Rate limit exceeded",
              error: "You can only verify one document every 7 days",
              daysRemaining,
              hoursRemaining,
              nextVerificationDate: new Date(lastVerification.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });
          }
        }
        
        // Record IP verification
        await recordIpVerification(hashedIp);
      }

      // Generate document hash for audit trail
      const documentHash = generateDocumentHash(req.file.path);
      const receiptId = generateReceiptId();

      // Use Node.js PDF analyzer instead of Python
      const pdfAnalyzer = new PDFAnalyzer();
      const metadata = await pdfAnalyzer.extractMetadata(req.file.path);
      const trustedPatterns = await storage.getTrustedPatterns();
      
      const analysis = await pdfAnalyzer.analyzeAgainstTrustedPatterns(metadata, trustedPatterns);
      
      // Use the rule-based result from the analyzer
      const result = analysis.result;

      // Store verification result with receipt and hash
      const verificationId = await storage.createVerificationResult(
        req.file.originalname,
        result,
        Math.floor(analysis.confidence),
        metadata,
        analysis,
        req.ip,
        userId,
        receiptId,
        documentHash
      );

      res.json({
        id: verificationId,
        receiptId,
        documentHash,
        result,
        confidence: analysis.confidence,
        details: analysis.details,
        checks: analysis.checks || [],
        forensicAnalysis: analysis.details?.forensicAnalysis || null,
        metadata: {
          producer: metadata.producer,
          creator: metadata.creator,
          created: metadata.creationDate,
          modified: metadata.modificationDate,
          fontCount: metadata.fontCount,
        },
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

  // ==========================================
  // Company Watch Endpoints
  // ==========================================

  const { getWatchLimit: getWatchLimitFromTier, getTierConfig, isChannelAllowed } = await import("./utils/tierConfig");

  function getWatchLimit(subscriptionStatus: string | null): number {
    return getWatchLimitFromTier(subscriptionStatus);
  }

  app.post('/api/watches', isAuthenticated, async (req: any, res) => {
    try {
      const { organisation_name, town_city, fingerprint: fpParam } = req.body;
      if (!organisation_name || typeof organisation_name !== 'string' || organisation_name.trim().length === 0) {
        return res.status(400).json({ message: "Organisation name is required." });
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
                .then(() => {})
                .catch(() => {});
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
      const { email_enabled, whatsapp_enabled, whatsapp_number, sms_enabled, sms_number } = req.body;

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

      const { createChatCompletionWithFallback, getAvailableProviders } = await import('./services/aiService');

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

      runSponsorMonitorJob("manual-admin").catch((err) => {
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
      const { producer, verificationId } = req.body;
      
      if (!producer) {
        return res.status(400).json({ message: 'Producer name is required' });
      }

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
      const { limit } = req.body; // null=default, -1=unlimited, positive=custom limit
      
      const updatedUser = await storage.updateUserVerificationLimit(userId, limit);
      
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      let limitDescription = 'Default (1/day)';
      if (limit === -1) limitDescription = 'Unlimited';
      else if (limit !== null && limit > 0) limitDescription = `${limit} verifications`;
      
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

      // Update the verification with admin feedback
      const updated = await storage.updateVerificationFeedback(id, {
        adminStatus,
        adminFeedback: adminFeedback || null,
        adminReviewedBy: req.user.id,
        adminReviewedAt: new Date(),
        accuracyScore: accuracyScore || null,
      });

      // If admin marked as fake but AI said genuine, log the conflict
      const aiResult = verification.result;
      const isConflict = adminStatus === 'fake' && aiResult === 'genuine';

      res.json({ 
        message: 'Feedback recorded',
        verification: updated,
        isConflict,
        conflictType: isConflict ? 'AI marked genuine, admin marked fake' : null
      });
    } catch (error) {
      console.error('Error updating verification feedback:', error);
      res.status(500).json({ message: 'Failed to update feedback' });
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