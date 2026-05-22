import { expertRequests } from "@shared/schema";
import { db } from "../db";

export class ExpertRequestRepository {
  async createExpertRequest(userId: string, stripeSessionId?: string): Promise<number> {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + 24);

    const [request] = await db
      .insert(expertRequests)
      .values({
        userId,
        fileUrl: '',
        status: 'pending',
        priority: true,
        stripeSessionId: stripeSessionId || null,
        deadline,
      })
      .returning();
    return request.id;
  }
}

export const expertRequestRepository = new ExpertRequestRepository();
