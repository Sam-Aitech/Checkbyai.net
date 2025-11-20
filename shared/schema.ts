import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with multi-auth support
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  phone: varchar("phone").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  googleId: varchar("google_id").unique(),
  authProvider: varchar("auth_provider").notNull(), // 'google', 'email', 'phone'
  verificationCode: varchar("verification_code"),
  codeExpiry: timestamp("code_expiry"),
  isVerified: boolean("is_verified").default(false),
  role: varchar("role").default("user"), // 'user' or 'admin'
  subscriptionStatus: varchar("subscription_status").default("free"), // 'free', 'pro'
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  dailyVerificationsUsed: integer("daily_verifications_used").default(0),
  lastVerificationDate: varchar("last_verification_date"), // YYYY-MM-DD format
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Trusted patterns table
export const trustedPatterns = pgTable("trusted_patterns", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  filename: varchar("filename").notNull(),
  metadata: jsonb("metadata").notNull(),
  patterns: jsonb("patterns").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  status: varchar("status").default("active"),
});

// Verification results table
export const verificationResults = pgTable("verification_results", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id),
  filename: varchar("filename").notNull(),
  result: varchar("result").notNull(), // 'genuine', 'suspicious', 'fake'
  confidence: integer("confidence").notNull(), // 0-100
  metadata: jsonb("metadata").notNull(),
  analysisDetails: jsonb("analysis_details").notNull(),
  ipAddress: varchar("ip_address"),
  verifiedAt: timestamp("verified_at").defaultNow(),
});

// Feedback table for continuous improvement
export const feedback = pgTable("feedback", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  verificationId: integer("verification_id").references(() => verificationResults.id),
  userId: varchar("user_id").references(() => users.id),
  rating: integer("rating").notNull(), // 1-5 stars (required)
  comment: text("comment"),
  helpful: boolean("helpful"),
  accuracy: varchar("accuracy"),
  suggestedResult: varchar("suggested_result"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Type exports
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type TrustedPattern = typeof trustedPatterns.$inferSelect;
export type VerificationResult = typeof verificationResults.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;

// Zod schemas
export const insertUserSchema = createInsertSchema(users);
export const insertTrustedPatternSchema = createInsertSchema(trustedPatterns);
export const insertVerificationResultSchema = createInsertSchema(verificationResults);
export const insertFeedbackSchema = createInsertSchema(feedback).omit({ 
  id: true, 
  createdAt: true 
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertTrustedPattern = z.infer<typeof insertTrustedPatternSchema>;
export type InsertVerificationResult = z.infer<typeof insertVerificationResultSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;