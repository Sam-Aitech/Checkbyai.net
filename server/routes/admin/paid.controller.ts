import type { Express } from "express";
import { logger } from "../../utils/logger";
import { requireRole } from "../../middleware/roleGuard";
import { isAuthenticated } from "../../auth";
import { storage } from "../../storage";
import { upload } from "../verification";
export function registerPaidController(app: Express): void {
  app.post('/api/paid/create-checkout', isAuthenticated, async (req, res) => {
    try {
      const { packageType } = req.body;

      if (!packageType || !['normal', 'full'].includes(packageType)) {
        return res.status(400).json({ message: 'Invalid package type' });
      }

      const prices = {
        normal: 1999, // £19.99 in pence
        full: 4999,   // £49.99 in pence
      };

      // Need stripe here — import dynamically to avoid circular deps
      const Stripe = (await import('stripe')).default;
      if (!process.env.STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY');
      const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-11-17.clover" as any });

      const session = await stripeInstance.checkout.sessions.create({
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

      const currentUserId = (req as any).user?.id;
      if (!currentUserId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const submission = await storage.createPaidSubmission({
        userId: currentUserId,
        email: '',
        packageType,
        paymentStatus: 'pending',
        stripeSessionId: session.id,
        priority: packageType === 'full',
        phoneConsultationRequested: packageType === 'full',
      });

      res.json({ url: session.url, sessionId: session.id, submissionId: submission.id });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Checkout creation error:');
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  app.get('/api/paid/submission/:sessionId', isAuthenticated, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const submission = await storage.getPaidSubmissionBySessionId(sessionId);

      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      const Stripe = (await import('stripe')).default;
      if (!process.env.STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY');
      const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-11-17.clover" as any });

      const session = await stripeInstance.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid' && submission.paymentStatus !== 'paid') {
        await storage.updatePaidSubmission(submission.id, {
          paymentStatus: 'paid',
          email: session.customer_details?.email || '',
        });
      }

      const updatedSubmission = await storage.getPaidSubmissionBySessionId(sessionId);
      res.json(updatedSubmission);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Get submission error:');
      res.status(500).json({ message: 'Failed to get submission' });
    }
  });

  app.post('/api/paid/submit/:submissionId', upload.fields([
    { name: 'cosDocument', maxCount: 1 },
    { name: 'supportingDocuments', maxCount: 5 },
  ]), isAuthenticated, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.submissionId);
      const submission = await storage.getPaidSubmission(submissionId);

      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      const currentUserId = (req as any).user?.id;
      if (!currentUserId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (submission.userId !== currentUserId) {
        return res.status(403).json({ message: 'Forbidden' });
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
    } catch (error: unknown) {
      logger.error({ err: error }, 'Submit error:');
      res.status(500).json({ message: 'Failed to submit' });
    }
  });

  app.get('/api/paid/status/:submissionId', isAuthenticated, async (req, res) => {
    try {
      const submissionId = parseInt(req.params.submissionId);
      const submission = await storage.getPaidSubmission(submissionId);

      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      const currentUserId = (req as any).user?.id;
      if (!currentUserId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (submission.userId !== currentUserId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      res.json({
        id: submission.id,
        packageType: submission.packageType,
        reviewStatus: submission.reviewStatus,
        expertVerdict: submission.expertVerdict,
        reportDelivered: submission.reportDelivered,
        createdAt: submission.createdAt,
      });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Status error:');
      res.status(500).json({ message: 'Failed to get status' });
    }
  });

  app.get('/api/admin/paid-submissions', requireRole("admin"), async (req, res) => {
    try {
      const submissions = await storage.getAllPaidSubmissions();
      res.json(submissions);
    } catch (error: unknown) {
      logger.error({ err: error }, 'Get submissions error:');
      res.status(500).json({ message: 'Failed to get submissions' });
    }
  });

  app.patch('/api/admin/paid-submissions/:id', requireRole("admin"), async (req: any, res) => {
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
    } catch (error: unknown) {
      logger.error({ err: error }, 'Update submission error:');
      res.status(500).json({ message: 'Failed to update submission' });
    }
  });

  app.post('/api/admin/paid-submissions/:id/verify-employer', requireRole("admin"), async (req: any, res) => {
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

      await storage.updatePaidSubmission(submissionId, {
        employerVerificationResult: verificationResult,
      });

      res.json({
        message: 'Employer verification data recorded',
        verificationResult
      });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Employer verification error:');
      res.status(500).json({ message: 'Failed to verify employer' });
    }
  });

  app.post('/api/admin/paid-submissions/:id/send-report', requireRole("admin"), async (req: any, res) => {
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
          from: 'CheckByAI <reports@checkbyai.net>',
          to: [submission.email],
          subject: `Your CoS Verification Report - ${submission.expertVerdict?.toUpperCase() || 'COMPLETE'}`,
          html: reportHtml,
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        logger.error({ err: errorData }, 'Resend error:');
        return res.status(500).json({ message: 'Failed to send email' });
      }

      await storage.updatePaidSubmission(submissionId, {
        reportDelivered: true,
        reportDeliveredAt: new Date(),
      });

      res.json({ message: 'Report sent successfully' });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Send report error:');
      res.status(500).json({ message: 'Failed to send report' });
    }
  });
}
