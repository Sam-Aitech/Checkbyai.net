import type { Express } from "express";
import { storage } from "../storage";
import bcrypt from "bcrypt";
import { authLimiter } from "../middleware/rateLimiter";
import { isAuthenticated } from "../auth";

export function registerAuthRoutes(app: Express): void {
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

  app.post('/api/auth/login', authLimiter, async (req: any, res) => {
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

  app.get('/api/auth/check-limit', async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.json({ canVerify: true, isAnonymous: true, verificationsLeft: 1 });
      }

      const userId = req.user.id;
      const canVerify = await storage.checkDailyLimit(userId);
      const user = await storage.getUser(userId);

      if (user?.subscriptionStatus === 'unlimited' || user?.subscriptionStatus === 'enterprise') {
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
}
