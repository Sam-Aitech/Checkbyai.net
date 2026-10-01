import { getRedis } from "./redisClient";

/**
 * Failed-attempt counter for email OTP verification, keyed per account (not per IP), so a
 * distributed guesser cannot exceed MAX attempts against one code. Atomic INCR in Redis;
 * process-local fallback when Redis is unavailable.
 */

const WINDOW_SECONDS = 10 * 60; // matches the OTP lifetime

interface Entry {
  count: number;
  expiresAt: number;
}

const memory = new Map<string, Entry>();

function redisKey(key: string): string {
  return `otp:attempts:${key}`;
}

export async function recordFailedAttempt(key: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const k = redisKey(key);
    const count = await redis.incr(k);
    if (count === 1) await redis.expire(k, WINDOW_SECONDS);
    return count;
  }
  const now = Date.now();
  const existing = memory.get(key);
  if (!existing || existing.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export async function getFailedAttempts(key: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(redisKey(key));
    return raw ? Number(raw) || 0 : 0;
  }
  const existing = memory.get(key);
  if (!existing || existing.expiresAt <= Date.now()) {
    memory.delete(key);
    return 0;
  }
  return existing.count;
}

export async function resetAttempts(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(redisKey(key));
    return;
  }
  memory.delete(key);
}

/** Test helper. */
export function __clearOtpAttemptsForTests(): void {
  memory.clear();
}
