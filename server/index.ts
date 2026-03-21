import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { pool } from "./db";

// Import the job queue setup
import { initJobQueue, setupWorkers } from "./services/jobQueue";

// Startup validation — fail fast if truly critical env vars are missing
// ADMIN_EMAIL is intentionally excluded: the app handles its absence gracefully (admin emails disabled)
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "PHONE_ENCRYPTION_KEY",
  "IP_HASH_SALT",
  "CHECKOUT_HMAC_SECRET",
  "DIGEST_SIGNING_KEY",
];

const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  missingVars.forEach((v) => console.error(`CRITICAL: Missing required environment variable: ${v}`));
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

async function seedAdminUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    
    if (!adminEmail) {
      log("ADMIN_EMAIL environment variable is required for admin setup");
      return;
    }
    
    const existingEmailAdmin = await storage.getUserByEmail(adminEmail);
    
    if (!existingEmailAdmin) {
      await storage.upsertUser({
        id: "admin_primary",
        username: adminEmail,
        email: adminEmail,
        authProvider: "admin",
        role: "admin",
        isVerified: true,
        cosCheckApproved: true,
      });
      log(`Admin user created: ${adminEmail} (OTP login only)`);
    } else {
      await storage.upsertUser({
        ...existingEmailAdmin,
        role: "admin",
        isVerified: true,
        cosCheckApproved: true,
      });
      log(`Admin user updated: ${adminEmail}`);
    }
  } catch (error) {
    console.error("Failed to seed admin user:", error);
  }
}

const app = express();

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// WWW redirect middleware - redirect www to non-www
app.use((req, res, next) => {
  if (req.headers.host && req.headers.host.startsWith('www.')) {
    const newHost = req.headers.host.replace('www.', '');
    const redirectUrl = `${req.protocol}://${newHost}${req.originalUrl}`;
    return res.redirect(301, redirectUrl);
  }
  next();
});

// T001: Security and Performance Headers (including CSP, HSTS, Permissions-Policy)
app.use((req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';

  // Basic security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS — enforce HTTPS in production only
  if (isProd) {
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Permissions-Policy — restrict browser features
  res.header(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")'
  );

  // Content-Security-Policy
  // Dev: relaxed to allow Vite HMR websocket and inline scripts
  // Prod: tighter, no unsafe-eval
  const scriptSrc = isProd
    ? "'self' 'unsafe-inline' https://js.stripe.com"
    : "'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com";
  const connectSrc = isProd
    ? "'self' https://api.stripe.com"
    : "'self' https://api.stripe.com ws: wss:";

  res.header(
    'Content-Security-Policy',
    [
      `default-src 'self'`,
      `script-src ${scriptSrc}`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src 'self' https://fonts.gstatic.com data:`,
      `img-src 'self' data: https:`,
      `connect-src ${connectSrc}`,
      `frame-src https://js.stripe.com https://hooks.stripe.com`,
      `worker-src 'self' blob:`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join('; ')
  );

  // Performance headers for static assets
  if (req.url.match(/\.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$/)) {
    res.header('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    res.header('Expires', new Date(Date.now() + 31536000000).toUTCString());
  }
  
  // Disable powered-by header
  res.removeHeader('X-Powered-By');
  
  // Block access to uploads folder (private documents)
  if (req.url.startsWith('/uploads/')) {
    return res.status(403).send('Access denied');
  }
  
  // Block directory listing attempts
  if (req.url.endsWith('/') && req.url !== '/') {
    return res.status(404).send('Directory listing disabled');
  }
  
  next();
});

// Add CORS middleware
app.use((req, res, next) => {
  const allowedOrigin = req.headers.host ? `${req.protocol}://${req.headers.host}` : '';
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Body parsing middleware (excluding multipart which multer handles)
// The verify callback captures the raw body for Stripe webhook signature verification
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => {
    if (req.originalUrl && req.originalUrl.startsWith('/api/stripe-webhook')) {
      req.rawBody = buf;
    }
  },
}));
// T005: Use extended:false to prevent prototype pollution via nested object parsing
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

async function applyPendingMigrations() {
  const client = await pool.connect();
  try {
    const migrations = [
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cos_beta_enabled" boolean DEFAULT false`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cos_beta_limit" integer`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notif_prefs" jsonb`,
      `CREATE TABLE IF NOT EXISTS "notif_engine_log" (
        "id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        "user_id" varchar NOT NULL REFERENCES "users"("id"),
        "change_id" integer NOT NULL REFERENCES "sponsor_changes"("id"),
        "event_type" varchar NOT NULL,
        "channel" varchar NOT NULL DEFAULT 'email',
        "status" varchar NOT NULL,
        "sent_at" timestamp,
        "deliver_after" timestamp,
        "provider_message_id" varchar,
        "error_details" text,
        "created_at" timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_notif_engine_log_user_id" ON "notif_engine_log"("user_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_notif_engine_log_change_id" ON "notif_engine_log"("change_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_notif_engine_log_status" ON "notif_engine_log"("status")`,
      `CREATE INDEX IF NOT EXISTS "idx_notif_engine_log_deliver_after" ON "notif_engine_log"("deliver_after")`,
      `CREATE TABLE IF NOT EXISTS "notif_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL REFERENCES "users"("id"),
        "change_id" integer REFERENCES "sponsor_changes"("id"),
        "event_type" varchar NOT NULL,
        "channel" varchar NOT NULL DEFAULT 'email',
        "company_name" text NOT NULL,
        "success" boolean NOT NULL,
        "provider_message_id" varchar,
        "error_details" text,
        "sent_at" timestamp DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_notif_log_user_sent" ON "notif_log"("user_id", "sent_at")`,
    ];
    for (const sql of migrations) {
      await client.query(sql);
    }
    log("Schema migrations applied successfully");
  } catch (error) {
    console.error("Failed to apply schema migrations:", error);
  } finally {
    client.release();
  }
}

(async () => {
  await applyPendingMigrations();
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    
    console.error('Server error:', err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Probe Redis and initialise BullMQ queues (no-op if Redis is unavailable)
  await initJobQueue();
  setupWorkers();

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    await seedAdminUser();
  });
})();