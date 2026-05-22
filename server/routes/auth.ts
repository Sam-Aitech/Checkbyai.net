import type { Express } from "express";
import { storage } from "../storage";
import { authLimiter } from "../middleware/rateLimiter";
import { isAuthenticated } from "../auth";
import { authService } from "../services/authService";
import { success, fail } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { validateBody } from "../lib/validate";
import { loginSchema, registerSchema } from "../validation/auth";
import { recordRegistrationAttempt } from "../services/monitoringService";

export function registerAuthRoutes(app: Express): void {
  app.get('/api/auth/user', isAuthenticated, asyncHandler(async (req: any, res) => {
    const user = await storage.getUser(req.user.id);
    success(res, user);
  }));

  app.post('/api/auth/login', authLimiter, validateBody(loginSchema), asyncHandler(async (req: any, res) => {
    const { email, password } = req.body;

    await authService.loginWithPassword(email, password);

    const user = await storage.getUserByEmail(email);
    if (!user) {
      fail(res, "Login failed", 500);
      return;
    }

    req.login(user, (err: any) => {
      if (err) {
        fail(res, "Login failed", 500);
        return;
      }
      success(res, { message: "Logged in successfully", user });
    });
  }));

  app.post('/api/auth/register', authLimiter, validateBody(registerSchema), asyncHandler(async (req: any, res) => {
    const { email, password, firstName, lastName } = req.body;

    const newUser = await authService.registerUser(email, password, firstName, lastName);
    recordRegistrationAttempt(true);

    req.login(newUser, (err: any) => {
      if (err) {
        console.error("Auto-login after registration failed:", err);
        success(res, {
          message: "Registration successful. Please check your email to verify your account.",
          userId: newUser.id,
          requiresVerification: true,
        }, 201);
        return;
      }
      success(res, { message: "Registration successful", user: newUser }, 201);
    });
  }));

  app.get('/api/auth/check-limit', asyncHandler(async (req: any, res) => {
    if (!req.isAuthenticated()) {
      success(res, { canVerify: true, isAnonymous: true, verificationsLeft: 1 });
      return;
    }

    const userId = req.user.id;
    const canVerify = await storage.checkDailyLimit(userId);
    const user = await storage.getUser(userId);

    if (user?.subscriptionStatus === 'unlimited' || user?.subscriptionStatus === 'enterprise') {
      success(res, { canVerify: true, isAnonymous: false, verificationsLeft: 'unlimited' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const usedToday = user?.lastVerificationDate === today ? (user.dailyVerificationsUsed || 0) : 0;
    const verificationsLeft = Math.max(0, 1 - usedToday);

    success(res, { canVerify, isAnonymous: false, verificationsLeft });
  }));
}
