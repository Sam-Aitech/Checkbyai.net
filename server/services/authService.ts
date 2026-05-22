import * as crypto from "crypto";
import bcrypt from "bcrypt";
import { storage } from "../storage";
import { logger } from "../utils/logger";
import { ApiError } from "../lib/apiError";
import { getAppUrl } from "../utils/appUrl";

export class AuthService {
  generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  async sendEmailOTP(email: string, code: string): Promise<boolean> {
    try {
      if (!process.env.RESEND_API_KEY) {
        logger.error("RESEND_API_KEY not configured");
        return false;
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Check By AI <noreply@checkbyai.net>",
          to: [email],
          subject: "Your verification code for Check By AI",
          html: this.buildOtpEmailHtml(code),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ error }, "Resend API error");
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ err: error }, "Error sending email OTP");
      return false;
    }
  }

  async verifyTurnstile(token: string, ip?: string): Promise<void> {
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) return;

    try {
      const cfRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: turnstileSecret, response: token, remoteip: ip }),
      });
      const cfData = (await cfRes.json()) as { success: boolean };
      if (!cfData.success) {
        throw new ApiError(400, "CAPTCHA verification failed. Please try again.");
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      logger.error({ err }, "Turnstile verification error");
      throw new ApiError(500, "CAPTCHA verification unavailable. Please try again.");
    }
  }

  async findOrCreateUser(email: string): Promise<{ id: string; email: string | null; isNew: boolean }> {
    let user = await storage.getUserByEmail(email);
    if (user) {
      return { id: user.id, email: user.email, isNew: false };
    }
    const userId = `email_${crypto.randomUUID()}`;
    user = await storage.upsertUser({
      id: userId,
      email,
      authProvider: "email",
      isVerified: false,
    });
    return { id: user.id, email: user.email, isNew: true };
  }

  async storeOTP(identifier: string, code: string): Promise<Date> {
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    await storage.updateUserVerificationCode(identifier, code, expiry);
    return expiry;
  }

  async verifyOTP(email: string, code: string): Promise<void> {
    const user = await storage.getUserByEmail(email);
    if (!user) throw new ApiError(404, "User not found");

    if (
      !user.verificationCode ||
      user.verificationCode.length !== code.length ||
      !crypto.timingSafeEqual(Buffer.from(user.verificationCode), Buffer.from(code))
    ) {
      throw new ApiError(400, "Invalid verification code");
    }

    if (!user.codeExpiry || new Date() > user.codeExpiry) {
      throw new ApiError(400, "Verification code expired");
    }
  }

  async loginWithPassword(email: string, password: string): Promise<void> {
    const user = await storage.getUserByEmail(email);
    if (!user || !user.hashedPassword) {
      throw new ApiError(401, "Invalid email or password");
    }

    const passwordMatch = await bcrypt.compare(password, user.hashedPassword);
    if (!passwordMatch) {
      throw new ApiError(401, "Invalid email or password");
    }
  }

  async registerUser(email: string, password: string, firstName?: string, lastName?: string) {
    if (!email || !password) {
      throw new ApiError(400, "Email and password are required");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ApiError(400, "Invalid email format");
    }

    if (password.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters");
    }

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      throw new ApiError(409, "User already exists. Please log in instead.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = `email_${crypto.randomUUID()}`;
    const newUser = await storage.upsertUser({
      id: userId,
      email,
      hashedPassword,
      firstName: firstName || null,
      lastName: lastName || null,
      authProvider: "email",
      isVerified: false,
    });

    return newUser;
  }

  buildSessionUser(user: { id: string; email?: string | null; firstName?: string | null; lastName?: string | null; role?: string | null; authProvider?: string | null }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      authProvider: user.authProvider,
    };
  }

  private buildOtpEmailHtml(code: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #003366 0%, #0066cc 100%); padding: 30px; border-radius: 10px 10px 0 0;">
          <h1 style="color: #ffffff; margin: 0; text-align: center;">Verify Your Email</h1>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <p style="color: #333; font-size: 16px;">Your verification code is:</p>
          <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 25px; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 10px; margin: 20px 0; border-radius: 8px; color: #003366; border: 2px dashed #003366;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in <strong>10 minutes</strong>.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            If you didn't request this code, please ignore this email.<br>
            This is an automated message from Check By AI.
          </p>
        </div>
      </div>`;
  }
}

export const authService = new AuthService();
