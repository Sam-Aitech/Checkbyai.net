import type { Express } from "express";
import { z } from "zod";
import { insertFeedbackSchema } from "@shared/schema";
import { storage } from "../storage";
import rateLimit from "express-rate-limit";
import { logger } from "../utils/logger";

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many feedback submissions. Please try again later." },
  skipSuccessfulRequests: false,
});

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
