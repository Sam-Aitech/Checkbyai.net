import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTrustedPatternSchema = createInsertSchema(trustedPatterns).omit({
  id: true,
  uploadedAt: true,
});

export const insertVerificationResultSchema = createInsertSchema(verificationResults).omit({
  id: true,
  verifiedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type TrustedPattern = typeof trustedPatterns.$inferSelect;
export type InsertTrustedPattern = z.infer<typeof insertTrustedPatternSchema>;
export type VerificationResult = typeof verificationResults.$inferSelect;
export type InsertVerificationResult = z.infer<typeof insertVerificationResultSchema>;
