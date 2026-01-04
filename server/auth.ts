import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import crypto from "crypto";
import bcrypt from "bcrypt";

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
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

// Generate 6-digit OTP code
export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Send OTP via Resend email
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
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Check By AI <noreply@checkbyai.net>",
        to: email,
        subject: "Your verification code for Check By AI",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #003366;">Verify Your Email</h2>
            <p>Your verification code is:</p>
            <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
              ${code}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
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
        // Successful authentication, redirect to dashboard
        res.redirect("/dashboard");
      }
    );
  }

  // Email OTP: Send verification code
  app.post("/api/auth/email/send-otp", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || !email.includes("@")) {
        return res.status(400).json({ message: "Valid email required" });
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
  app.post("/api/auth/email/verify-otp", async (req, res) => {
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

  // Admin login with username/password (accepts email or username)
  app.post("/api/auth/admin-login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      // Get user by username or email
      let user = await storage.getUserByUsername(username);
      if (!user) {
        user = await storage.getUserByEmail(username);
      }
      
      if (!user || !user.hashedPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Verify admin role
      if (user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
      
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Create session
      const sessionUser = {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        authProvider: 'admin',
      };

      req.login(sessionUser, (err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to create session" });
        }
        res.json({ message: "Login successful", user: sessionUser });
      });
    } catch (error) {
      console.error("Error in admin login:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Change password (authenticated users only)
  app.post("/api/auth/change-password", isAuthenticated, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }

      const user = req.user as any;
      const userId = user.id;

      // Get user from database
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser || !dbUser.hashedPassword) {
        return res.status(400).json({ error: "Password change not available for this account" });
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, dbUser.hashedPassword);
      
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await storage.updateUserPassword(userId, hashedPassword);

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Failed to change password" });
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
