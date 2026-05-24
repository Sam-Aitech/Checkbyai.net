import type { Express } from "express";
import { isAuthenticated } from "../auth";
import { requireRole } from "../middleware/roleGuard";
import { storage } from "../storage";
import { logger } from "../utils/logger";

export function registerSupportRoutes(app: Express): void {
  // User: submit a support ticket
  app.post("/api/support/tickets", isAuthenticated, async (req: any, res) => {
    try {
      const { subject, message } = req.body;
      if (!subject?.trim() || !message?.trim()) {
        return res.status(400).json({ message: "Subject and message are required" });
      }
      const ticket = await storage.createSupportTicket(req.user.id, {
        subject: subject.trim(),
        message: message.trim(),
      });
      res.json(ticket);
    } catch (err) {
      logger.error({ err }, "Error creating support ticket:");
      res.status(500).json({ message: "Failed to submit support request" });
    }
  });

  // User: get own tickets
  app.get("/api/support/tickets", isAuthenticated, async (req: any, res) => {
    try {
      const tickets = await storage.getUserSupportTickets(req.user.id);
      res.json(tickets);
    } catch (err) {
      logger.error({ err }, "Error fetching support tickets:");
      res.status(500).json({ message: "Failed to fetch support tickets" });
    }
  });

  // Admin: get all tickets
  app.get("/api/admin/support/tickets", requireRole("admin"), async (_req, res) => {
    try {
      const tickets = await storage.getAllSupportTickets();
      res.json(tickets);
    } catch (err) {
      logger.error({ err }, "Error fetching all support tickets:");
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  // Admin: reply to a ticket (marks as resolved)
  app.patch("/api/admin/support/tickets/:id/reply", requireRole("admin"), async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { reply } = req.body;
      if (!reply?.trim()) {
        return res.status(400).json({ message: "Reply text is required" });
      }
      const ticket = await storage.replySupportTicket(id, reply.trim());
      res.json(ticket);
    } catch (err) {
      logger.error({ err }, "Error replying to support ticket:");
      res.status(500).json({ message: "Failed to send reply" });
    }
  });
}
