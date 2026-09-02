import crypto from "node:crypto";
import { getRedis } from "./redisClient";

export function buildIdempotencyKey(userId: string, changeId: number | string, channel: string, snapshotDate: string): string {
  return crypto.createHash("sha256").update(`${userId}:${changeId}:${channel}:${snapshotDate}`).digest("hex");
}

export async function claimIdempotency(key: string, ttlSec = 86400): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const res = await (redis as any).set(`idem:notif:${key}`, "1", "EX", ttlSec, "NX");
    return res === "OK";
  } catch { return true; }
}
