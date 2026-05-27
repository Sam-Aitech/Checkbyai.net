import { feedback, type Feedback, type InsertFeedback } from "@shared/schema";
import { db } from "../db";
import { count, avg, eq, desc } from "drizzle-orm";

export class FeedbackRepository {
  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const [newFeedback] = await db
      .insert(feedback)
      .values(feedbackData)
      .returning();
    return newFeedback;
  }

  async getFeedbackStats(): Promise<{
    totalFeedback: number;
    averageRating: number;
    helpfulCount: number;
    accuracyBreakdown: { correct: number; incorrect: number; unsure: number };
    recentFeedback: Feedback[];
  }> {
    const [totalCount] = await db
      .select({ count: count() })
      .from(feedback);

    const [avgRating] = await db
      .select({ average: avg(feedback.rating) })
      .from(feedback);

    const [helpfulCount] = await db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.helpful, true));

    const [correctCount] = await db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.accuracy, 'correct'));

    const [incorrectCount] = await db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.accuracy, 'incorrect'));

    const [unsureCount] = await db
      .select({ count: count() })
      .from(feedback)
      .where(eq(feedback.accuracy, 'unsure'));

    const recentFeedback = await db
      .select()
      .from(feedback)
      .orderBy(desc(feedback.createdAt))
      .limit(10);

    return {
      totalFeedback: Number(totalCount.count) || 0,
      averageRating: Number(avgRating.average) || 0,
      helpfulCount: Number(helpfulCount.count) || 0,
      accuracyBreakdown: {
        correct: Number(correctCount.count) || 0,
        incorrect: Number(incorrectCount.count) || 0,
        unsure: Number(unsureCount.count) || 0,
      },
      recentFeedback,
    };
  }
}

export const feedbackRepository = new FeedbackRepository();
