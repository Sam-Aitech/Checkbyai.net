import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { makeRateLimitStore } from "./utils/redisRateLimitStore";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { pool } from "./db";
import { logger } from "./utils/logger";

// Import the job queue setup
import { initJobQueue, setupWorkers } from "./services/jobQueue";
import { initRedisCache, cacheFlushPattern } from "./utils/redisClient";
import { rebuildSponsorIndex } from "./utils/sponsorSearch";

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
  missingVars.forEach((v) => logger.fatal({ envVar: v }, `CRITICAL: Missing required environment variable: ${v}`));
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

// ── Python ETL Agent Health Check (Phase 1d) ──
async function checkPythonBackend() {
  const pythonUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${pythonUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      logger.info({ url: pythonUrl }, "Python ETL agent is ONLINE");
    } else {
      logger.warn({ url: pythonUrl, status: res.status }, "Python ETL agent returned non-OK status");
    }
  } catch (err) {
    logger.error(
      { url: pythonUrl, error: err instanceof Error ? err.message : String(err) },
      "Python ETL agent is OFFLINE. CSV discovery fallback to Scrapling will be unavailable."
    );
  }
}

// STRIPE_WEBHOOK_SECRET is not hard-required (app starts without it) but webhooks
// will silently return 400 and plans will never activate if it is missing.
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  logger.warn(
    "STRIPE_WEBHOOK_SECRET is not set. Stripe webhooks will fail signature verification " +
    "and all plan activations via webhook will silently fail. " +
    "Set this to the whsec_... value from your Stripe dashboard → Webhooks.",
  );
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
    logger.error({ err: error }, "Failed to seed admin user");
  }
}

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// Trust the first proxy so req.ip is the real client IP behind Nginx/load balancer.
// Without this, req.ip is undefined or 127.0.0.1, which breaks all IP-based rate limiting.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Helmet is applied first to enforce baseline browser hardening before any other middleware:
// CSP allows only self + Stripe + Cloudflare Turnstile (with narrowly scoped unsafe-inline/unsafe-eval
// kept only where required by existing inline SEO JSON-LD + inline styles in client/index.html and Vite dev HMR), HSTS is enabled
// in production, and frame-ancestors/x-frame-options deny embedding to prevent clickjacking on sensitive pages/PDF flows.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: isProduction
        ? ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://challenges.cloudflare.com"]
        : ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: isProduction
        ? ["'self'", "https://api.stripe.com", "https://challenges.cloudflare.com"]
        : ["'self'", "https://api.stripe.com", "https://challenges.cloudflare.com", "ws:", "wss:"],
      frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com", "https://challenges.cloudflare.com"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  hsts: isProduction
    ? {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true,
      }
    : false,
  xFrameOptions: { action: "deny" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.url.startsWith('/api/auth')) return false;
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));


// Global catch-all fallback rate limiter (200 req / 15 min per IP).
// Covers all endpoints that don't have their own tighter limiter.
// This resolves the bulk of the 100+ CodeQL "Missing rate limiting" alerts.
const globalFallbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRateLimitStore("rl:global:"),
    message: { message: "Too many requests. Please try again later." },
    // Skip static asset paths — served by Vite/CDN in production
    skip: (req: any) =>
          req.path.startsWith("/assets/") || req.path.startsWith("/static/"),
});
app.use(globalFallbackLimiter);
// WWW redirect middleware - redirect www to non-www
app.use((req, res, next) => {
  if (req.headers.host && req.headers.host.startsWith('www.')) {
    const newHost = req.headers.host.replace('www.', '');
    const redirectUrl = `${req.protocol}://${newHost}${req.originalUrl}`;
    return res.redirect(301, redirectUrl);
  }
  next();
});

// T001: Security and Performance Headers
app.use((req, res, next) => {
  res.header(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")'
  );

  // Performance headers for static assets
  if (req.url.match(/\.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$/)) {
    res.header('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    res.header('Expires', new Date(Date.now() + 31536000000).toUTCString());
  }
  
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

// Add CORS middleware — explicit origin whitelist (never reflect Host header)
app.use((req, res, next) => {
  const ALLOWED_ORIGINS = [
    'https://checkbyai.net',
    'https://www.checkbyai.net',
    ...(process.env.NODE_ENV !== 'production'
      ? ['http://localhost:5000', 'http://localhost:3000', 'http://127.0.0.1:5000']
      : []),
    ...(process.env.APP_URL ? [process.env.APP_URL] : []),
  ];

  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
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

async function applyDataFixbacks() {
  const client = await pool.connect();
  try {
    // ── One-time backfill: retire the legacy "NOT_LISTED" status value ──────
    // The current schema enum is ACTIVE | NEWLY_GRANTED | GRACE_PERIOD | REMOVED_REVOKED.
    // Earlier ingestion code wrote NOT_LISTED rows that were never migrated,
    // which caused the Sponsor Monitor UI to render a green "Active" badge for
    // companies whose licence had actually been revoked. This backfill is
    // idempotent — once all rows are migrated, the WHERE clause matches none.
    try {
      const notListedFix = await client.query<{ count: string }>(
        `UPDATE "sponsor_canonical"
         SET    "status"     = 'REMOVED_REVOKED',
                "removed_at" = COALESCE("removed_at", ("last_seen" + INTERVAL '1 day')::timestamptz)
         WHERE  "status" = 'NOT_LISTED'
         RETURNING 1`,
      );
      const fixedRows = notListedFix.rowCount ?? 0;
      if (fixedRows > 0) {
        log(`Migrated ${fixedRows} legacy NOT_LISTED rows → REMOVED_REVOKED`);
      }
    } catch (err) {
      logger.warn({ err }, "Non-blocking: NOT_LISTED → REMOVED_REVOKED backfill failed");
    }
  } finally {
    client.release();
  }

  // Concurrent indexes run outside a transaction (CREATE INDEX CONCURRENTLY requirement).
  // CREATE INDEX CONCURRENTLY cannot run inside a transaction/lock).
  const concurrentIndexes = [
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sc_status_name" ON "sponsor_canonical"("status", "current_name")`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sc_status_town" ON "sponsor_canonical"("status", "town_city")`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sc_status_type" ON "sponsor_canonical"("status", "type_rating")`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_changes_date_type" ON "sponsor_changes"("snapshot_date" DESC, "change_type")`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_changes_fp_detected" ON "sponsor_changes"("fingerprint", "detected_at" DESC) WHERE "fingerprint" IS NOT NULL`,
  ];
  for (const sql of concurrentIndexes) {
    try {
      await pool.query(sql);
    } catch (err: any) {
      if (err?.code === '42P07') continue;
      logger.warn({ err }, "Non-blocking: concurrent index creation failed (will retry next boot)");
    }
  }
}

(async () => {
   await applyDataFixbacks();
   await checkPythonBackend();

   // ── Startup data integrity check ─────────────────────────────────────────
   // Warn ops if sponsor_canonical is empty — the register will show no data
   // until the ETL pipeline has completed at least one successful run.
   try {
     const countResult = await pool.query<{ count: string }>(
       "SELECT COUNT(*)::text AS count FROM sponsor_canonical"
     );
     const rowCount = parseInt(countResult.rows[0]?.count ?? "0", 10);
     if (rowCount === 0) {
       logger.warn(
         "[Startup] sponsor_canonical table is EMPTY. " +
         "The sponsor register will show no data until the ETL pipeline completes. " +
         "Trigger a manual refresh via POST /api/admin/ops/reconcile or ensure the nightly cron is scheduled."
       );
     } else {
       logger.info({ rowCount }, "[Startup] sponsor_canonical loaded — register is ready.");
     }
   } catch (err) {
     logger.error({ err }, "[Startup] Failed to check sponsor_canonical row count — DB may be unavailable.");
   }
   
   // Probe Redis: initialise BullMQ queues + shared cache client (no-op if Redis is unavailable)
   await initJobQueue();
   await initRedisCache();
   // One-shot cache invalidation on boot: ensures the NOT_LISTED → REMOVED_REVOKED
   // backfill is reflected in the watch list immediately on the first deploy
   // after this fix (and is a cheap no-op on subsequent restarts).
   // Flush both watches:* (per-user watch list) and sponsors:* (directory,
   // search, stats, changes) so every status-derived view immediately reflects
   // the NOT_LISTED → REMOVED_REVOKED backfill — no stale TTL window.
   try {
     const [watchesFlushed, sponsorsFlushed] = await Promise.all([
       cacheFlushPattern("watches:*"),
       cacheFlushPattern("sponsors:*"),
     ]);
     if (watchesFlushed > 0 || sponsorsFlushed > 0) {
       log(`Flushed ${watchesFlushed} watches:* + ${sponsorsFlushed} sponsors:* cache entries on boot`);
     }
   } catch (err) {
     logger.warn({ err }, "Non-blocking: status cache flush failed on boot");
   }
   setupWorkers();
   
   const server = await registerRoutes(app);

   app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
     const status = err.status || err.statusCode || 500;
     const message = err.message || "Internal Server Error";

     if (!res.headersSent) {
       res.status(status).json({ message });
     }
     
     logger.error({ err, status }, "Unhandled server error");
   });

   // importantly only setup vite in development and after
   // setting up all the other routes so the catch-all route
   // doesn't interfere with the other routes
   if (app.get("env") === "development") {
     await setupVite(app, server);
   } else {
     serveStatic(app);
   }

   // Eagerly warm the Fuse.js sponsor index so the first request after a restart
   // hits a warm index rather than triggering an on-demand full-table scan.
   // Fire-and-forget: a failed warm-up degrades to the normal lazy-build path.
   rebuildSponsorIndex().catch((err: unknown) =>
     console.warn("[Startup] Sponsor index warm-up failed (non-fatal):", err instanceof Error ? err.message : String(err))
   );

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
