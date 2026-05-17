import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import rateLimit from "express-rate-limit";
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

// Trust the first proxy so req.ip is the real client IP behind Nginx/load balancer.
// Without this, req.ip is undefined or 127.0.0.1, which breaks all IP-based rate limiting.
app.set('trust proxy', 1);

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
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

async function applyPendingMigrations() {
  const client = await pool.connect();
  try {
    // Advisory lock to prevent concurrent migrations across multiple pods
    // Lock key 9999001 is arbitrary but must be consistent
    await client.query("SELECT pg_advisory_lock(9999001)");
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
      `CREATE INDEX IF NOT EXISTS "idx_users_deleted_at" ON "users"("deleted_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_notif_log_company_name" ON "notif_log"("company_name")`,
      `CREATE TABLE IF NOT EXISTS "subscription_audit_log" (
        "id" BIGSERIAL PRIMARY KEY,
        "user_id" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "changed_by" VARCHAR,
        "source" VARCHAR NOT NULL,
        "previous_status" VARCHAR NOT NULL,
        "new_status" VARCHAR NOT NULL,
        "reason" TEXT,
        "metadata" JSONB DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_sub_audit_user_id" ON "subscription_audit_log"("user_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_sub_audit_created" ON "subscription_audit_log"("created_at" DESC)`,
      `CREATE INDEX IF NOT EXISTS "idx_sub_audit_source" ON "subscription_audit_log"("source")`,
      // Seed global notification kill switch — false = notifications active
      `INSERT INTO "system_settings" ("key", "value") VALUES ('notifications_paused', 'false') ON CONFLICT DO NOTHING`,
      `CREATE TABLE IF NOT EXISTS "sponsor_enrichment" (
        "id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        "fingerprint" varchar(500) NOT NULL UNIQUE,
        "company_number" varchar(20),
        "nature_of_business" text,
        "registered_address" text,
        "website_url" varchar(500),
        "scraped_at" timestamp DEFAULT now(),
        "scrape_status" varchar(20) NOT NULL DEFAULT 'pending',
        "last_attempted" timestamp
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_enrichment_fingerprint" ON "sponsor_enrichment"("fingerprint")`,
      `CREATE INDEX IF NOT EXISTS "idx_enrichment_scraped_at" ON "sponsor_enrichment"("scraped_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_enrichment_status" ON "sponsor_enrichment"("scrape_status")`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "company_status" varchar(50)`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "company_type" varchar(100)`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "incorporation_date" date`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "sic_codes" jsonb DEFAULT '[]'::jsonb`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "last_filed_accounts_date" date`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "next_conf_stmt_due_date" date`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "dissolved_at" date`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "companies_house_source" boolean DEFAULT false`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "fuzzy_match_score" numeric(4,3)`,
      `ALTER TABLE "sponsor_enrichment" ADD COLUMN IF NOT EXISTS "historical_names_raw" jsonb DEFAULT '[]'::jsonb`,
      // ── Phase D: sponsor_licence_timeline (1-to-many historical snapshots) ───
      `CREATE TABLE IF NOT EXISTS "sponsor_licence_timeline" (
        "id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        "fingerprint" varchar(500) NOT NULL,
        "recorded_date" date NOT NULL,
        "licence_status" varchar(100) NOT NULL,
        "route" varchar(200),
        "type_rating" varchar(50),
        "organisation_name" varchar(500),
        "source" varchar(50) NOT NULL,
        "scraped_at" timestamptz DEFAULT NOW(),
        "created_at" timestamptz DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_licence_timeline_fingerprint" ON "sponsor_licence_timeline"("fingerprint")`,
      `CREATE INDEX IF NOT EXISTS "idx_licence_timeline_date" ON "sponsor_licence_timeline"("recorded_date")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_licence_timeline_unique" ON "sponsor_licence_timeline"("fingerprint", "recorded_date", "source")`,
      // ── Phase D: enrichment_queue (async worker state ledger) ─────────────────
      `CREATE TABLE IF NOT EXISTS "enrichment_queue" (
        "id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        "fingerprint" varchar(500) NOT NULL,
        "job_type" varchar(50) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'pending',
        "priority" integer NOT NULL DEFAULT 0,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_attempted_at" timestamptz,
        "next_attempt_at" timestamptz DEFAULT NOW(),
        "locked_at" timestamptz,
        "locked_by" varchar(255),
        "error_message" text,
        "metadata" jsonb DEFAULT '{}'::jsonb,
        "created_at" timestamptz DEFAULT NOW(),
        "updated_at" timestamptz DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_enrichment_queue_poll" ON "enrichment_queue"("status", "next_attempt_at") WHERE status IN ('pending', 'rate_limited')`,
      `CREATE INDEX IF NOT EXISTS "idx_enrichment_queue_fingerprint" ON "enrichment_queue"("fingerprint")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_enrichment_queue_unique" ON "enrichment_queue"("fingerprint", "job_type")`,
      `CREATE TABLE IF NOT EXISTS "job_trigger_audit" (
        "trigger_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "correlation_id" varchar(64) NOT NULL,
        "job_name" varchar(100) NOT NULL,
        "idempotency_key" varchar(100) NOT NULL,
        "triggered_by" varchar(255) NOT NULL REFERENCES "users"("id"),
        "trigger_source" varchar(20) NOT NULL DEFAULT 'manual',
        "callback_url" text,
        "callback_status" varchar(20),
        "callback_attempts" integer NOT NULL DEFAULT 0,
        "callback_last_error" text,
        "callback_last_attempt_at" timestamp,
        "reason" text,
        "status" varchar(20) NOT NULL DEFAULT 'accepted',
        "failure_reason" text,
        "triggered_at" timestamp NOT NULL DEFAULT now(),
        "completed_at" timestamp,
        "duration_ms" integer
      )`,
      `ALTER TABLE "job_trigger_audit" ADD COLUMN IF NOT EXISTS "callback_status" varchar(20)`,
      `ALTER TABLE "job_trigger_audit" ADD COLUMN IF NOT EXISTS "callback_attempts" integer NOT NULL DEFAULT 0`,
      `ALTER TABLE "job_trigger_audit" ADD COLUMN IF NOT EXISTS "callback_last_error" text`,
      `ALTER TABLE "job_trigger_audit" ADD COLUMN IF NOT EXISTS "callback_last_attempt_at" timestamp`,
      `CREATE INDEX IF NOT EXISTS "idx_job_trigger_audit_job_name" ON "job_trigger_audit"("job_name", "triggered_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_job_trigger_audit_triggered_by" ON "job_trigger_audit"("triggered_by", "triggered_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_job_trigger_audit_idempotency" ON "job_trigger_audit"("job_name", "idempotency_key")`,
      `CREATE INDEX IF NOT EXISTS "idx_job_trigger_audit_status" ON "job_trigger_audit"("status")`,
      `CREATE TABLE IF NOT EXISTS "shadow_run_results" (
        "id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        "correlation_id" varchar(64) NOT NULL,
        "job_name" varchar(100) NOT NULL,
        "run_mode" varchar(20) NOT NULL DEFAULT 'shadow',
        "trigger_source" varchar(20) NOT NULL DEFAULT 'manual',
        "triggered_by" varchar(255) NOT NULL REFERENCES "users"("id"),
        "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "result" varchar(20) NOT NULL,
        "failure_reason" text,
        "duration_ms" integer,
        "started_at" timestamp NOT NULL,
        "completed_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_shadow_run_results_job_created" ON "shadow_run_results"("job_name", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_shadow_run_results_correlation" ON "shadow_run_results"("correlation_id")`,
      `CREATE TABLE IF NOT EXISTS "shadow_parity_reports" (
        "id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        "shadow_run_id" integer NOT NULL REFERENCES "shadow_run_results"("id"),
        "production_correlation_id" varchar(64),
        "job_name" varchar(100) NOT NULL,
        "parity_score" numeric(5,4) NOT NULL,
        "outcome_match" boolean NOT NULL,
        "duration_drift_ms" integer,
        "records_drift" integer,
        "change_drift_json" jsonb DEFAULT '{}'::jsonb,
        "drift_summary" text,
        "created_at" timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_shadow_parity_reports_job_created" ON "shadow_parity_reports"("job_name", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "idx_shadow_parity_reports_shadow_run" ON "shadow_parity_reports"("shadow_run_id")`,
      `ALTER TABLE "monitor_job_runs" ADD COLUMN IF NOT EXISTS "notifications_queued" integer DEFAULT 0`,
      `ALTER TABLE "diff_results" ADD COLUMN IF NOT EXISTS "diff_json" JSONB`,
      `ALTER TABLE "csv_archive" ADD COLUMN IF NOT EXISTS "sync_status" TEXT NOT NULL DEFAULT 'SYNCED'`,
      `CREATE INDEX IF NOT EXISTS "idx_csv_archive_sync_status" ON "csv_archive"("sync_status", "snapshot_date" DESC) WHERE "sync_status" != 'SYNCED'`,
      `CREATE TABLE IF NOT EXISTS "incident_tickets" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "job_name" varchar NOT NULL,
        "severity" varchar(4) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'open',
        "title" text NOT NULL,
        "context" jsonb NOT NULL,
        "remediation_correlation_id" varchar,
        "resolved_by" varchar,
        "resolved_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_incident_tickets_job" ON "incident_tickets"("job_name")`,
      `CREATE INDEX IF NOT EXISTS "idx_incident_tickets_severity" ON "incident_tickets"("severity")`,
      `CREATE INDEX IF NOT EXISTS "idx_incident_tickets_status" ON "incident_tickets"("status")`,
      `CREATE INDEX IF NOT EXISTS "idx_incident_tickets_created" ON "incident_tickets"("created_at" DESC)`,
      `CREATE TABLE IF NOT EXISTS "sponsor_watches" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "company_name" text NOT NULL,
        "company_number" text,
        "status" varchar NOT NULL DEFAULT 'pending_activation',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "notified_at" timestamp
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_sponsor_watches_user_id" ON "sponsor_watches"("user_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_sponsor_watches_status" ON "sponsor_watches"("status")`,
      `CREATE INDEX IF NOT EXISTS "idx_sponsor_watches_company_name" ON "sponsor_watches"("company_name")`,
    ];
    for (const sql of migrations) {
      await client.query(sql);
    }

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

    log("Schema migrations applied successfully");
  } catch (error) {
    logger.error({ err: error }, "Failed to apply schema migrations");
  } finally {
    // Release advisory lock
    try {
      await client.query("SELECT pg_advisory_unlock(9999001)");
    } catch (unlockErr) {
      logger.warn({ err: unlockErr }, "Failed to release advisory lock");
    }
    client.release();
  }

  // Concurrent indexes run after migrations (outside the advisory lock since
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
   await applyPendingMigrations();
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
