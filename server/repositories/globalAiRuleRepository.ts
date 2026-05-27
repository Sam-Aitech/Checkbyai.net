import { globalAiRules, type GlobalAiRule, type InsertGlobalAiRule } from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { withCacheAndStale, markStale } from "../lib/cacheAside";

const CACHE_KEY = "globalAiRules:active";
const CACHE_TTL = 60;

export class GlobalAiRuleRepository {
  async getGlobalAiRules(): Promise<GlobalAiRule[]> {
    return await db.select().from(globalAiRules).orderBy(desc(globalAiRules.priority));
  }

  async getActiveGlobalAiRules(): Promise<GlobalAiRule[]> {
    return withCacheAndStale(CACHE_KEY, CACHE_TTL, async () => {
      const data = await db
        .select()
        .from(globalAiRules)
        .where(eq(globalAiRules.isActive, true))
        .orderBy(desc(globalAiRules.priority));
      return data;
    });
  }

  async createGlobalAiRule(data: InsertGlobalAiRule): Promise<GlobalAiRule> {
    const [rule] = await db
      .insert(globalAiRules)
      .values(data)
      .returning();
    markStale(CACHE_KEY);
    return rule;
  }

  async updateGlobalAiRule(id: number, data: Partial<InsertGlobalAiRule>): Promise<GlobalAiRule> {
    const [rule] = await db
      .update(globalAiRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(globalAiRules.id, id))
      .returning();
    markStale(CACHE_KEY);
    return rule;
  }

  async deleteGlobalAiRule(id: number): Promise<void> {
    await db.delete(globalAiRules).where(eq(globalAiRules.id, id));
    markStale(CACHE_KEY);
  }

  async toggleGlobalAiRule(id: number, isActive: boolean): Promise<void> {
    await db
      .update(globalAiRules)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(globalAiRules.id, id));
    markStale(CACHE_KEY);
  }
}

export const globalAiRuleRepository = new GlobalAiRuleRepository();
