import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import crypto from "crypto";
import { otpLimiter } from "./middleware/rateLimiter";


if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: sessionTtl,
    },
  });
}

// Generate 6-digit OTP code
export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Send OTP via Resend email (for regular users)
export async function sendEmailOTP(email: string, code: string): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return false;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Check By AI <noreply@checkbyai.net>",
        to: [email],
        subject: "Your verification code for Check By AI",
        html: `
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
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending email OTP:", error);
    return false;
  }
}

// Send Admin OTP via Resend email
export async function sendAdminOTPViaResend(email: string, code: string): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return false;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Check By AI <noreply@checkbyai.net>",
        to: [email],
        subject: "Admin Login - Your Verification Code",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003366 0%, #0066cc 100%); padding: 30px; border-radius: 10px 10px 0 0;">
              <h1 style="color: #ffffff; margin: 0; text-align: center;">Admin Login</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <p style="color: #333; font-size: 16px;">Your admin verification code is:</p>
              <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 25px; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 10px; margin: 20px 0; border-radius: 8px; color: #003366; border: 2px dashed #003366;">
                ${code}
              </div>
              <p style="color: #666; font-size: 14px;">This code will expire in <strong>10 minutes</strong>.</p>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                If you didn't request this code, please ignore this email.<br>
                This is an automated message from Check By AI Admin Portal.
              </p>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending admin OTP via Resend:", error);
    return false;
  }
}

export async function sendMasterPackageNotification(userEmail: string, userId: string): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return false;
    }

    const adminEmail = process.env.ADMIN_EMAIL || "admin@checkbyai.net";

    const adminResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Check By AI <noreply@checkbyai.net>",
        to: [adminEmail],
        subject: "New Master Package Purchase - Expert Review Required",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 30px; border-radius: 10px 10px 0 0;">
              <h1 style="color: #ffffff; margin: 0; text-align: center;">New Expert Review Request</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6;">
                A new Master Package has been purchased requiring expert document review.
              </p>
              <div style="background: #f8f4ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Customer Email:</strong> ${userEmail}</p>
                <p style="margin: 5px 0;"><strong>User ID:</strong> ${userId}</p>
                <p style="margin: 5px 0;"><strong>SLA:</strong> 24-hour response required</p>
              </div>
              <p style="color: #666666; font-size: 14px;">
                Please log in to the admin portal to review pending expert requests.
              </p>
              <div style="text-align: center; margin-top: 25px;">
                <a href="https://checkbyai.net/admin" style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Go to Admin Portal
                </a>
              </div>
            </div>
          </div>
        `,
      }),
    });

    if (!adminResponse.ok) {
      console.error("Failed to send admin notification:", await adminResponse.text());
    }

    const userResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Check By AI <noreply@checkbyai.net>",
        to: [userEmail],
        subject: "Master Package Purchase Confirmed - Expert Review",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 30px; border-radius: 10px 10px 0 0;">
              <h1 style="color: #ffffff; margin: 0; text-align: center;">Master Package Confirmed</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6;">
                Thank you for purchasing our Master Package with priority expert review!
              </p>
              <div style="background: #f8f4ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #7c3aed; margin-top: 0;">What's Next?</h3>
                <ul style="color: #333333; padding-left: 20px;">
                  <li>Upload your document in the dashboard</li>
                  <li>Our expert team will review it within 24 hours</li>
                  <li>You'll receive a detailed analysis report via email</li>
                </ul>
              </div>
              <p style="color: #666666; font-size: 14px;">
                If you have any questions, please contact our support team.
              </p>
              <div style="text-align: center; margin-top: 25px;">
                <a href="https://checkbyai.net/dashboard" style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Upload Your Document
                </a>
              </div>
            </div>
          </div>
        `,
      }),
    });

    if (!userResponse.ok) {
      console.error("Failed to send user confirmation:", await userResponse.text());
      return false;
    }

    console.log(`Master Package notification emails sent for user ${userId}`);
    return true;
  } catch (error) {
    console.error("Error sending Master Package notifications:", error);
    return false;
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const currentDomain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
    const fullCallbackURL = currentDomain.includes('localhost') 
      ? `http://${currentDomain}/api/auth/google/callback`
      : `https://${currentDomain}/api/auth/google/callback`;
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: fullCallbackURL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists by Google ID
        let user = await storage.getUserByGoogleId(profile.id);
        
        if (!user) {
          // Create new user with Google profile
          const userId = `google_${profile.id}`;
          user = await storage.upsertUser({
            id: userId,
            googleId: profile.id,
            email: profile.emails?.[0]?.value || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            profileImageUrl: profile.photos?.[0]?.value || null,
            authProvider: 'google',
            isVerified: true,
          });
        }
        
        // Create session user object
        const sessionUser = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          role: user.role,
          authProvider: user.authProvider,
        };
        
        return done(null, sessionUser);
      } catch (error) {
        return done(error, false);
      }
    }));
  }

  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  // Google OAuth routes
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    app.get("/api/auth/google", 
      passport.authenticate("google", { scope: ["profile", "email"] })
    );

    app.get("/api/auth/google/callback", 
      passport.authenticate("google", { failureRedirect: "/login?error=auth_failed" }),
      (req, res) => {
        res.redirect("/sponsor-monitor");
      }
    );
  }

  // Email OTP: Send verification code
  app.post("/api/auth/email/send-otp", otpLimiter, async (req, res) => {
    try {
      const { email, turnstileToken } = req.body;
      
      if (!email || !email.includes("@")) {
        return res.status(400).json({ message: "Valid email required" });
      }

      // Cloudflare Turnstile CAPTCHA verification
      // If TURNSTILE_SECRET_KEY is set, verify the token; skip in dev if key absent
      const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
      if (turnstileSecret) {
        if (!turnstileToken) {
          return res.status(400).json({ message: "CAPTCHA verification required" });
        }
        try {
          const cfRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              secret: turnstileSecret,
              response: turnstileToken,
              remoteip: req.ip,
            }),
          });
          const cfData = await cfRes.json() as { success: boolean };
          if (!cfData.success) {
            return res.status(400).json({ message: "CAPTCHA verification failed. Please try again." });
          }
        } catch (cfError) {
          console.error("Turnstile verification error:", cfError);
          return res.status(500).json({ message: "CAPTCHA verification unavailable. Please try again." });
        }
      }

      // Generate OTP and set expiry (10 minutes)
      const code = generateOTP();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);

      // Check if user exists
      let user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Create new user
        const userId = `email_${crypto.randomUUID()}`;
        user = await storage.upsertUser({
          id: userId,
          email,
          authProvider: 'email',
          isVerified: false,
        });
      }

      // Store OTP code
      await storage.updateUserVerificationCode(email, code, expiry);

      // Send email
      const sent = await sendEmailOTP(email, code);
      
      if (!sent) {
        return res.status(500).json({ message: "Failed to send verification email" });
      }

      res.json({ message: "Verification code sent to your email" });
    } catch (error) {
      console.error("Error sending OTP:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  // Email OTP: Verify code
  app.post("/api/auth/email/verify-otp", otpLimiter, async (req, res) => {
    try {
      const { email, code } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ message: "Email and code required" });
      }

      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check code and expiry
      if (user.verificationCode !== code) {
        return res.status(400).json({ message: "Invalid verification code" });
      }

      if (!user.codeExpiry || new Date() > user.codeExpiry) {
        return res.status(400).json({ message: "Verification code expired" });
      }

      // Mark user as verified
      const verifiedUser = await storage.verifyUser(email);
      
      if (!verifiedUser) {
        return res.status(500).json({ message: "Failed to verify user" });
      }

      // Create session
      const sessionUser = {
        id: verifiedUser.id,
        email: verifiedUser.email,
        firstName: verifiedUser.firstName,
        lastName: verifiedUser.lastName,
        role: verifiedUser.role,
        authProvider: verifiedUser.authProvider,
      };

      req.login(sessionUser, (err) => {
        if (err) {
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({ message: "Login successful", user: sessionUser });
      });
    } catch (error) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ message: "Failed to verify code" });
    }
  });

  // Admin OTP: Send verification code via Resend
  app.post("/api/auth/admin/send-otp", otpLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "Valid email required" });
      }

      // Check if email matches ADMIN_EMAIL
      const envAdminEmail = process.env.ADMIN_EMAIL;
      
      if (!envAdminEmail || email.toLowerCase() !== envAdminEmail.toLowerCase()) {
        return res.status(403).json({ error: "This email is not authorized for admin access" });
      }

      // Generate OTP and set expiry (10 minutes)
      const code = generateOTP();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);

      // Get or create admin user
      let adminUser = await storage.getUserByEmail(email);
      
      if (!adminUser) {
        adminUser = await storage.upsertUser({
          id: "admin_" + crypto.randomUUID().slice(0, 8),
          email: email,
          authProvider: "admin",
          role: "admin",
          isVerified: true,
        });
      }

      // Store OTP code
      await storage.updateUserVerificationCode(email, code, expiry);

      // Send email via Resend
      const sent = await sendAdminOTPViaResend(email, code);
      
      if (!sent) {
        return res.status(500).json({ error: "Failed to send verification email. Please check Resend API configuration." });
      }

      res.json({ message: "Verification code sent to your email" });
    } catch (error) {
      console.error("Error sending admin OTP:", error);
      res.status(500).json({ error: "Failed to send verification code" });
    }
  });

  // Admin OTP: Verify code and login
  app.post("/api/auth/admin/verify-otp", otpLimiter, async (req, res) => {
    try {
      const { email, code } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ error: "Email and code required" });
      }

      // Check if email matches ADMIN_EMAIL
      const envAdminEmail = process.env.ADMIN_EMAIL;
      
      if (!envAdminEmail || email.toLowerCase() !== envAdminEmail.toLowerCase()) {
        return res.status(403).json({ error: "This email is not authorized for admin access" });
      }

      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check code and expiry
      if (user.verificationCode !== code) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      if (!user.codeExpiry || new Date() > user.codeExpiry) {
        return res.status(400).json({ error: "Verification code expired" });
      }

      // Clear verification code and ensure admin role
      const updatedUser = await storage.upsertUser({
        ...user,
        role: "admin",
        verificationCode: null,
        codeExpiry: null,
      });

      // Create session
      const sessionUser = {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username || updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: 'admin',
        authProvider: 'admin',
      };

      req.login(sessionUser, (err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to create session" });
        }
        res.json({ message: "Login successful", user: sessionUser });
      });
    } catch (error) {
      console.error("Error verifying admin OTP:", error);
      res.status(500).json({ error: "Failed to verify code" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ message: "Logged out successfully" });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;
  const userId = user.id;
  const dbUser = await storage.getUser(userId);
  
  if (!dbUser || dbUser.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
};
