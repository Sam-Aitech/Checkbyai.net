import { supportTickets, type SupportTicket, type InsertSupportTicket } from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";

export class SupportTicketRepository {
  async createSupportTicket(userId: string, data: InsertSupportTicket): Promise<SupportTicket> {
    const [ticket] = await db.insert(supportTickets).values({ ...data, userId }).returning();
    return ticket;
  }

  async getUserSupportTickets(userId: string): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).where(eq(supportTickets.userId, userId)).orderBy(desc(supportTickets.createdAt));
  }

  async getAllSupportTickets(): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  }

  async replySupportTicket(id: number, adminReply: string): Promise<SupportTicket> {
    const [ticket] = await db.update(supportTickets)
      .set({ adminReply, status: "resolved", repliedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    return ticket;
  }
}

export const supportTicketRepository = new SupportTicketRepository();
