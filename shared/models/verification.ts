import { pgTable, text, varchar, timestamp, jsonb, index, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

export const trustedPatterns = pgTable("trusted_patterns", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  filename: varchar("filename").notNull(),
  metadata: jsonb("metadata").notNull(),
  patterns: jsonb("patterns").notNull(),
  aiInstructions: text("ai_instructions"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
  status: varchar("status").default("active"),
}, (table) => [
  index("idx_tp_status").on(table.status),
]);

export const globalAiRules = pgTable("global_ai_rules", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  category: varchar("category").notNull(),
  ruleText: text("rule_text").notNull(),
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const verificationResults = pgTable(
  "verification_results",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id").references(() => users.id),
    filename: varchar("filename").notNull(),
    result: varchar("result").notNull(),
    confidence: integer("confidence").notNull(),
    metadata: jsonb("metadata").notNull(),
    analysisDetails: jsonb("analysis_details").notNull(),
    ipAddress: varchar("ip_address"),
    receiptId: varchar("receipt_id").unique(),
    documentHash: varchar("document_hash"),
    verifiedAt: timestamp("verified_at").defaultNow(),
    adminStatus: varchar("admin_status").default("pending"),
    adminFeedback: text("admin_feedback"),
    adminReviewedBy: varchar("admin_reviewed_by").references(() => users.id),
    adminReviewedAt: timestamp("admin_reviewed_at"),
    accuracyScore: integer("accuracy_score"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("idx_verification_verified_at").on(table.verifiedAt),
    index("idx_verification_result").on(table.result),
    index("idx_verification_user_id").on(table.userId),
    index("idx_verification_result_date").on(table.result, table.verifiedAt),
    index("idx_verification_admin_status").on(table.adminStatus),
    index("idx_verification_user_verified").on(table.userId, table.verifiedAt),
  ]
);

export const feedback = pgTable("feedback", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  verificationId: integer("verification_id").references(() => verificationResults.id),
  userId: varchar("user_id").references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  helpful: boolean("helpful"),
  accuracy: varchar("accuracy"),
  suggestedResult: varchar("suggested_result"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_feedback_verification_id").on(table.verificationId),
  index("idx_feedback_user_id").on(table.userId),
]);

export const insertTrustedPatternSchema = createInsertSchema(trustedPatterns);
export const insertGlobalAiRuleSchema = createInsertSchema(globalAiRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export const insertVerificationResultSchema = createInsertSchema(verificationResults);
export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true
});
export type TrustedPattern = typeof trustedPatterns.$inferSelect;
export type GlobalAiRule = typeof globalAiRules.$inferSelect;
export type VerificationResult = typeof verificationResults.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type InsertTrustedPattern = z.infer<typeof insertTrustedPatternSchema>;
export type InsertGlobalAiRule = z.infer<typeof insertGlobalAiRuleSchema>;
export type InsertVerificationResult = z.infer<typeof insertVerificationResultSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
