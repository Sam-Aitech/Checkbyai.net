/**
 * roleGuard — Phase 1 RBAC baseline
 *
 * Defines the platform role matrix and provides typed middleware for
 * role-based access control. All privileged action handlers should use
 * requireRole() instead of duplicating inline role checks.
 *
 * Role hierarchy (ascending privilege):
 *   viewer < support < analyst < billing < admin < owner
 *
 * Current user roles stored in users.role (text column, DB-authoritative).
 * Defaults to "viewer" when role is null/undefined.
 */

import type { RequestHandler } from "express";
import { storage } from "../storage";
import { logger } from "../utils/logger";

const log = logger.child({ module: "RoleGuard" });

// ── Role matrix ───────────────────────────────────────────────────────────────

export type AppRole =
  | "viewer"
  | "support"
  | "analyst"
  | "billing"
  | "admin"
  | "owner";

/** Ordered list — higher index = more privilege. */
const ROLE_HIERARCHY: AppRole[] = [
  "viewer",
  "support",
  "analyst",
  "billing",
  "admin",
  "owner",
];

function roleRank(role: string | null | undefined): number {
  const idx = ROLE_HIERARCHY.indexOf((role ?? "viewer") as AppRole);
  return idx === -1 ? 0 : idx;
}

/** Returns true when the user's role meets or exceeds the required role. */
export function hasRole(userRole: string | null | undefined, required: AppRole): boolean {
  return roleRank(userRole) >= roleRank(required);
}

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Express middleware that enforces a minimum role.
 *
 * Usage:
 *   app.post('/api/admin/something', requireRole('admin'), handler);
 *   app.get('/api/ops/report', requireRole('analyst'), handler);
 *
 * Responds 401 when unauthenticated, 403 when authenticated but insufficient role.
 * Does NOT log sensitive request data — only the role check outcome.
 */
export function requireRole(minimum: AppRole): RequestHandler {
  return async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const rawUser = req.user as any;
      const dbUser = await storage.getUser(rawUser.id);

      if (!dbUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!hasRole(dbUser.role, minimum)) {
        log.warn(
          { userId: dbUser.id, userRole: dbUser.role, requiredRole: minimum },
          "Access denied: insufficient role",
        );
        return res.status(403).json({
          message: "Insufficient permissions",
          required: minimum,
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Convenience guard: requires admin or owner.
 * Identical behaviour to the legacy isAdmin guard in server/auth.ts but uses
 * the role hierarchy instead of a hard role === "admin" comparison.
 */
export const requireAdmin: RequestHandler = requireRole("admin");
