import { getRedis } from "./redisClient";

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const RATE_TTL_SECONDS = 10 * 60; // 10 minutes

interface OtpEntry {
  code: string;
  attempts: number;
  expiresAt: number;
}

interface RateEntry {
  count: number;
  expiresAt: number;
}

// In-memory fallback
const memoryOtpStore = new Map<string, OtpEntry>();
const memoryRateStore = new Map<string, RateEntry>();

function now(): number {
  return Date.now();
}

function isExpired(entry: { expiresAt: number }): boolean {
  return entry.expiresAt <= now();
}

function otpKey(userId: string, channel: string, phone: string): string {
  return `phone:otp:${userId}:${channel}:${phone}`;
}

function rateKey(userId: string, channel: string): string {
  // Plain integer counter (atomic INCR). Not the legacy JSON key, so old entries are simply ignored.
  return `phone:rate2:${userId}:${channel}`;
}

export async function getOtp(userId: string, channel: string, phone: string): Promise<OtpEntry | null> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(otpKey(userId, channel, phone));
    return raw ? (JSON.parse(raw) as OtpEntry) : null;
  }
  const memKey = `${userId}:${channel}:${phone}`;
  const entry = memoryOtpStore.get(memKey);
  if (!entry) return null;
  if (isExpired(entry)) {
    memoryOtpStore.delete(memKey);
    return null;
  }
  return entry;
}

export async function setOtp(userId: string, channel: string, phone: string, code: string): Promise<void> {
  const redis = getRedis();
  const key = otpKey(userId, channel, phone);
  const expiresAt = now() + OTP_TTL_SECONDS * 1000;
  if (redis) {
    await redis.set(key, JSON.stringify({ code, attempts: 0, expiresAt }), "EX", OTP_TTL_SECONDS);
  } else {
    memoryOtpStore.set(`${userId}:${channel}:${phone}`, { code, attempts: 0, expiresAt });
  }
}

export async function deleteOtp(userId: string, channel: string, phone: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(otpKey(userId, channel, phone));
  } else {
    memoryOtpStore.delete(`${userId}:${channel}:${phone}`);
  }
}

export async function incrementOtpAttempts(userId: string, channel: string, phone: string): Promise<number> {
  const redis = getRedis();
  const key = otpKey(userId, channel, phone);
  if (redis) {
    // Single atomic script: concurrent guesses cannot read the same count and each "succeed" at attempt N.
    const attempts = await redis.eval(
      "local v = redis.call('GET', KEYS[1]); if not v then return 0 end; " +
        "local e = cjson.decode(v); e.attempts = e.attempts + 1; " +
        "redis.call('SET', KEYS[1], cjson.encode(e), 'KEEPTTL'); return e.attempts",
      1,
      key,
    );
    return Number(attempts) || 0;
  }
  const memKey = `${userId}:${channel}:${phone}`;
  const entry = memoryOtpStore.get(memKey);
  if (!entry) return 0;
  if (isExpired(entry)) {
    memoryOtpStore.delete(memKey);
    return 0;
  }
  entry.attempts++;
  return entry.attempts;
}

export async function getRateCount(userId: string, channel: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(rateKey(userId, channel));
    return raw ? Number(raw) || 0 : 0;
  }
  const memKey = `${userId}:${channel}`;
  const entry = memoryRateStore.get(memKey);
  if (entry && isExpired(entry)) {
    memoryRateStore.delete(memKey);
    return 0;
  }
  return entry?.count || 0;
}

export async function incrementRateCount(userId: string, channel: string): Promise<void> {
  const redis = getRedis();
  const key = rateKey(userId, channel);
  const expiresAt = now() + RATE_TTL_SECONDS * 1000;
  if (redis) {
    // Atomic: INCR, and start the window on the first hit only.
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_TTL_SECONDS);
  } else {
    const memKey = `${userId}:${channel}`;
    const entry = memoryRateStore.get(memKey);
    if (entry && !isExpired(entry)) {
      entry.count++;
    } else {
      memoryRateStore.set(memKey, { count: 1, expiresAt });
    }
  }
}
