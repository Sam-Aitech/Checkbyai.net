import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { PDFAnalyzer } from "./services/pdfAnalyzer";
import { insertTrustedPatternSchema, insertVerificationResultSchema } from "@shared/schema";

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

const pdfAnalyzer = new PDFAnalyzer();

export async function registerRoutes(app: Express): Promise<Server> {
  // Get statistics
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  // Get trusted patterns
  app.get("/api/trusted-patterns", async (req, res) => {
    try {
      const patterns = await storage.getTrustedPatterns();
      res.json(patterns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trusted patterns" });
    }
  });

  // Upload trusted pattern (admin)
  app.post("/api/admin/upload-pattern", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const metadata = await pdfAnalyzer.extractMetadata(req.file.path);
      
      const patternData = insertTrustedPatternSchema.parse({
        filename: req.file.originalname,
        metadata: metadata,
        status: 'active',
        extractedPatterns: {}
      });

      const pattern = await storage.createTrustedPattern(patternData);
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      res.json(pattern);
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      console.error('Upload pattern error:', error);
      res.status(500).json({ error: "Failed to process uploaded pattern" });
    }
  });

  // Verify document
  app.post("/api/verify", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const metadata = await pdfAnalyzer.extractMetadata(req.file.path);
      const trustedPatterns = await storage.getTrustedPatterns();
      
      const analysis = await pdfAnalyzer.analyzeAgainstTrustedPatterns(metadata, trustedPatterns);
      
      const resultData = insertVerificationResultSchema.parse({
        filename: req.file.originalname,
        result: analysis.result,
        confidence: analysis.confidence,
        metadata: metadata,
        analysisDetails: analysis.details,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });

      const result = await storage.createVerificationResult(resultData);
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      res.json({
        id: result.id,
        result: result.result,
        confidence: result.confidence,
        details: result.analysisDetails
      });
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      console.error('Verification error:', error);
      res.status(500).json({ error: "Failed to verify document" });
    }
  });

  // Get recent verification activity (admin)
  app.get("/api/admin/recent-activity", async (req, res) => {
    try {
      const activity = await storage.getRecentActivity();
      res.json(activity);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  });

  // Delete trusted pattern (admin)
  app.delete("/api/admin/trusted-patterns/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTrustedPattern(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete pattern" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
