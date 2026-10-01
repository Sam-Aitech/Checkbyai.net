import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";

const h = vi.hoisted(() => ({
  users: [] as any[],
  emails: [] as Array<{ to: string; code: string }>,
  executed: [] as any[],
}));

vi.mock("../db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 1 }] }) }) }),
    insert: () => ({ values: async () => undefined }),
    execute: async (q: unknown) => {
      h.executed.push(q);
    },
  },
}));
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));
// Pass-through limiters: abuse controls have their own tests; here the flow itself is under test.
vi.mock("../middleware/rateLimiter", () => ({
  otpLimiter: (_q: any, _s: any, n: any) => n(),
  otpEmailLimiter: (_q: any, _s: any, n: any) => n(),
  otpVerifyEmailLimiter: (_q: any, _s: any, n: any) => n(),
  adminOtpLimiter: (_q: any, _s: any, n: any) => n(),
  adminOtpEmailLimiter: (_q: any, _s: any, n: any) => n(),
  authLimiter: (_q: any, _s: any, n: any) => n(),
  authAccountLimiter: (_q: any, _s: any, n: any) => n(),
}));
vi.mock("../services/monitoringService", () => ({ recordRegistrationAttempt: vi.fn() }));
vi.mock("../storage", () => ({
  storage: {
    getUser: async (id: string) => h.users.find((u) => u.id === id),
    getUserByEmail: async (email: string) => h.users.find((u) => u.email === email),
    getUserByGoogleId: async () => undefined,
    upsertUser: async (data: any) => {
      const existing = h.users.find((u) => u.id === data.id);
      if (existing) {
        Object.assign(existing, data);
        return existing;
      }
      const user = { role: "user", isVerified: false, verificationCode: null, codeExpiry: null, hashedPassword: null, ...data };
      h.users.push(user);
      return user;
    },
    updateUserVerificationCode: async (identifier: string, code: string, expiry: Date) => {
      const u = h.users.find((x) => x.email === identifier);
      if (u) {
        u.verificationCode = code;
        u.codeExpiry = expiry;
      }
    },
    verifyUser: async (identifier: string) => {
      const u = h.users.find((x) => x.email === identifier);
      if (u) Object.assign(u, { isVerified: true, verificationCode: null, codeExpiry: null });
      return u;
    },
  },
}));

const ADMIN = "admin@example.com";

async function buildApp() {
  const { setupAuth, isAuthenticated } = await import("../auth");
  const { registerAuthRoutes } = await import("../routes/auth");
  const { errorHandler } = await import("../lib/errorHandler");
  const store = new session.MemoryStore();
  const app = express();
  app.use(express.json());
  await setupAuth(app, { sessionStore: store });
  registerAuthRoutes(app);
  // Test-only helpers: plant a pre-authentication session, and a protected resource.
  app.get("/__seed", (req: any, res) => {
    req.session.planted = true;
    res.json({ ok: true });
  });
  app.get("/__me", rateLimit({ windowMs: 60_000, limit: 10_000, validate: false }), isAuthenticated, (req: any, res) => res.json({ id: req.user.id }));
  app.use(errorHandler);
  return { app, store };
}

function cookieOf(res: request.Response): string | undefined {
  const raw = ([] as string[]).concat((res.headers["set-cookie"] as unknown as string[]) ?? []).find((c) => c.startsWith("connect.sid="));
  return raw?.split(";")[0];
}
function rawSetCookie(res: request.Response): string {
  return ([] as string[]).concat((res.headers["set-cookie"] as unknown as string[]) ?? []).find((c) => c.startsWith("connect.sid=")) ?? "";
}

async function sendCode(app: express.Express, path: string, email: string) {
  const before = h.emails.length;
  const res = await request(app).post(path).send({ email });
  return { res, emailed: h.emails.length > before ? h.emails[h.emails.length - 1] : undefined };
}

beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", "x".repeat(48));
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("ADMIN_EMAIL", ADMIN);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      const code = /(\d{6})\s*<\/div>/.exec(body.html)?.[1] ?? "";
      h.emails.push({ to: body.to[0], code });
      return { ok: true, text: async () => "" };
    }),
  );
});

beforeEach(async () => {
  h.users = [
    { id: "u-existing", email: "known@example.com", role: "user", isVerified: true, verificationCode: null, codeExpiry: null, hashedPassword: await bcrypt.hash("correct horse", 4) },
    { id: "admin-1", email: ADMIN, role: "admin", isVerified: true, verificationCode: null, codeExpiry: null, hashedPassword: null },
  ];
  h.emails = [];
  h.executed = [];
  const { __clearOtpAttemptsForTests } = await import("../utils/otpAttemptStore");
  __clearOtpAttemptsForTests();
});

describe("email OTP: no account enumeration", () => {
  it("send-otp answers identically for an existing and a never-seen address, and emails both", async () => {
    const { app } = await buildApp();
    const known = await sendCode(app, "/api/auth/email/send-otp", "known@example.com");
    const unknown = await sendCode(app, "/api/auth/email/send-otp", "nobody@example.com");
    expect(known.res.status).toBe(200);
    expect(unknown.res.status).toBe(known.res.status);
    expect(unknown.res.body).toEqual(known.res.body);
    expect(known.emailed?.code).toMatch(/^\d{6}$/);
    expect(unknown.emailed?.code).toMatch(/^\d{6}$/); // same side effects on both paths
  });

  it("verify-otp returns one identical failure for unknown account, wrong code and expired code", async () => {
    const { app } = await buildApp();
    const { emailed } = await sendCode(app, "/api/auth/email/send-otp", "known@example.com");
    const wrong = await request(app).post("/api/auth/email/verify-otp").send({ email: "known@example.com", code: emailed!.code === "000000" ? "111111" : "000000" });
    const unknown = await request(app).post("/api/auth/email/verify-otp").send({ email: "ghost@example.com", code: "123456" });

    h.users.find((u) => u.email === "known@example.com").codeExpiry = new Date(Date.now() - 1000);
    const expired = await request(app).post("/api/auth/email/verify-otp").send({ email: "known@example.com", code: emailed!.code });

    for (const r of [wrong, unknown, expired]) {
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ message: "Invalid or expired verification code" });
    }
  });

  it("admin send-otp and verify-otp do not reveal whether an address is the admin address", async () => {
    const { app } = await buildApp();
    const forAdmin = await sendCode(app, "/api/auth/admin/send-otp", ADMIN);
    const forOther = await sendCode(app, "/api/auth/admin/send-otp", "someone@example.com");
    expect(forOther.res.status).toBe(forAdmin.res.status);
    expect(forOther.res.body).toEqual(forAdmin.res.body);
    expect(forOther.emailed).toBeUndefined(); // and nothing is mailed to non-admin addresses

    const wrongForAdmin = await request(app).post("/api/auth/admin/verify-otp").send({ email: ADMIN, code: "000000" });
    const forNonAdmin = await request(app).post("/api/auth/admin/verify-otp").send({ email: "someone@example.com", code: "000000" });
    expect(forNonAdmin.status).toBe(wrongForAdmin.status);
    expect(forNonAdmin.body).toEqual(wrongForAdmin.body);
  });
});

describe("email OTP: code handling", () => {
  it("stores only a keyed hash, never the code", async () => {
    const { app } = await buildApp();
    const { emailed } = await sendCode(app, "/api/auth/email/send-otp", "known@example.com");
    const stored = h.users.find((u) => u.email === "known@example.com").verificationCode as string;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain(emailed!.code);
  });

  it("accepts the right code once and the code is then spent", async () => {
    const { app } = await buildApp();
    const { emailed } = await sendCode(app, "/api/auth/email/send-otp", "known@example.com");
    const ok = await request(app).post("/api/auth/email/verify-otp").send({ email: "known@example.com", code: emailed!.code });
    expect(ok.status).toBe(200);
    const replay = await request(app).post("/api/auth/email/verify-otp").send({ email: "known@example.com", code: emailed!.code });
    expect(replay.status).toBe(400);
  });

  it("locks the code after 5 wrong guesses, even for the correct code, until a new code is issued", async () => {
    const { app } = await buildApp();
    const { emailed } = await sendCode(app, "/api/auth/email/send-otp", "known@example.com");
    const wrong = emailed!.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post("/api/auth/email/verify-otp").send({ email: "known@example.com", code: wrong });
      expect(r.status).toBe(400);
    }
    const locked = await request(app).post("/api/auth/email/verify-otp").send({ email: "known@example.com", code: emailed!.code });
    expect(locked.status).toBe(400);

    const fresh = await sendCode(app, "/api/auth/email/send-otp", "known@example.com");
    const ok = await request(app).post("/api/auth/email/verify-otp").send({ email: "known@example.com", code: fresh.emailed!.code });
    expect(ok.status).toBe(200);
  });

  it("applies the attempt cap to unknown addresses the same way (no signal from lockout)", async () => {
    const { app } = await buildApp();
    const results: number[] = [];
    for (let i = 0; i < 8; i++) {
      results.push((await request(app).post("/api/auth/email/verify-otp").send({ email: "ghost@example.com", code: "123456" })).status);
    }
    expect(new Set(results)).toEqual(new Set([400]));
  });

  it("a code issued for the user flow does not work on the admin flow, and vice versa", async () => {
    const { app } = await buildApp();
    const userSend = await sendCode(app, "/api/auth/email/send-otp", ADMIN);
    const crossed = await request(app).post("/api/auth/admin/verify-otp").send({ email: ADMIN, code: userSend.emailed!.code });
    expect(crossed.status).toBe(400);

    const adminSend = await sendCode(app, "/api/auth/admin/send-otp", ADMIN);
    await new Promise((r) => setImmediate(r)); // background dispatch
    const code = adminSend.emailed?.code ?? h.emails[h.emails.length - 1].code;
    const crossed2 = await request(app).post("/api/auth/email/verify-otp").send({ email: ADMIN, code });
    expect(crossed2.status).toBe(400);
  });
});

describe("OTP generator", () => {
  it("produces 6 digits over the whole space, keeping leading zeros", async () => {
    const crypto = await import("node:crypto");
    const { generateOtpCode } = await import("../services/emailOtp");
    const spy = vi.spyOn(crypto.default, "randomInt").mockReturnValueOnce(42 as any);
    expect(generateOtpCode()).toBe("000042");
    spy.mockRestore();
    for (let i = 0; i < 50; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });
});

describe("session fixation", () => {
  it("a session id planted before login is not the authenticated session id", async () => {
    const { app, store } = await buildApp();
    const planted = await request(app).get("/__seed");
    const preLoginCookie = cookieOf(planted)!;
    expect(preLoginCookie).toBeTruthy();

    const { emailed } = await sendCode(app, "/api/auth/email/send-otp", "known@example.com");
    const login = await request(app).post("/api/auth/email/verify-otp").set("Cookie", preLoginCookie).send({ email: "known@example.com", code: emailed!.code });
    expect(login.status).toBe(200);
    const postLoginCookie = cookieOf(login)!;
    expect(postLoginCookie).toBeTruthy();
    expect(postLoginCookie).not.toBe(preLoginCookie);

    // The attacker, still holding the planted id, is not authenticated; the victim's new id is.
    expect((await request(app).get("/__me").set("Cookie", preLoginCookie)).status).toBe(401);
    expect((await request(app).get("/__me").set("Cookie", postLoginCookie)).status).toBe(200);

    const stale = decodeURIComponent(preLoginCookie.split("=")[1]).slice(2).split(".")[0];
    const stored = await new Promise<any>((resolve) => store.get(stale, (_e, s) => resolve(s)));
    expect(stored).toBeFalsy(); // the old session no longer exists server-side
  });

  it("rotates the id on password login and on registration", async () => {
    const { app } = await buildApp();
    const planted = await request(app).get("/__seed");
    const pre = cookieOf(planted)!;
    const login = await request(app).post("/api/auth/login").set("Cookie", pre).send({ email: "known@example.com", password: "correct horse" });
    expect(login.status).toBe(200);
    expect(cookieOf(login)).not.toBe(pre);
    expect((await request(app).get("/__me").set("Cookie", pre)).status).toBe(401);

    const planted2 = await request(app).get("/__seed");
    const pre2 = cookieOf(planted2)!;
    const reg = await request(app).post("/api/auth/register").set("Cookie", pre2).send({ email: "new@example.com", password: "a-long-password" });
    expect(reg.status).toBe(201);
    expect(cookieOf(reg)).not.toBe(pre2);
    expect((await request(app).get("/__me").set("Cookie", pre2)).status).toBe(401);
  });

  it("rotates on admin elevation and revokes other sessions of that account", async () => {
    const { app } = await buildApp();
    const planted = await request(app).get("/__seed");
    const pre = cookieOf(planted)!;
    await request(app).post("/api/auth/admin/send-otp").send({ email: ADMIN });
    await new Promise((r) => setImmediate(r));
    const code = h.emails[h.emails.length - 1].code;
    const login = await request(app).post("/api/auth/admin/verify-otp").set("Cookie", pre).send({ email: ADMIN, code });
    expect(login.status).toBe(200);
    expect(cookieOf(login)).not.toBe(pre);
    expect(h.executed.length).toBe(1); // prior sessions for the account were revoked
  });

  it("logout destroys the server-side session and expires the cookie", async () => {
    const { app } = await buildApp();
    const { emailed } = await sendCode(app, "/api/auth/email/send-otp", "known@example.com");
    const login = await request(app).post("/api/auth/email/verify-otp").send({ email: "known@example.com", code: emailed!.code });
    const cookie = cookieOf(login)!;
    expect((await request(app).get("/__me").set("Cookie", cookie)).status).toBe(200);

    const out = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(200);
    expect(rawSetCookie(out)).toMatch(/connect\.sid=;/);
    expect(rawSetCookie(out)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await request(app).get("/__me").set("Cookie", cookie)).status).toBe(401); // old id is dead
  });
});

describe("session cookie attributes", () => {
  it("is HttpOnly, SameSite=Lax, path-scoped and host-only", async () => {
    const { app } = await buildApp();
    const res = await request(app).get("/__seed");
    const c = rawSetCookie(res);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\//);
    expect(c).not.toMatch(/Domain=/i);
    expect(c).not.toMatch(/Secure/i); // non-production, plain http
  });

  it("is Secure in production behind a TLS-terminating proxy, and never puts the id in a URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const { app } = await buildApp();
      const res = await request(app).get("/__seed").set("X-Forwarded-Proto", "https");
      expect(rawSetCookie(res)).toMatch(/Secure/i);
      expect(JSON.stringify(res.body)).not.toMatch(/connect\.sid|sessionID/);
      expect(res.headers.location).toBeUndefined();
    } finally {
      vi.stubEnv("NODE_ENV", "test");
    }
  });
});

describe("user payloads never carry credential material", () => {
  it("login and /api/auth/user omit hashedPassword and verificationCode", async () => {
    const { app } = await buildApp();
    h.users[0].verificationCode = "a".repeat(64);
    const login = await request(app).post("/api/auth/login").send({ email: "known@example.com", password: "correct horse" });
    const body = JSON.stringify(login.body);
    expect(body).not.toContain("hashedPassword");
    expect(body).not.toContain("verificationCode");
    expect(body).not.toContain("$2b$");
    const me = await request(app).get("/api/auth/user").set("Cookie", cookieOf(login)!);
    expect(me.status).toBe(200);
    const meBody = JSON.stringify(me.body);
    expect(meBody).not.toContain("hashedPassword");
    expect(meBody).not.toContain("verificationCode");
  });

  it("password login fails identically for unknown account and wrong password", async () => {
    const { app } = await buildApp();
    const unknown = await request(app).post("/api/auth/login").send({ email: "ghost@example.com", password: "whatever-long" });
    const wrong = await request(app).post("/api/auth/login").send({ email: "known@example.com", password: "wrong-password" });
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body).toEqual(wrong.body);
  });
});
