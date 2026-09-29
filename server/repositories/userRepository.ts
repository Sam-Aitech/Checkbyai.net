import { users, type User, type UpsertUser, type SubscriptionAuditLogEntry, type NotifPrefs, type NotifEventType, DEFAULT_NOTIF_PREFS, subscriptionAuditLog } from "@shared/schema";
import { db } from "../db";
import { eq, desc, count, sql, and, isNull } from "drizzle-orm";
import { invalidateUserCache } from "../utils/userCache";
import { resolveCosEntitlement, type CosEntitlement } from "@shared/cosEntitlement";

export class UserRepository {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserVerificationCode(identifier: string, code: string, expiry: Date): Promise<void> {
    await db
      .update(users)
      .set({
        verificationCode: code,
        codeExpiry: expiry,
        updatedAt: new Date(),
      })
      .where(sql`${users.email} = ${identifier} OR ${users.phone} = ${identifier}`);
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db
      .update(users)
      .set({
        hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async verifyUser(identifier: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        isVerified: true,
        verificationCode: null,
        codeExpiry: null,
        updatedAt: new Date(),
      })
      .where(sql`${users.email} = ${identifier} OR ${users.phone} = ${identifier}`)
      .returning();
    return user;
  }

  async updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserSubscription(userId: string, data: { subscriptionStatus: string; stripeSubscriptionId?: string | null; stripeCustomerId?: string }): Promise<User> {
    const updateData: any = {
      subscriptionStatus: data.subscriptionStatus,
      updatedAt: new Date(),
    };
    if (data.stripeSubscriptionId !== undefined) {
      updateData.stripeSubscriptionId = data.stripeSubscriptionId;
    }
    if (data.stripeCustomerId) {
      updateData.stripeCustomerId = data.stripeCustomerId;
    }
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserStripeCustomer(userId: string, customerId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
    return user;
  }

  async addCredits(userId: string, amount: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        credits: sql`COALESCE(${users.credits}, 0) + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async deductCredits(userId: string, amount: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        credits: sql`GREATEST(COALESCE(${users.credits}, 0) - ${amount}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getCredits(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    return user?.credits || 0;
  }

  async updateDailyVerificationUsage(userId: string): Promise<User> {
    const today = new Date().toISOString().split('T')[0];
    const user = await this.getUser(userId);

    if (!user) throw new Error('User not found');

    const usageToday = user.lastVerificationDate === today ? (user.dailyVerificationsUsed || 0) + 1 : 1;

    const [updatedUser] = await db
      .update(users)
      .set({
        dailyVerificationsUsed: usageToday,
        totalVerificationsUsed: sql`COALESCE(${users.totalVerificationsUsed}, 0) + 1`,
        lastVerificationDate: today,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser;
  }

  async checkDailyLimit(userId: string, getSystemSetting: (key: string) => Promise<string | null>): Promise<boolean> {
    const entitlement = await this.getCosEntitlement(userId, getSystemSetting);
    return entitlement?.canVerify ?? false;
  }

  async getCosEntitlement(
    userId: string,
    getSystemSetting: (key: string) => Promise<string | null>,
  ): Promise<CosEntitlement | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;
    const defaultDailyLimit = await getSystemSetting("defaultDailyLimit");
    return resolveCosEntitlement(user, defaultDailyLimit);
  }

  async updateUserVerificationLimit(userId: string, limit: number | null): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({
        verificationLimit: limit,
        totalVerificationsUsed: 0,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async updateCosCheckApproval(userId: string, approved: boolean): Promise<void> {
    await db
      .update(users)
      .set({
        cosCheckApproved: approved,
        ipExempt: approved ? true : false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async updateIpExempt(userId: string, exempt: boolean): Promise<void> {
    await db
      .update(users)
      .set({
        ipExempt: exempt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async updateCosCheckSubscription(userId: string, active: boolean): Promise<void> {
    await db
      .update(users)
      .set({
        cosCheckSubscription: active,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async updateCosBeta(userId: string, enabled: boolean, limit: number | null): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ cosBetaEnabled: enabled, cosBetaLimit: limit, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async deleteUser(userId: string): Promise<void> {
    await db.update(users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getPaginatedUsers(options: {
    page: number;
    limit: number;
    search?: string;
    paidOnly?: boolean;
  }): Promise<{
    data: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, search, paidOnly } = options;
    const offset = (page - 1) * limit;

    const notDeleted = isNull(users.deletedAt);
    const paidFilter = paidOnly
      ? sql`${users.subscriptionStatus} != 'free' AND ${users.subscriptionStatus} IS NOT NULL`
      : undefined;
    const searchFilter = search
      ? sql`(${users.email} ILIKE ${'%' + search + '%'} OR ${users.username} ILIKE ${'%' + search + '%'})`
      : undefined;

    const whereClause = and(notDeleted, paidFilter, searchFilter);

    const [countResult] = await db
      .select({ count: count() })
      .from(users)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const data = await db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateUserRestriction(userId: string, restricted: boolean, reason?: string): Promise<void> {
    await db
      .update(users)
      .set({
        isRestricted: restricted,
        restrictionReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async logSubscriptionChange(entry: {
    userId: string;
    changedBy?: string;
    source: 'stripe_webhook' | 'admin_override' | 'system';
    previousStatus: string;
    newStatus: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await db.insert(subscriptionAuditLog).values({
      userId: entry.userId,
      changedBy: entry.changedBy ?? null,
      source: entry.source,
      previousStatus: entry.previousStatus,
      newStatus: entry.newStatus,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? {},
    });
  }

  async getSubscriptionAuditLog(userId: string, limit = 20): Promise<SubscriptionAuditLogEntry[]> {
    return db
      .select()
      .from(subscriptionAuditLog)
      .where(eq(subscriptionAuditLog.userId, userId))
      .orderBy(desc(subscriptionAuditLog.createdAt))
      .limit(limit);
  }

  async getUserNotifPrefs(userId: string): Promise<NotifPrefs> {
    const [row] = await db
      .select({ notifPrefs: users.notifPrefs })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const stored = row?.notifPrefs ?? {};
    const result = { ...DEFAULT_NOTIF_PREFS } as NotifPrefs;
    for (const key of Object.keys(DEFAULT_NOTIF_PREFS) as NotifEventType[]) {
      const s = (stored as any)[key];
      if (s) {
        result[key] = {
          enabled: s.enabled ?? DEFAULT_NOTIF_PREFS[key].enabled,
          channels: {
            email: s.channels?.email ?? DEFAULT_NOTIF_PREFS[key].channels.email,
            inApp: s.channels?.inApp ?? DEFAULT_NOTIF_PREFS[key].channels.inApp,
            sms:   s.channels?.sms   ?? DEFAULT_NOTIF_PREFS[key].channels.sms,
            webhook: s.channels?.webhook ?? DEFAULT_NOTIF_PREFS[key].channels.webhook,
          },
        };
      }
    }
    return result;
  }

  async updateUserNotifPrefs(userId: string, patch: any): Promise<void> {
    const current = await this.getUserNotifPrefs(userId);
    const merged = { ...DEFAULT_NOTIF_PREFS } as NotifPrefs;
    for (const key of Object.keys(DEFAULT_NOTIF_PREFS) as NotifEventType[]) {
      merged[key] = {
        enabled:  patch[key]?.enabled  ?? current[key].enabled,
        channels: {
          email: patch[key]?.channels?.email ?? current[key].channels.email,
          inApp: patch[key]?.channels?.inApp ?? current[key].channels.inApp,
          sms:   patch[key]?.channels?.sms   ?? current[key].channels.sms,
          webhook: patch[key]?.channels?.webhook ?? current[key].channels.webhook,
        },
      };
    }
    await db
      .update(users)
      .set({ notifPrefs: merged, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}

// Methods that write the users table. Session deserialization caches user rows
// (utils/userCache.ts), so every write must drop the cached entry or restriction,
// deletion, role and subscription changes would keep being served stale.
// Arguments are a userId for most methods and an email/phone identifier for
// verifyUser; the returned row's id is invalidated too. Invalidating a key
// that is not cached is a no-op, so covering both is safe.
const USER_WRITE_METHODS = [
  "upsertUser",
  "updateUserPassword",
  "verifyUser",
  "updateUserStripeInfo",
  "updateUserSubscription",
  "updateUserStripeCustomer",
  "addCredits",
  "deductCredits",
  "updateDailyVerificationUsage",
  "updateUserVerificationLimit",
  "updateCosCheckApproval",
  "updateIpExempt",
  "updateCosCheckSubscription",
  "updateCosBeta",
  "deleteUser",
  "updateUserRestriction",
  "updateUserNotifPrefs",
] as const satisfies readonly (keyof UserRepository)[];

function withCacheInvalidation(repo: UserRepository): UserRepository {
  for (const name of USER_WRITE_METHODS) {
    const original = (repo[name] as (...args: any[]) => Promise<unknown>).bind(repo);
    (repo as any)[name] = async (...args: unknown[]) => {
      let result: unknown;
      try {
        result = await original(...args);
        return result;
      } finally {
        // Also on failure: a partially applied write must not leave stale rows.
        for (const arg of args) if (typeof arg === "string") invalidateUserCache(arg);
        const id = (result as { id?: unknown } | undefined)?.id;
        if (typeof id === "string") invalidateUserCache(id);
      }
    };
  }
  return repo;
}

export const userRepository = withCacheInvalidation(new UserRepository());
