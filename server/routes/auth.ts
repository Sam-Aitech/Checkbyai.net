import type { Express } from "express";
import * as crypto from "crypto";
import { storage } from "../storage";
import bcrypt from "bcrypt";
import { authLimiter } from "../middleware/rateLimiter";
import { isAuthenticated } from "../auth";
import { recordRegistrationAttempt } from "../services/monitoringService";

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

  // Traditional Registration Endpoint (Fix 1.1)
  app.post('/api/auth/register', authLimiter, async (req: any, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validation
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Password strength validation
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "User already exists. Please log in instead." });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
       // Create new user
       const userId = `email_${crypto.randomUUID()}`;
       const newUser = await storage.upsertUser({
         id: userId,
         email,
         hashedPassword,
         firstName: firstName || null,
         lastName: lastName || null,
         authProvider: 'email',
         isVerified: false,
       });
       
       // Record successful registration attempt
       recordRegistrationAttempt(true);

       // Auto-login after registration
       req.login(newUser, (err: any) => {
         if (err) {
           console.error("Auto-login after registration failed:", err);
           // Still return success - user can login manually
           res.status(201).json({ 
             message: "Registration successful. Please check your email to verify your account.",
             userId: newUser.id,
             requiresVerification: true
           });
           return;
         }
         res.status(201).json({ 
           message: "Registration successful",
           user: newUser
         });
       });
     } catch (error) {
       console.error("Registration error:", error);
       // Record failed registration attempt
       recordRegistrationAttempt(false);
       res.status(500).json({ message: "Registration failed" });
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
