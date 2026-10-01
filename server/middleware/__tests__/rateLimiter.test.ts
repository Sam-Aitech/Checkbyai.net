import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import type { Store } from "express-rate-limit";
import { createLimiter, otpEmailLimiter } from "../rateLimiter";
import { emailRateKey, userOrIpKey } from "../../utils/rateLimitKeys";
import { getTrustProxyHops } from "../../utils/trustProxy";

/** Deterministic store: the test owns the clock, so windows are advanced explicitly. */
class ClockStore implements Store {
  now = 0;
  private windowMs = 0;
  private hits = new Map<string, { count: number; resetAt: number }>();
  init(options: { windowMs: number }) {
    this.windowMs = options.windowMs;
  }
  increment(key: string) {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= this.now) {
      const fresh = { count: 1, resetAt: this.now + this.windowMs };
      this.hits.set(key, fresh);
      return { totalHits: 1, resetTime: new Date(fresh.resetAt) };
    }
    entry.count += 1;
    return { totalHits: entry.count, resetTime: new Date(entry.resetAt) };
  }
  decrement(key: string) {
    const e = this.hits.get(key);
    if (e) e.count -= 1;
  }
  resetKey(key: string) {
    this.hits.delete(key);
  }
  keys() {
    return [...this.hits.keys()];
  }
}

function appWith(limiter: express.RequestHandler, trustProxy: number | boolean = false) {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.use(express.json());
  app.post("/x", limiter, (_req, res) => res.json({ ok: true }));
  app.post("/alias/x", limiter, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createLimiter", () => {
  it("allows up to max, then answers 429 with the uniform body and RateLimit headers", async () => {
    const store = new ClockStore();
    const app = appWith(createLimiter({ prefix: "t:", windowMs: 1000, max: 3, message: "slow down", store }));
    for (let i = 0; i < 3; i++) expect((await request(app).post("/x")).status).toBe(200);
    const blocked = await request(app).post("/x");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ message: "slow down" });
    expect(blocked.headers["ratelimit"] ?? blocked.headers["ratelimit-policy"]).toBeDefined();
    expect(blocked.headers["x-ratelimit-limit"]).toBeUndefined(); // legacy headers off
  });

  it("opens a fresh window once the clock passes the window length", async () => {
    const store = new ClockStore();
    const app = appWith(createLimiter({ prefix: "t:", windowMs: 1000, max: 1, message: "m", store }));
    expect((await request(app).post("/x")).status).toBe(200);
    expect((await request(app).post("/x")).status).toBe(429);
    store.now += 999;
    expect((await request(app).post("/x")).status).toBe(429);
    store.now += 2;
    expect((await request(app).post("/x")).status).toBe(200);
  });

  it("route aliases behind the same limiter share one budget", async () => {
    const store = new ClockStore();
    const app = appWith(createLimiter({ prefix: "t:", windowMs: 1000, max: 2, message: "m", store }));
    expect((await request(app).post("/x")).status).toBe(200);
    expect((await request(app).post("/alias/x")).status).toBe(200);
    expect((await request(app).post("/x")).status).toBe(429);
  });

  it("a signed-in user keeps one budget however their IP rotates", async () => {
    const store = new ClockStore();
    const limiter = createLimiter({ prefix: "t:", windowMs: 1000, max: 2, message: "m", store, keyGenerator: userOrIpKey });
    const app = express();
    app.set("trust proxy", 1);
    app.use((req: any, _res, next) => { req.user = { id: "user-1" }; next(); });
    app.post("/x", limiter, (_req, res) => res.json({ ok: true }));
    expect((await request(app).post("/x").set("X-Forwarded-For", "1.1.1.1")).status).toBe(200);
    expect((await request(app).post("/x").set("X-Forwarded-For", "2.2.2.2")).status).toBe(200);
    expect((await request(app).post("/x").set("X-Forwarded-For", "3.3.3.3")).status).toBe(429);
    expect(store.keys()).toEqual(["u:user-1"]);
  });
});

describe("proxy-aware client IP", () => {
  it("a spoofed X-Forwarded-For prefix does not rotate the bucket behind one trusted proxy", async () => {
    const store = new ClockStore();
    const app = appWith(createLimiter({ prefix: "t:", windowMs: 1000, max: 2, message: "m", store }), 1);
    // The trusted proxy appends the address it actually saw (9.9.9.9); everything before is client-supplied.
    expect((await request(app).post("/x").set("X-Forwarded-For", "1.1.1.1, 9.9.9.9")).status).toBe(200);
    expect((await request(app).post("/x").set("X-Forwarded-For", "2.2.2.2, 9.9.9.9")).status).toBe(200);
    expect((await request(app).post("/x").set("X-Forwarded-For", "3.3.3.3, 9.9.9.9")).status).toBe(429);
    expect(store.keys()).toHaveLength(1);
  });

  it("different real clients still get separate budgets", async () => {
    const store = new ClockStore();
    const app = appWith(createLimiter({ prefix: "t:", windowMs: 1000, max: 1, message: "m", store }), 1);
    expect((await request(app).post("/x").set("X-Forwarded-For", "9.9.9.9")).status).toBe(200);
    expect((await request(app).post("/x").set("X-Forwarded-For", "8.8.8.8")).status).toBe(200);
  });

  it("an IPv6 client cannot rotate within its /56", async () => {
    const store = new ClockStore();
    const app = appWith(createLimiter({ prefix: "t:", windowMs: 1000, max: 1, message: "m", store }), 1);
    expect((await request(app).post("/x").set("X-Forwarded-For", "2001:db8:abcd:1200::1")).status).toBe(200);
    expect((await request(app).post("/x").set("X-Forwarded-For", "2001:db8:abcd:1200::ffff")).status).toBe(429);
  });
});

describe("emailRateKey", () => {
  it.each([
    ["Victim@Example.com", "victim@example.com"],
    ["  victim@example.com  ", "victim@example.com"],
    ["VICTIM+spam1@example.com", "victim@example.com"],
    ["victim+a+b@example.com", "victim@example.com"],
    ["v.i.c.t.i.m@gmail.com", "victim@gmail.com"],
    ["victim+x@googlemail.com", "victim@gmail.com"],
    ["ｖictim@example.com", "victim@example.com"], // full-width letter, NFKC-folded
  ])("%s -> %s", (input, expected) => {
    expect(emailRateKey(input)).toBe(expected);
  });

  it("keeps genuinely different mailboxes apart (dots matter outside Gmail)", () => {
    expect(emailRateKey("a.b@example.com")).not.toBe(emailRateKey("ab@example.com"));
    expect(emailRateKey("alice@example.com")).not.toBe(emailRateKey("bob@example.com"));
  });

  it("tolerates non-strings", () => {
    expect(emailRateKey(undefined)).toBe("");
    expect(emailRateKey({})).toBe("");
  });
});

describe("otpEmailLimiter (real instance)", () => {
  it("alias spellings of one mailbox share a single budget of 5 codes", async () => {
    const app = appWith(otpEmailLimiter);
    const spellings = ["Target@Example.com", "target@example.com", " TARGET@example.com", "target+1@example.com", "target+2@example.com"];
    for (const email of spellings) expect((await request(app).post("/x").send({ email })).status).toBe(200);
    const sixth = await request(app).post("/x").send({ email: "target+3@example.com" });
    expect(sixth.status).toBe(429);
    // an unrelated address is unaffected
    expect((await request(app).post("/x").send({ email: "someone-else@example.com" })).status).toBe(200);
  });
});

describe("getTrustProxyHops", () => {
  it("defaults to 1 and accepts a configured topology", () => {
    expect(getTrustProxyHops({} as NodeJS.ProcessEnv)).toBe(1);
    expect(getTrustProxyHops({ TRUST_PROXY_HOPS: "2" } as unknown as NodeJS.ProcessEnv)).toBe(2);
    expect(getTrustProxyHops({ TRUST_PROXY_HOPS: "0" } as unknown as NodeJS.ProcessEnv)).toBe(0);
  });
  it.each(["-1", "abc", "1.5", "99", "true"])("rejects %s", (v) => {
    expect(() => getTrustProxyHops({ TRUST_PROXY_HOPS: v } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
});
