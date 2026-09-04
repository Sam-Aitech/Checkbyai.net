import { monitorEventLoopDelay } from "perf_hooks";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

const MAX_SAMPLES = 2048;

class Reservoir {
  private samples: number[] = [];

  add(valueMs: number): void {
    if (!Number.isFinite(valueMs) || valueMs < 0) return;
    if (this.samples.length >= MAX_SAMPLES) {
      this.samples.splice(0, Math.floor(MAX_SAMPLES / 4));
    }
    this.samples.push(valueMs);
  }

  snapshot(): { count: number; p50: number; p95: number; p99: number; max: number } {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const at = (p: number) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]);
    return {
      count: sorted.length,
      p50: round(at(0.5)),
      p95: round(at(0.95)),
      p99: round(at(0.99)),
      max: round(sorted.length === 0 ? 0 : sorted[sorted.length - 1]),
    };
  }

  reset(): void {
    this.samples = [];
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const requestBuckets = new Map<string, Reservoir>();
const queueWaitBuckets = new Map<string, Reservoir>();
const queueServiceBuckets = new Map<string, Reservoir>();
const rumBuckets = new Map<string, Reservoir>();

let maxHeapUsed = 0;

const loopHistogram = monitorEventLoopDelay({ resolution: 10 });
loopHistogram.enable();

export function perfMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const rawRoute: unknown = (req as { route?: { path?: unknown } }).route?.path;
    const route = typeof rawRoute === "string" && rawRoute.length > 0 ? rawRoute : req.path || "unknown";
    const key = `${req.method} ${route}`;
    let bucket = requestBuckets.get(key);
    if (!bucket) {
      bucket = new Reservoir();
      requestBuckets.set(key, bucket);
    }
    bucket.add(durationMs);
    const heapUsed = process.memoryUsage().heapUsed;
    if (heapUsed > maxHeapUsed) maxHeapUsed = heapUsed;
  });
  next();
}

export function recordQueueTiming(queueName: string, waitMs: number, serviceMs: number): void {
  let wait = queueWaitBuckets.get(queueName);
  if (!wait) {
    wait = new Reservoir();
    queueWaitBuckets.set(queueName, wait);
  }
  wait.add(waitMs);
  let service = queueServiceBuckets.get(queueName);
  if (!service) {
    service = new Reservoir();
    queueServiceBuckets.set(queueName, service);
  }
  service.add(serviceMs);
}

const VALID_RUM_NAMES = new Set(["CLS", "INP", "FCP", "LCP", "TTFB"]);

export function recordRum(name: string, value: number): boolean {
  if (!VALID_RUM_NAMES.has(name) || !Number.isFinite(value) || value < 0) return false;
  let bucket = rumBuckets.get(name);
  if (!bucket) {
    bucket = new Reservoir();
    rumBuckets.set(name, bucket);
  }
  bucket.add(value);
  return true;
}

export function resetPerfMonitor(): void {
  requestBuckets.clear();
  queueWaitBuckets.clear();
  queueServiceBuckets.clear();
  rumBuckets.clear();
  maxHeapUsed = process.memoryUsage().heapUsed;
  loopHistogram.reset();
}

export function getPerfSnapshot(): Record<string, unknown> {
  const mem = process.memoryUsage();
  const requestEntries = new Map<string, unknown>();
  for (const [key, bucket] of requestBuckets) {
    requestEntries.set(key, bucket.snapshot());
  }
  const requests = Object.fromEntries(requestEntries);
  const queueEntries = new Map<string, unknown>();
  for (const [name, wait] of queueWaitBuckets) {
    queueEntries.set(name, {
      waitMs: wait.snapshot(),
      serviceMs: queueServiceBuckets.get(name)?.snapshot() ?? { count: 0, p50: 0, p95: 0, p99: 0, max: 0 },
    });
  }
  const queues = Object.fromEntries(queueEntries);
  const rumEntries = new Map<string, unknown>();
  for (const [name, bucket] of rumBuckets) {
    rumEntries.set(name, bucket.snapshot());
  }
  const rum = Object.fromEntries(rumEntries);
  return {
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    eventLoopMs: {
      mean: round(loopHistogram.mean / 1e6),
      p50: round(loopHistogram.percentile(50) / 1e6),
      p95: round(loopHistogram.percentile(95) / 1e6),
      p99: round(loopHistogram.percentile(99) / 1e6),
      max: round(loopHistogram.max / 1e6),
    },
    heap: {
      heapUsedMB: round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: round(mem.heapTotal / 1024 / 1024),
      rssMB: round(mem.rss / 1024 / 1024),
      externalMB: round(mem.external / 1024 / 1024),
      maxHeapUsedMB: round(maxHeapUsed / 1024 / 1024),
    },
    requests,
    queues,
    rum,
  };
}

try {
  const interval = setInterval(() => {
    const snap = getPerfSnapshot();
    const loop = snap.eventLoopMs as { p99: number };
    const heap = snap.heap as { heapUsedMB: number };
    if (loop.p99 > 100) {
      logger.warn(
        { p99: loop.p99, heapUsedMB: heap.heapUsedMB },
        "[Perf] Event-loop p99 above 100ms",
      );
    }
  }, 30000);
  interval.unref();
} catch {
  // perf sampler is best-effort
}
