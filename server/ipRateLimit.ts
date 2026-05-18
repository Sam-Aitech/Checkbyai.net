import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { storage } from "./storage";
import { logger } from "./utils/logger";

// Hash IP address for privacy (GDPR compliance)
export function hashIpAddress(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) throw new Error("IP_HASH_SALT environment variable is required");
  return crypto.createHash("sha256").update(ip + salt).digest("hex");
}

// Get client IP address from the trusted proxy chain
export function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

// Check if IP can verify (1-day cooldown)
export async function checkIpRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const clientIp = getClientIp(req);
    const hashedIp = hashIpAddress(clientIp);
    
    // Check if this IP has verified recently
    const ipRecord = await storage.getIpVerification(hashedIp);
    
    if (ipRecord) {
      const lastVerification = new Date(ipRecord.lastVerificationDate);
      const now = new Date();
      const daysSinceVerification = (now.getTime() - lastVerification.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceVerification < 1) {
        const hoursRemaining = Math.ceil((1 - daysSinceVerification) * 24);
        
        return res.status(429).json({
          message: "Rate limit exceeded",
          error: "You can only verify one document per day",
          hoursRemaining,
          nextVerificationDate: new Date(lastVerification.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
    
    // Store hashed IP in request for later use
    (req as any).hashedIp = hashedIp;
    (req as any).clientIp = clientIp;
    
    next();
  } catch (error) {
        // FAIL CLOSED: On any error (e.g. Redis outage), BLOCK the request.
        // Failing open on a fraud-protection platform would allow unlimited
        // document submissions during any storage or Redis downtime.
        logger.error(
          { err: error },
                "IP rate-limit check failed \u2014 blocking request to prevent abuse during outage",
              );
        return res.status(503).json({
                message:
                          "Verification service temporarily unavailable. " +
                          "Please try again in a few minutes.",
                code: "rate_limit_unavailable",
        });
  }
  
  }

// Record verification for IP
export async function recordIpVerification(hashedIp: string): Promise<void> {
  await storage.upsertIpVerification({
    ipAddress: hashedIp,
    lastVerificationDate: new Date(),
    verificationCount: 1,
  });
}
