import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { insertVerificationResultSchema, insertFeedbackSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import { PDFAnalyzer } from "./services/pdfAnalyzer";

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil",
});

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Check user's daily verification limit
  app.get('/api/auth/check-limit', async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        // Anonymous users get 1 verification per day via localStorage
        return res.json({ canVerify: true, isAnonymous: true, verificationsLeft: 1 });
      }

      const userId = req.user.claims.sub;
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

  // Subscription management routes
  app.post('/api/create-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user already has an active subscription
      if (user.stripeSubscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        if (subscription.status === 'active') {
          return res.json({
            subscriptionId: subscription.id,
            clientSecret: null, // Will be handled by frontend
            status: 'active'
          });
        }
      }

      if (!user.email) {
        return res.status(400).json({ message: 'No user email on file' });
      }

      // Create or retrieve Stripe customer
      let customer;
      if (user.stripeCustomerId) {
        customer = await stripe.customers.retrieve(user.stripeCustomerId);
      } else {
        customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        });
        await storage.updateUserStripeInfo(userId, customer.id);
      }

      // Create subscription (you'll need to create a price in Stripe dashboard)
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price: 'price_1234567890', // Replace with your actual price ID from Stripe
        }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      // Update user with subscription info
      await storage.updateUserStripeInfo(userId, customer.id, subscription.id);

      const paymentIntent = subscription.latest_invoice && 
                            typeof subscription.latest_invoice === 'object' && 
                            (subscription.latest_invoice as any).payment_intent;
      
      res.json({
        subscriptionId: subscription.id,
        clientSecret: paymentIntent && typeof paymentIntent === 'object' 
                      ? (paymentIntent as any).client_secret 
                      : null,
        status: subscription.status
      });
    } catch (error: any) {
      console.error("Subscription creation error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Stripe webhook for subscription status updates
  app.post('/api/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: any) {
      console.log(`Webhook signature verification failed.`, err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle subscription events
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const subscription = event.data.object;
        // Find user by Stripe subscription ID and update their status
        // Note: You'll need to implement a method to find user by subscription ID
        break;
      case 'invoice.payment_succeeded':
        // Update user to pro status
        break;
      case 'invoice.payment_failed':
        // Handle failed payment
        break;
    }

    res.json({ received: true });
  });

  // Document verification route
  app.post('/api/verify', upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      let userId: string | undefined;
      
      // Check authentication and limits
      if (req.isAuthenticated()) {
        userId = req.user.claims.sub;
        if (userId) {
          const canVerify = await storage.checkDailyLimit(userId);
          
          if (!canVerify) {
            return res.status(429).json({ 
              message: 'Daily verification limit reached. Upgrade to Pro for unlimited verifications.',
              upgradeRequired: true 
            });
          }
          
          // Update usage count for authenticated users
          await storage.updateDailyVerificationUsage(userId);
        }
      }

      // Use Node.js PDF analyzer instead of Python
      const pdfAnalyzer = new PDFAnalyzer();
      const metadata = await pdfAnalyzer.extractMetadata(req.file.path);
      const trustedPatterns = await storage.getTrustedPatterns();
      
      const analysis = await pdfAnalyzer.analyzeAgainstTrustedPatterns(metadata, trustedPatterns);
      
      const result = analysis.confidence > 90 ? 'genuine' : 
                    analysis.confidence > 50 ? 'suspicious' : 'fake';

      // Store verification result
      const verificationId = await storage.createVerificationResult(
        req.file.originalname,
        result,
        Math.floor(analysis.confidence),
        metadata,
        analysis,
        req.ip,
        userId
      );

      res.json({
        id: verificationId,
        result,
        confidence: analysis.confidence,
        details: analysis,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Verification error:', error);
      res.status(500).json({ message: 'Verification failed' });
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
      
      const patternId = await storage.createTrustedPattern(
        req.file.originalname,
        metadata,
        patterns
      );

      res.json({ id: patternId, message: 'Trusted pattern created successfully' });
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

  app.get('/api/admin/recent-activity', isAdmin, async (req, res) => {
    try {
      const activity = await storage.getRecentActivity(20);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  // Feedback routes
  app.post('/api/feedback', async (req: any, res) => {
    try {
      const feedbackData = insertFeedbackSchema.parse(req.body);
      
      // Add userId if authenticated
      if (req.isAuthenticated()) {
        feedbackData.userId = req.user.claims.sub;
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

  const httpServer = createServer(app);
  return httpServer;
}