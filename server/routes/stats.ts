import type { Express } from "express";
import { storage } from "../storage";
import { withCache } from "../lib/cacheAside";
import { success } from "../lib/response";
import { asyncHandler } from "../lib/errorHandler";

const STATS_CACHE_TTL = 5 * 60;

export function registerStatsRoutes(app: Express): void {
  app.get('/api/stats', asyncHandler(async (req, res) => {
    const stats = await withCache("stats:overview", STATS_CACHE_TTL, () => storage.getStats());
    success(res, stats);
  }));
}
