import { ipVerifications, type IpVerification, type InsertIpVerification } from "@shared/schema";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";

export class IpVerificationRepository {
  async getIpVerification(hashedIp: string): Promise<IpVerification | undefined> {
    const [record] = await db
      .select()
      .from(ipVerifications)
      .where(eq(ipVerifications.ipAddress, hashedIp));
    return record;
  }

  async upsertIpVerification(data: InsertIpVerification): Promise<IpVerification> {
    const [record] = await db
      .insert(ipVerifications)
      .values(data)
      .onConflictDoUpdate({
        target: ipVerifications.ipAddress,
        set: {
          lastVerificationDate: data.lastVerificationDate,
          verificationCount: sql`${ipVerifications.verificationCount} + 1`,
        },
      })
      .returning();
    return record;
  }
}

export const ipVerificationRepository = new IpVerificationRepository();
