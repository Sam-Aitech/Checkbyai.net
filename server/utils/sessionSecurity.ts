import type { CookieOptions, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "./logger";

/**
 * Session lifecycle hardening.
 *
 * - The session id is regenerated BEFORE the identity is attached on every
 *   authentication-state transition (login, signup, OTP verify, OAuth callback,
 *   privilege elevation), so an id planted before authentication never becomes an
 *   authenticated session. This does not depend on passport's default behaviour.
 * - Logout destroys the server-side session and clears the cookie with the same attributes.
 */

/** Name is shared with the Socket.IO gateway, which reads this cookie. */
export const SESSION_COOKIE_NAME = "connect.sid";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/", // host-only: no Domain attribute, so subdomains never receive the cookie
    maxAge: SESSION_TTL_MS,
  };
}

function regenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function login(req: Request, user: Express.User): Promise<void> {
  return new Promise((resolve, reject) => {
    // keepSessionInfo is irrelevant here: the session was regenerated just above and is empty.
    req.login(user, { session: true, keepSessionInfo: true }, (err: unknown) => (err ? reject(err) : resolve()));
  });
}

function save(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

/** Rotate the session id, then attach the authenticated identity to the fresh session. */
export async function establishAuthenticatedSession(req: Request, user: Express.User): Promise<void> {
  await regenerate(req);
  await login(req, user);
  await save(req);
}

/** Logout: drop the identity, destroy the stored session and expire the cookie. */
export async function endSession(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.logout((err: unknown) => (err ? reject(err) : resolve()));
  });
  await new Promise<void>((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
}

/**
 * Revoke every stored session of a user except the current one. Used on privilege elevation
 * (admin login) so a session opened before elevation cannot ride along.
 */
export async function revokeOtherSessions(userId: string, keepSessionId: string | undefined): Promise<void> {
  try {
    await db.execute(
      sql`DELETE FROM sessions WHERE sess->>'passport' IS NOT NULL
          AND (sess->'passport'->>'user' = ${userId} OR sess->'passport'->'user'->>'id' = ${userId})
          AND sid <> ${keepSessionId ?? ""}`,
    );
  } catch (err) {
    // Non-fatal for the login itself; the failure is visible to operators.
    logger.warn({ err }, "[Auth] Could not revoke prior sessions after privilege elevation");
  }
}
