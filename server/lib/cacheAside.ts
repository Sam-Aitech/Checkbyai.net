import { cacheGet, cacheSet } from "../utils/redisClient";

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  const data = await fetcher();

  await cacheSet(key, data, ttlSeconds);

  return data;
}

const invalidated = new Set<string>();

export function markStale(key: string): void {
  invalidated.add(key);
}

export async function withCacheAndStale<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  if (invalidated.has(key)) {
    invalidated.delete(key);
    const data = await fetcher();
    await cacheSet(key, data, ttlSeconds);
    return data;
  }

  return withCache(key, ttlSeconds, fetcher);
}
