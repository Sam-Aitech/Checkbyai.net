import type { Express } from "express";
import { logger } from "../../utils/logger";
import { requireRole } from "../../middleware/roleGuard";
import { storage } from "../../storage";

function sanitizeForPrompt(text: string): string {
  return text.replace(/[<>`{}]/g, '');
}

export function registerVerificationsController(app: Express): void {
  app.get('/api/admin/recent-activity', requireRole("admin"), async (req, res) => {
    try {
      const activity = await storage.getRecentActivity(20);
      res.json(activity);
    } catch (error) {
      logger.error({ err: error }, "Error fetching recent activity:");
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  app.get('/api/admin/verification-logs', requireRole("admin"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const status = req.query.status as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const search = req.query.search as string | undefined;
      const period = req.query.period as string | undefined;

      const result = await storage.getPaginatedVerificationLogs({
        page,
        limit,
        status,
        startDate,
        endDate,
        search,
        period,
      });

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Error fetching verification logs:");
      res.status(500).json({ message: "Failed to fetch verification logs" });
    }
  });

  app.post('/api/admin/analyze-reasoning/:id', requireRole("admin"), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const verification = await storage.getVerificationById(id);

      if (!verification) {
        return res.status(404).json({ message: "Verification not found" });
      }

      const globalRules = await storage.getActiveGlobalAiRules();
      const trustedPatterns = await storage.getTrustedPatterns();
      const hitlKnowledge = await storage.getAdminFakeKnowledge(15);

      let knowledgeContext = '';

      if (globalRules.length > 0) {
        knowledgeContext += '\n<admin_global_rules>\n';
        globalRules.forEach((rule, idx) => {
          knowledgeContext += `Rule #${idx + 1} [${rule.category}] (Priority: ${rule.priority}): ${rule.ruleText}\n`;
        });
        knowledgeContext += '</admin_global_rules>\n';
      }

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
          knowledgeContext += `  Expert reasoning: ${sanitizeForPrompt(entry.adminFeedback || 'No details')}\n\n`;
        });
        knowledgeContext += '</human_expert_corrections>\n';
      }

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

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const { createChatCompletionWithFallback, getAvailableProviders, hasAnyProvider } = await import('../../services/aiService');

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
      logger.error({ err: error }, "Error in AI analysis:");
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to analyze verification" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Analysis failed" })}\n\n`);
        res.end();
      }
    }
  });

  app.get('/api/admin/export-report/:id', requireRole("admin"), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const verification = await storage.getVerificationById(id);

      if (!verification) {
        return res.status(404).json({ message: 'Verification not found' });
      }

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
      logger.error({ err: error }, "Error exporting report:");
      res.status(500).json({ message: "Failed to export report" });
    }
  });

  app.patch('/api/logs/:id/feedback', requireRole("admin"), async (req: any, res) => {
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

      const updated = await storage.updateVerificationFeedback(id, {
        adminStatus,
        adminFeedback: adminFeedback || null,
        adminReviewedBy: req.user.id,
        adminReviewedAt: new Date(),
        accuracyScore: adminStatus === 'fake' ? 0 : (accuracyScore || null),
      });

      if (adminStatus === 'fake' && adminFeedback?.trim()) {
        try {
          const overrideDate = new Date().toISOString().split('T')[0];
          const originalResult = verification.result;
          const originalConfidence = verification.confidence;
          const producer = (verification.metadata as any)?.producer || 'Unknown';
          const ruleText =
            `CRITICAL ADMIN OVERRIDE [${overrideDate}]: Document initially verified as '${originalResult}' (${originalConfidence}% confidence) was confirmed FAKE by a human expert.\n` +
            `Producer: ${producer}\n` +
            `Admin reasoning: ${sanitizeForPrompt(adminFeedback.trim())}\n` +
            `Action required: Apply heightened scrutiny to documents with similar metadata patterns. Do not classify as Genuine without explicit justification.`;

          await storage.createGlobalAiRule({
            category: 'hitl-override',
            ruleText,
            priority: 100,
            isActive: true,
          });
        } catch (ruleError) {
          logger.error({ err: ruleError }, 'Failed to create AI rule from admin override (non-fatal):');
        }
      }

      res.json({
        message: 'Feedback recorded',
        verification: updated,
        ruleAdded: adminStatus === 'fake' && !!adminFeedback?.trim(),
      });
    } catch (error) {
      logger.error({ err: error }, 'Error updating verification feedback:');
      res.status(500).json({ message: 'Failed to update feedback' });
    }
  });

  app.delete('/api/logs/:id', requireRole("admin"), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
      const log = await storage.getVerificationById(id);
      if (!log) return res.status(404).json({ message: 'Log not found' });
      await storage.deleteVerificationLog(id);
      res.json({ message: 'Log deleted' });
    } catch (error) {
      logger.error({ err: error }, 'Error deleting verification log:');
      res.status(500).json({ message: 'Failed to delete log' });
    }
  });

  app.get('/api/knowledge-base', requireRole("admin"), async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 15;
      const knowledge = await storage.getAdminFakeKnowledge(limit);

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
          knowledgeContext += `Admin reasoning: ${sanitizeForPrompt(entry.adminFeedback || 'No details provided')}\n\n`;
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
      logger.error({ err: error }, 'Error fetching knowledge base:');
      res.status(500).json({ message: 'Failed to fetch knowledge base' });
    }
  });

  app.get('/api/admin/verification-logs-hitl', requireRole("admin"), async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const adminStatus = req.query.adminStatus as string;

      const logs = await storage.getVerificationLogsWithHITL(page, limit, adminStatus);
      res.json(logs);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching HITL logs:');
      res.status(500).json({ message: 'Failed to fetch logs' });
    }
  });

  app.get('/api/feedback/stats', requireRole("admin"), async (req, res) => {
    try {
      const stats = await storage.getFeedbackStats();
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Error fetching feedback stats:");
      res.status(500).json({ message: "Failed to fetch feedback stats" });
    }
  });
}
