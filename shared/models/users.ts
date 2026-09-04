import { pgTable, text, varchar, timestamp, jsonb, index, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { NotifPrefs } from "./notifications";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  phone: varchar("phone").unique(),
  username: varchar("username").unique(),
  hashedPassword: varchar("hashed_password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  googleId: varchar("google_id").unique(),
  authProvider: varchar("auth_provider").notNull(),
  verificationCode: varchar("verification_code"),
  codeExpiry: timestamp("code_expiry"),
  isVerified: boolean("is_verified").default(false),
  role: varchar("role").default("user"),
  subscriptionStatus: varchar("subscription_status").default("free"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  credits: integer("credits").default(0),
  dailyVerificationsUsed: integer("daily_verifications_used").default(0),
  lastVerificationDate: varchar("last_verification_date"),
  verificationLimit: integer("verification_limit"),
  totalVerificationsUsed: integer("total_verifications_used").default(0),
  isRestricted: boolean("is_restricted").default(false),
  restrictionReason: text("restriction_reason"),
  cosCheckApproved: boolean("cos_check_approved").default(false),
  cosCheckSubscription: boolean("cos_check_subscription").default(false),
  ipExempt: boolean("ip_exempt").default(false),
  cosBetaEnabled: boolean("cos_beta_enabled").default(false),
  cosBetaLimit: integer("cos_beta_limit"),
  deletedAt: timestamp("deleted_at"),
  notifPrefs: jsonb("notif_prefs").$type<NotifPrefs>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_users_stripe_customer_id").on(table.stripeCustomerId),
  index("idx_users_role").on(table.role),
]);

export const ipVerifications = pgTable("ip_verifications", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  ipAddress: varchar("ip_address").notNull().unique(),
  lastVerificationDate: timestamp("last_verification_date").notNull(),
  verificationCount: integer("verification_count").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users);
export const insertIpVerificationSchema = createInsertSchema(ipVerifications);
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type IpVerification = typeof ipVerifications.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertIpVerification = z.infer<typeof insertIpVerificationSchema>;
