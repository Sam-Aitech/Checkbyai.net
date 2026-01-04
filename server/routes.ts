import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./auth";
import { checkIpRateLimit, recordIpVerification, getClientIp, hashIpAddress } from "./ipRateLimit";
import { insertVerificationResultSchema, insertFeedbackSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import { PDFAnalyzer } from "./services/pdfAnalyzer";
import bcrypt from "bcrypt";

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

  // Subscription management routes
  app.post('/api/create-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
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

      // Use Node.js PDF analyzer instead of Python
      const pdfAnalyzer = new PDFAnalyzer();
      const metadata = await pdfAnalyzer.extractMetadata(req.file.path);
      const trustedPatterns = await storage.getTrustedPatterns();
      
      const analysis = await pdfAnalyzer.analyzeAgainstTrustedPatterns(metadata, trustedPatterns);
      
      // Use the rule-based result from the analyzer
      const result = analysis.result;

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
      res.status(500).json({ message: error.message || 'Failed to create checkout session' });
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
      res.status(500).json({ message: error.message || 'Failed to get submission' });
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
      res.status(500).json({ message: error.message || 'Failed to submit' });
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
      res.status(500).json({ message: error.message || 'Failed to get status' });
    }
  });

  // Admin: Get all paid submissions
  app.get('/api/admin/paid-submissions', isAdmin, async (req, res) => {
    try {
      const submissions = await storage.getAllPaidSubmissions();
      res.json(submissions);
    } catch (error: any) {
      console.error('Get submissions error:', error);
      res.status(500).json({ message: error.message || 'Failed to get submissions' });
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
      res.status(500).json({ message: error.message || 'Failed to update submission' });
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
      res.status(500).json({ message: error.message || 'Failed to verify employer' });
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
      res.status(500).json({ message: error.message || 'Failed to send report' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}