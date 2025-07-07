import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, varchar, index } from "drizzle-orm/pg-core";
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

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"), // user, admin
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trustedPatterns = pgTable("trusted_patterns", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  metadata: jsonb("metadata").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  status: text("status").notNull().default("active"), // active, pending, disabled
  extractedPatterns: jsonb("extracted_patterns"),
});

export const verificationResults = pgTable("verification_results", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  result: text("result").notNull(), // genuine, suspicious, fake
  confidence: real("confidence").notNull(),
  metadata: jsonb("metadata").notNull(),
  analysisDetails: jsonb("analysis_details"),
  ipAddress: text("ip_address"),
  verifiedAt: timestamp("verified_at").defaultNow().notNull(),
});

export const insertTrustedPatternSchema = createInsertSchema(trustedPatterns).omit({
  id: true,
  uploadedAt: true,
});

export const insertVerificationResultSchema = createInsertSchema(verificationResults).omit({
  id: true,
  verifiedAt: true,
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type TrustedPattern = typeof trustedPatterns.$inferSelect;
export type InsertTrustedPattern = z.infer<typeof insertTrustedPatternSchema>;
export type VerificationResult = typeof verificationResults.$inferSelect;
export type InsertVerificationResult = z.infer<typeof insertVerificationResultSchema>;
