import type { Express } from "express";
import { logger } from "../../utils/logger";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { requireRole } from "../../middleware/roleGuard";
import { storage } from "../../storage";
import { PDFAnalyzer } from "../../services/pdfAnalyzer";
import { upload } from "../verification";
import { sanitizeUploadPath, assertSafeUploadFilename } from "../../utils/uploadGuard";
function sanitizeForPrompt(text: string): string {
  return text.replace(/[<>`{}]/g, '');
}
const globalRuleSchema = z.object({
  category: z.enum(['date_check', 'producer_check', 'metadata_check', 'pattern_check', 'red_flag', 'trusted_marker']),
  ruleText: z.string().min(5).max(1000),
  priority: z.number().min(0).max(100).optional().default(0),
});
const teachAiSchema = z.object({
  verificationId: z.number().optional(),
  category: z.enum(['date_check', 'producer_check', 'metadata_check', 'pattern_check', 'red_flag', 'trusted_marker']).default('red_flag'),
  ruleText: z.string().min(5).max(1000),
  priority: z.number().min(0).max(100).default(10),
});
export function registerPatternsController(app: Express): void {
  app.get('/api/admin/trusted-patterns', requireRole("admin"), async (req, res) => {
    try {
      const patterns = await storage.getTrustedPatterns();
      res.json(patterns);
    } catch (error) {
      logger.error({ err: error }, "Error fetching trusted patterns:");
      res.status(500).json({ message: "Failed to fetch trusted patterns" });
    }
  });
  app.post('/api/admin/trusted-patterns', requireRole("admin"), upload.single('file'), async (req, res) => {
    let safeFilePath: string | undefined;
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      safeFilePath = sanitizeUploadPath(req.file.path);
      assertSafeUploadFilename(req.file.originalname);
      const pdfAnalyzer = new PDFAnalyzer();
      // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
      const metadata = await pdfAnalyzer.extractMetadata(safeFilePath);
      const patterns = { metadata, documentType: 'trusted_cos' };
      const aiInstructions = req.body?.aiInstructions || null;
      const patternId = await storage.createTrustedPattern(
        path.basename(req.file.originalname),
        metadata,
        patterns,
        aiInstructions
      );
      res.json({ id: patternId, message: 'Trusted pattern created successfully', aiInstructions: !!aiInstructions });
    } catch (error) {
      logger.error({ err: error }, "Error creating trusted pattern:");
      res.status(500).json({ message: "Failed to create trusted pattern" });
    } finally {
      if (safeFilePath) {
        try {
          fs.unlink(safeFilePath, () => {}); // codeql[js/path-injection] - safeFilePath validated by sanitizeUploadPath
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  });
  app.delete('/api/admin/trusted-patterns/:id', requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTrustedPattern(id);
      res.json({ message: 'Trusted pattern deleted successfully' });
    } catch (error) {
      logger.error({ err: error }, "Error deleting trusted pattern:");
      res.status(500).json({ message: "Failed to delete trusted pattern" });
    }
  });
  app.post('/api/admin/extract-metadata', requireRole("admin"), upload.single('file'), async (req: any, res) => {
    let safeFilePath: string | undefined;
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      safeFilePath = sanitizeUploadPath(req.file.path);
      const pdfAnalyzer = new PDFAnalyzer();
      // codeql[js/path-injection] - safeFilePath is validated by sanitizeUploadPath
      const metadata = await pdfAnalyzer.extractMetadata(safeFilePath);
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
      logger.error({ err: error }, "Error extracting metadata:");
      res.status(500).json({ message: "Failed to extract metadata" });
    } finally {
      if (safeFilePath) {
        try {
          await fs.promises.unlink(safeFilePath); // codeql[js/path-injection] - safeFilePath validated by sanitizeUploadPath
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  });
  app.patch('/api/admin/trusted-patterns/:id/instructions', requireRole("admin"), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { aiInstructions } = req.body;
      await storage.updateTrustedPatternInstructions(id, aiInstructions);
      res.json({ message: 'Pattern instructions updated' });
    } catch (error) {
      logger.error({ err: error }, "Error updating pattern instructions:");
      res.status(500).json({ message: "Failed to update pattern instructions" });
    }
  });
  app.get('/api/admin/global-rules', requireRole("admin"), async (req, res) => {
    try {
      const rules = await storage.getGlobalAiRules();
      res.json(rules);
    } catch (error) {
      logger.error({ err: error }, "Error fetching global rules:");
      res.status(500).json({ message: "Failed to fetch global rules" });
    }
  });
  app.post('/api/admin/global-rules', requireRole("admin"), async (req: any, res) => {
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
        createdBy: req.user?.id ?? null,
      });
      res.json(rule);
    } catch (error) {
      logger.error({ err: error }, "Error creating global rule:");
      res.status(500).json({ message: "Failed to create global rule" });
    }
  });
  app.patch('/api/admin/global-rules/:id', requireRole("admin"), async (req: any, res) => {
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
      logger.error({ err: error }, "Error updating global rule:");
      res.status(500).json({ message: "Failed to update global rule" });
    }
  });
  app.delete('/api/admin/global-rules/:id', requireRole("admin"), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGlobalAiRule(id);
      res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
      logger.error({ err: error }, "Error deleting global rule:");
      res.status(500).json({ message: "Failed to delete global rule" });
    }
  });
  app.post('/api/admin/global-rules/:id/toggle', requireRole("admin"), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isActive } = req.body;
      await storage.toggleGlobalAiRule(id, isActive);
      res.json({ message: `Rule ${isActive ? 'activated' : 'deactivated'}` });
    } catch (error) {
      logger.error({ err: error }, "Error toggling global rule:");
      res.status(500).json({ message: "Failed to toggle global rule" });
    }
  });
  app.post('/api/admin/teach-ai', requireRole("admin"), async (req: any, res) => {
    try {
      const parsed = teachAiSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(', ') });
      }
      const { verificationId, category, ruleText, priority } = parsed.data;
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
        createdBy: req.user?.id ?? null,
      });
      res.json({
        message: 'AI has learned this pattern',
        rule
      });
    } catch (error) {
      logger.error({ err: error }, "Error teaching AI:");
      res.status(500).json({ message: "Failed to teach AI" });
    }
  });
  app.post('/api/admin/trust-producer', requireRole("admin"), async (req: any, res) => {
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
      const verification = verificationId !== undefined ? await storage.getVerificationById(verificationId) : null;
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
      logger.error({ err: error }, "Error trusting producer:");
      res.status(500).json({ message: "Failed to trust producer" });
    }
  });
}
