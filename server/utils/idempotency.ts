type CacheEntry = {
  triggerId: string;
  expiresAtMs: number;
};

/**
 * In-memory replay guard used as a low-latency fast path.
 * DB audit checks remain the durable source of truth.
 */
export class InMemoryIdempotencyGuard {
  private readonly ttlMs: number;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  private prune(nowMs: number): void {
    for (const [key, value] of this.entries.entries()) {
      if (value.expiresAtMs <= nowMs) this.entries.delete(key);
    }
  }

  private buildKey(jobName: string, idempotencyKey: string): string {
    return `${jobName}:${idempotencyKey}`;
  }

  registerOrGetReplay(jobName: string, idempotencyKey: string, triggerId: string): { replay: boolean; triggerId: string } {
    const nowMs = Date.now();
    this.prune(nowMs);

    const key = this.buildKey(jobName, idempotencyKey);
    const existing = this.entries.get(key);
    if (existing && existing.expiresAtMs > nowMs) {
      return { replay: true, triggerId: existing.triggerId };
    }

    this.entries.set(key, { triggerId, expiresAtMs: nowMs + this.ttlMs });
    return { replay: false, triggerId };
  }
}

export function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
