import { getRedis } from "./redisClient";
import { logger } from "./logger";

export interface BucketConfig { refillPerSecond: number; capacity: number; }

export const BUCKETS: Record<string, BucketConfig> = {
  resend: { refillPerSecond: 2, capacity: 10 },
  twilio: { refillPerSecond: 1, capacity: 1 },
  brevo: { refillPerSecond: 10, capacity: 20 },
  webhook: { refillPerSecond: 5, capacity: 10 },
};

const LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity end
if ts == nil then ts = now end
local delta = now - ts
if delta > 0 then
  tokens = math.min(capacity, tokens + delta * refill)
end
if tokens >= requested then
  tokens = tokens - requested
  redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
  redis.call('PEXPIRE', key, 60000)
  return 1
else
  redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
  redis.call('PEXPIRE', key, 60000)
  local need = requested - tokens
  local wait = need / refill
  return wait
end
`;

export async function acquire(bucket: string, keySuffix = "global", tokens = 1): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const cfg = BUCKETS[bucket];
  if (!cfg) return { allowed: true };
  const redis = getRedis();
  if (!redis) return { allowed: true };
  const k = `bucket:${bucket}:${keySuffix}`;
  try {
    const res = await (redis as any).eval(LUA, 1, k, cfg.capacity, cfg.refillPerSecond, Date.now()/1000, tokens);
    if (res === 1) return { allowed: true };
    const waitSec = typeof res === 'number' ? res : 1;
    return { allowed: false, retryAfterMs: Math.ceil(waitSec * 1000) };
  } catch (e) {
    logger.warn({ err: e, bucket }, "[TokenBucket] eval failed, allowing");
    return { allowed: true };
  }
}

export async function waitForBucket(bucket: string, keySuffix = "global", tokens = 1, maxWaitMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { allowed, retryAfterMs } = await acquire(bucket, keySuffix, tokens);
    if (allowed) return;
    await new Promise(r => setTimeout(r, Math.min(retryAfterMs ?? 200, 500)));
  }
}
