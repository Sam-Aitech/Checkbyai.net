import crypto from "node:crypto";
import { getRedis } from "./redisClient";

export function buildIdempotencyKey(userId: string, changeId: number | string, channel: string, snapshotDate: string): string {
  return crypto.createHash("sha256").update(`${userId}:${changeId}:${channel}:${snapshotDate}`).digest("hex");
}

/**
 * Atomically claims an idempotency key via Redis `SET NX` — a single round
 * trip that either wins the claim or doesn't, unlike a separate GET-then-SET
 * (which has a window between the check and the write where two concurrent
 * callers can both pass the check and both proceed to send).
 *
 * Returns true when the caller may proceed (key newly claimed, or Redis is
 * unavailable — this fails open rather than blocking sends on a Redis
 * outage), false when another caller already claimed this key.
 */
export async function claimIdempotency(key: string, ttlSec = 86400): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const res = await redis.set(`idem:notif:${key}`, "1", "EX", ttlSec, "NX");
    return res === "OK";
  } catch { return true; }
}

/**
 * Releases a claim taken by claimIdempotency(), for use when the send that
 * claim was guarding ultimately failed. Without this, a claim (TTL'd for 24h
 * to dedupe genuine re-deliveries) would also block a legitimate retry of a
 * failed send for the rest of that window — best-effort, a failure here just
 * means the claim expires on its own TTL instead.
 */
export async function releaseIdempotency(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`idem:notif:${key}`);
  } catch { /* claim expires on its own TTL */ }
}
