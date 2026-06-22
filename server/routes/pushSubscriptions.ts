import type { Express } from "express";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { pushSubscriptions } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { success } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";
import { ApiError } from "../lib/apiError";
import { logger } from "../utils/logger";

const log = logger.child({ module: "PushRoutes" });

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  deviceName: z.string().max(100).optional(),
});

export function registerPushSubscriptionRoutes(app: Express): void {

  // Public endpoint: return VAPID public key for clients to subscribe
  app.get("/api/push/vapid-public-key",
    asyncHandler(async (_req, res) => {
      const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
      success(res, { publicKey });
    }),
  );

  // Auth required: list user's push subscriptions
  app.get("/api/push/subscriptions",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.id;
      const subs = await db
        .select({
          id: pushSubscriptions.id,
          endpoint: pushSubscriptions.endpoint,
          deviceName: pushSubscriptions.deviceName,
          userAgent: pushSubscriptions.userAgent,
          createdAt: pushSubscriptions.createdAt,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))
        .orderBy(desc(pushSubscriptions.createdAt));

      success(res, { subscriptions: subs });
    }),
  );

  // Auth required: save a new push subscription
  app.post("/api/push/subscribe",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.id;
      const parsed = subscribeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, "Invalid subscription data: " + parsed.error.message);
      }

      const { endpoint, keys, deviceName } = parsed.data;

      // Upsert: same (user_id, endpoint) updates keys; otherwise insert
      const existing = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, userId),
            eq(pushSubscriptions.endpoint, endpoint),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pushSubscriptions)
          .set({
            p256dh: keys.p256dh,
            auth: keys.auth,
            deviceName: deviceName ?? null,
            userAgent: req.headers["user-agent"] ?? null,
            updatedAt: new Date(),
          })
          .where(eq(pushSubscriptions.id, existing[0].id));

        log.info({ userId, endpoint: endpoint.substring(0, 30) }, "Push subscription updated");
        success(res, { status: "updated" });
        return;
      }

      await db.insert(pushSubscriptions).values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        deviceName: deviceName ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      log.info({ userId, endpoint: endpoint.substring(0, 30) }, "Push subscription created");
      success(res, { status: "created" }, 201);
    }),
  );

  // Auth required: remove a push subscription
  app.post("/api/push/unsubscribe",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.id;
      const { endpoint } = req.body;

      if (!endpoint || typeof endpoint !== "string") {
        throw new ApiError(400, "endpoint is required");
      }

      const result = await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, userId),
            eq(pushSubscriptions.endpoint, endpoint),
          ),
        );

      const deleted = result?.rowCount ?? 0;
      log.info({ userId, deleted, endpoint: endpoint.substring(0, 30) }, "Push subscription removed");
      success(res, { status: deleted > 0 ? "deleted" : "not_found" });
    }),
  );
}
