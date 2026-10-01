import type { Express } from "express";
import { storage } from "../storage";
import { authAccountLimiter, authLimiter } from "../middleware/rateLimiter";
import { isAuthenticated } from "../auth";
import { authService } from "../services/authService";
import { success, fail } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { validateBody } from "../lib/validate";
import { loginSchema, registerSchema } from "../validation/auth";
import { recordRegistrationAttempt } from "../services/monitoringService";
import { logger } from "../utils/logger";
import { toPublicUser } from "../utils/publicUser";
import { establishAuthenticatedSession } from "../utils/sessionSecurity";

export function registerAuthRoutes(app: Express): void {
  app.get('/api/auth/user', isAuthenticated, asyncHandler(async (req: any, res) => {
    const user = await storage.getUser(req.user.id);
    // Never return the password hash or a pending one-time code.
    success(res, toPublicUser(user));
  }));

  app.post('/api/auth/login', authLimiter, validateBody(loginSchema), authAccountLimiter, asyncHandler(async (req: any, res) => {
    const { email, password } = req.body;

    await authService.loginWithPassword(email, password);

    const user = await storage.getUserByEmail(email);
    if (!user) {
      fail(res, "Login failed", 500);
      return;
    }

    try {
      await establishAuthenticatedSession(req, user);
    } catch {
      fail(res, "Login failed", 500);
      return;
    }
    success(res, { message: "Logged in successfully", user: toPublicUser(user) });
  }));

  app.post('/api/auth/register', authLimiter, validateBody(registerSchema), asyncHandler(async (req: any, res) => {
    const { email, password, firstName, lastName } = req.body;

    const newUser = await authService.registerUser(email, password, firstName, lastName);
    recordRegistrationAttempt(true);

    try {
      await establishAuthenticatedSession(req, newUser);
    } catch (err) {
      logger.error({ err }, "Auto-login after registration failed:");
      success(res, {
        message: "Registration successful. Please check your email to verify your account.",
        userId: newUser.id,
        requiresVerification: true,
      }, 201);
      return;
    }
    success(res, { message: "Registration successful", user: toPublicUser(newUser) }, 201);
  }));

  app.get('/api/auth/check-limit', asyncHandler(async (req: any, res) => {
    if (!req.isAuthenticated()) {
      success(res, { canVerify: true, isAnonymous: true, verificationsLeft: 1 });
      return;
    }

    const userId = req.user.id;
    const entitlement = await storage.getCosEntitlement(userId);
    success(res, {
      canVerify: entitlement?.canVerify ?? false,
      hasAccess: entitlement?.hasAccess ?? false,
      isAnonymous: false,
      isUnlimited: entitlement?.isUnlimited ?? false,
      verificationsLeft: entitlement?.isUnlimited ? "unlimited" : (entitlement?.remaining ?? 0),
      accessSource: entitlement?.accessSource ?? "none",
    });
  }));
}
