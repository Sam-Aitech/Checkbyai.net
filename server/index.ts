import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";

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
      });
      log(`Admin user created: ${adminEmail} (OTP login only)`);
    } else {
      await storage.upsertUser({
        ...existingEmailAdmin,
        role: "admin",
        isVerified: true,
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

// Security and Performance Headers
app.use((req, res, next) => {
  // Security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Performance headers for static assets
  if (req.url.match(/\.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$/)) {
    res.header('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    res.header('Expires', new Date(Date.now() + 31536000000).toUTCString());
  }
  
  // Disable directory listing and powered-by header
  res.header('X-Powered-By', '');
  
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
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

(async () => {
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
