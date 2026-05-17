import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { storage } from "./storage";

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

// Check if IP can verify (7-day cooldown)
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
      
      if (daysSinceVerification < 7) {
        const daysRemaining = Math.ceil(7 - daysSinceVerification);
        const hoursRemaining = Math.ceil((7 - daysSinceVerification) * 24);
        
        return res.status(429).json({
          message: "Rate limit exceeded",
          error: "You can only verify one document every 7 days",
          daysRemaining,
          hoursRemaining,
          nextVerificationDate: new Date(lastVerification.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
    
    // Store hashed IP in request for later use
    (req as any).hashedIp = hashedIp;
    (req as any).clientIp = clientIp;
    
    next();
  } catch (error) {
    console.error("IP rate limit check error:", error);
    // On error, allow the request to proceed (fail open)
    next();
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
