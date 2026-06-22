import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerPushSubscriptionRoutes } from "../pushSubscriptions";

const dbState: { rows: any[]; inserted: any[]; updated: any[]; deletedCount: number } = {
  rows: [], inserted: [], updated: [], deletedCount: 0,
};

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve(dbState.rows)),
          limit: vi.fn(() => Promise.resolve(dbState.rows.slice(0, 1))),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((v: any) => {
        dbState.inserted.push(v);
        return Promise.resolve(undefined);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((v: any) => {
        dbState.updated.push(v);
        return { where: vi.fn(() => Promise.resolve(undefined)) };
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => {
        dbState.deletedCount++;
        return Promise.resolve({ rowCount: 1 });
      }),
    })),
  },
}));

// Mock isAuthenticated to always pass
vi.mock("../../auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

function body(res: any) {
  return res.body?.data ?? res.body;
}

describe("push subscription routes", () => {
  let app: express.Express;

  beforeEach(() => {
    dbState.rows = [];
    dbState.inserted = [];
    dbState.updated = [];
    dbState.deletedCount = 0;
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    registerPushSubscriptionRoutes(app);
  });

  describe("GET /api/push/vapid-public-key", () => {
    it("returns VAPID public key from env", async () => {
      vi.stubEnv("VAPID_PUBLIC_KEY", "test-public-key");
      const res = await request(app).get("/api/push/vapid-public-key");
      expect(res.status).toBe(200);
      expect(body(res).publicKey).toBe("test-public-key");
    });

    it("returns empty string when VAPID_PUBLIC_KEY not set", async () => {
      vi.stubEnv("VAPID_PUBLIC_KEY", "");
      const res = await request(app).get("/api/push/vapid-public-key");
      expect(res.status).toBe(200);
      expect(body(res).publicKey).toBe("");
    });
  });

  describe("POST /api/push/subscribe", () => {
    const validBody = {
      endpoint: "https://fcm.googleapis.com/some-endpoint",
      keys: { p256dh: "abc123", auth: "def456" },
      deviceName: "My Browser",
    };

    it("creates a new subscription", async () => {
      dbState.rows = [];
      const res = await request(app)
        .post("/api/push/subscribe")
        .send(validBody);

      expect(res.status).toBe(201);
      expect(body(res).status).toBe("created");
      expect(dbState.inserted.length).toBe(1);
      expect(dbState.inserted[0].endpoint).toBe(validBody.endpoint);
    });

    it("updates an existing subscription", async () => {
      dbState.rows = [{ id: 1 }];
      const res = await request(app)
        .post("/api/push/subscribe")
        .send(validBody);

      expect(res.status).toBe(200);
      expect(body(res).status).toBe("updated");
      expect(dbState.updated.length).toBe(1);
    });

    it("returns 400 for invalid body", async () => {
      const res = await request(app)
        .post("/api/push/subscribe")
        .send({ endpoint: "not-a-url", keys: {} });

      expect(res.status).toBe(400);
    });

    it("stores user-agent from request headers", async () => {
      dbState.rows = [];
      await request(app)
        .post("/api/push/subscribe")
        .set("User-Agent", "Chrome/120")
        .send(validBody);

      expect(dbState.inserted[0].userAgent).toBe("Chrome/120");
    });
  });

  describe("POST /api/push/unsubscribe", () => {
    it("removes a subscription", async () => {
      const res = await request(app)
        .post("/api/push/unsubscribe")
        .send({ endpoint: "https://fcm.googleapis.com/some-endpoint" });

      expect(res.status).toBe(200);
      expect(body(res).status).toBe("deleted");
      expect(dbState.deletedCount).toBe(1);
    });

    it("returns 400 when endpoint is missing", async () => {
      const res = await request(app)
        .post("/api/push/unsubscribe")
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/push/subscriptions", () => {
    it("returns user's subscriptions", async () => {
      dbState.rows = [
        { id: 1, deviceName: "Chrome", userAgent: "Chrome/120", createdAt: new Date() },
      ];
      const res = await request(app).get("/api/push/subscriptions");

      expect(res.status).toBe(200);
      expect(body(res).subscriptions).toHaveLength(1);
      expect(body(res).subscriptions[0].deviceName).toBe("Chrome");
    });

    it("returns empty array when no subscriptions", async () => {
      dbState.rows = [];
      const res = await request(app).get("/api/push/subscriptions");

      expect(res.status).toBe(200);
      expect(body(res).subscriptions).toEqual([]);
    });
  });
});
