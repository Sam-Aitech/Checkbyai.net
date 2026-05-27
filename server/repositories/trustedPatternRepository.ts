import { trustedPatterns, type TrustedPattern } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

export class TrustedPatternRepository {
  async getTrustedPatterns(): Promise<TrustedPattern[]> {
    return await db.select().from(trustedPatterns).where(eq(trustedPatterns.status, 'active'));
  }

  async createTrustedPattern(filename: string, metadata: any, patterns: any, aiInstructions?: string): Promise<number> {
    const [pattern] = await db
      .insert(trustedPatterns)
      .values({
        filename,
        metadata,
        patterns,
        aiInstructions,
      })
      .returning();
    return pattern.id;
  }

  async updateTrustedPatternInstructions(id: number, aiInstructions: string): Promise<void> {
    await db
      .update(trustedPatterns)
      .set({ aiInstructions, lastUpdated: new Date() })
      .where(eq(trustedPatterns.id, id));
  }

  async deleteTrustedPattern(id: number): Promise<void> {
    await db.update(trustedPatterns).set({ status: 'deleted' }).where(eq(trustedPatterns.id, id));
  }
}

export const trustedPatternRepository = new TrustedPatternRepository();
