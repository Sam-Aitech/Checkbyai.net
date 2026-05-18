import { getRedis } from "./redisClient";

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const RATE_TTL_SECONDS = 10 * 60; // 10 minutes

interface OtpEntry {
  code: string;
  attempts: number;
}

interface RateEntry {
  count: number;
}

// In-memory fallback
const memoryOtpStore = new Map<string, OtpEntry>();
const memoryRateStore = new Map<string, RateEntry>();

function otpKey(userId: string, channel: string, phone: string): string {
  return `phone:otp:${userId}:${channel}:${phone}`;
}

function rateKey(userId: string, channel: string): string {
  return `phone:rate:${userId}:${channel}`;
}

export async function getOtp(userId: string, channel: string, phone: string): Promise<OtpEntry | null> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(otpKey(userId, channel, phone));
    return raw ? (JSON.parse(raw) as OtpEntry) : null;
  }
  return memoryOtpStore.get(`${userId}:${channel}:${phone}`) || null;
}

export async function setOtp(userId: string, channel: string, phone: string, code: string): Promise<void> {
  const redis = getRedis();
  const key = otpKey(userId, channel, phone);
  if (redis) {
    await redis.set(key, JSON.stringify({ code, attempts: 0 }), "EX", OTP_TTL_SECONDS);
  } else {
    memoryOtpStore.set(`${userId}:${channel}:${phone}`, { code, attempts: 0 });
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
    const raw = await redis.get(key);
    if (!raw) return 0;
    const entry = JSON.parse(raw) as OtpEntry;
    entry.attempts++;
    await redis.set(key, JSON.stringify(entry), "KEEPTTL");
    return entry.attempts;
  }
  const memKey = `${userId}:${channel}:${phone}`;
  const entry = memoryOtpStore.get(memKey);
  if (!entry) return 0;
  entry.attempts++;
  return entry.attempts;
}

export async function getRateCount(userId: string, channel: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(rateKey(userId, channel));
    if (!raw) return 0;
    return (JSON.parse(raw) as RateEntry).count;
  }
  const entry = memoryRateStore.get(`${userId}:${channel}`);
  return entry?.count || 0;
}

export async function incrementRateCount(userId: string, channel: string): Promise<void> {
  const redis = getRedis();
  const key = rateKey(userId, channel);
  if (redis) {
    const raw = await redis.get(key);
    if (raw) {
      const entry = JSON.parse(raw) as RateEntry;
      entry.count++;
      await redis.set(key, JSON.stringify(entry), "KEEPTTL");
    } else {
      await redis.set(key, JSON.stringify({ count: 1 }), "EX", RATE_TTL_SECONDS);
    }
  } else {
    const memKey = `${userId}:${channel}`;
    const entry = memoryRateStore.get(memKey);
    if (entry) {
      entry.count++;
    } else {
      memoryRateStore.set(memKey, { count: 1 });
    }
  }
}
