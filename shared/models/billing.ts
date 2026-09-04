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
import { users } from "./users";

export const paidSubmissions = pgTable("paid_submissions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id),
  email: varchar("email").notNull(),
  packageType: varchar("package_type").notNull(),
  paymentStatus: varchar("payment_status").default("pending"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  stripeSessionId: varchar("stripe_session_id"),
  howApplied: text("how_applied"),
  emailsReceived: text("emails_received"),
  confirmationDetails: text("confirmation_details"),
  employerName: varchar("employer_name"),
  jobTitle: varchar("job_title"),
  cosReferenceNumber: varchar("cos_reference_number"),
  additionalNotes: text("additional_notes"),
  cosDocumentPath: varchar("cos_document_path"),
  supportingDocumentsPath: jsonb("supporting_documents_path"),
  reviewStatus: varchar("review_status").default("pending"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  priority: boolean("priority").default(false),
  phoneConsultationRequested: boolean("phone_consultation_requested").default(false),
  phoneConsultationScheduled: timestamp("phone_consultation_scheduled"),
  expertVerdict: varchar("expert_verdict"),
  expertConfidence: integer("expert_confidence"),
  employerVerificationResult: jsonb("employer_verification_result"),
  documentAnalysisReport: text("document_analysis_report"),
  alterationsDetected: jsonb("alterations_detected"),
  recommendations: text("recommendations"),
  reportDelivered: boolean("report_delivered").default(false),
  reportDeliveredAt: timestamp("report_delivered_at"),
  reportPath: varchar("report_path"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_paid_submissions_stripe_session_id").on(table.stripeSessionId),
  index("idx_paid_submissions_review_status").on(table.reviewStatus),
  index("idx_paid_submissions_email").on(table.email),
  index("idx_paid_submissions_user_id").on(table.userId),
]);

export const expertRequests = pgTable("expert_requests", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  fileUrl: varchar("file_url").notNull(),
  filename: varchar("filename"),
  status: varchar("status").default("pending"),
  expertComments: text("expert_comments"),
  expertVerdict: varchar("expert_verdict"),
  stripeSessionId: varchar("stripe_session_id"),
  priority: boolean("priority").default(true),
  deadline: timestamp("deadline"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_expert_requests_status").on(table.status),
  index("idx_expert_requests_user_id").on(table.userId),
  index("idx_expert_requests_stripe_session_id").on(table.stripeSessionId),
]);

export const processedCheckouts = pgTable("processed_checkouts", {
  sessionId: varchar("session_id").primaryKey(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

export const subscriptionAuditLog = pgTable(
  "subscription_audit_log",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    changedBy: varchar("changed_by"),
    source: varchar("source").notNull(),
    previousStatus: varchar("previous_status").notNull(),
    newStatus: varchar("new_status").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_sub_audit_user_id").on(table.userId),
    index("idx_sub_audit_created").on(table.createdAt),
    index("idx_sub_audit_source").on(table.source),
  ]
);

export type PaidSubmission = typeof paidSubmissions.$inferSelect;
export type ExpertRequest = typeof expertRequests.$inferSelect;
export type SubscriptionAuditLogEntry = typeof subscriptionAuditLog.$inferSelect;

export const insertPaidSubmissionSchema = createInsertSchema(paidSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertPaidSubmission = z.infer<typeof insertPaidSubmissionSchema>;

export const insertExpertRequestSchema = createInsertSchema(expertRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertExpertRequest = z.infer<typeof insertExpertRequestSchema>;
