import { systemSettings, type SystemSetting } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

export class SettingsRepository {
  async getSystemSetting(key: string): Promise<string | null> {
    const [record] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    return record?.value ?? null;
  }

  async setSystemSetting(key: string, value: string): Promise<void> {
    await db
      .insert(systemSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date() },
      });
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return db.select().from(systemSettings);
  }
}

export const settingsRepository = new SettingsRepository();
