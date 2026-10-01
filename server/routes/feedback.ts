import type { Express } from "express";
import { z } from "zod";
import { insertFeedbackSchema } from "@shared/schema";
import { storage } from "../storage";
import { feedbackLimiter } from "../middleware/rateLimiter";
import { logger } from "../utils/logger";


export function registerFeedbackRoutes(app: Express): void {
  app.post('/api/feedback', feedbackLimiter, async (req: any, res) => {
    try {
      const feedbackData = insertFeedbackSchema.parse(req.body);

      if (req.isAuthenticated()) {
        feedbackData.userId = req.user.id;
      }

      const newFeedback = await storage.createFeedback(feedbackData);
      res.json(newFeedback);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid feedback data", errors: error.errors });
      }
      logger.error({ err: error }, "Error creating feedback:");
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });
}
