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
  username: varchar("username").unique(),
  hashedPassword: varchar("hashed_password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  googleId: varchar("google_id").unique(),
  authProvider: varchar("auth_provider").notNull(), // 'google', 'email', 'phone', 'admin'
  verificationCode: varchar("verification_code"),
  codeExpiry: timestamp("code_expiry"),
  isVerified: boolean("is_verified").default(false),
  role: varchar("role").default("user"), // 'user' or 'admin'
  subscriptionStatus: varchar("subscription_status").default("free"), // 'free', 'pro'
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  dailyVerificationsUsed: integer("daily_verifications_used").default(0),
  lastVerificationDate: varchar("last_verification_date"), // YYYY-MM-DD format
  isRestricted: boolean("is_restricted").default(false),
  restrictionReason: text("restriction_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// IP-based verification tracking (for anonymous users)
export const ipVerifications = pgTable("ip_verifications", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  ipAddress: varchar("ip_address").notNull().unique(),
  lastVerificationDate: timestamp("last_verification_date").notNull(),
  verificationCount: integer("verification_count").default(1),
  createdAt: timestamp("created_at").defaultNow(),
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
export const verificationResults = pgTable(
  "verification_results",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id").references(() => users.id),
    filename: varchar("filename").notNull(),
    result: varchar("result").notNull(), // 'genuine', 'suspicious', 'fake'
    confidence: integer("confidence").notNull(), // 0-100
    metadata: jsonb("metadata").notNull(),
    analysisDetails: jsonb("analysis_details").notNull(),
    ipAddress: varchar("ip_address"),
    verifiedAt: timestamp("verified_at").defaultNow(),
  },
  (table) => [
    index("idx_verification_verified_at").on(table.verifiedAt),
    index("idx_verification_result").on(table.result),
    index("idx_verification_user_id").on(table.userId),
    index("idx_verification_result_date").on(table.result, table.verifiedAt),
  ]
);

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

// Paid expert submissions table
export const paidSubmissions = pgTable("paid_submissions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  email: varchar("email").notNull(),
  packageType: varchar("package_type").notNull(), // 'normal' (£19.99) or 'full' (£49.99)
  paymentStatus: varchar("payment_status").default("pending"), // 'pending', 'paid', 'failed', 'refunded'
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  stripeSessionId: varchar("stripe_session_id"),
  
  // Questionnaire responses
  howApplied: text("how_applied"), // How did you apply for the job?
  emailsReceived: text("emails_received"), // Description of emails from employer
  confirmationDetails: text("confirmation_details"), // Any confirmation letters/calls?
  employerName: varchar("employer_name"),
  jobTitle: varchar("job_title"),
  cosReferenceNumber: varchar("cos_reference_number"),
  additionalNotes: text("additional_notes"),
  
  // Document storage (file paths/keys)
  cosDocumentPath: varchar("cos_document_path"),
  supportingDocumentsPath: jsonb("supporting_documents_path"), // Array of paths
  
  // Review status
  reviewStatus: varchar("review_status").default("pending"), // 'pending', 'in_progress', 'completed'
  assignedTo: varchar("assigned_to").references(() => users.id), // Admin who is reviewing
  priority: boolean("priority").default(false), // Full package gets priority
  phoneConsultationRequested: boolean("phone_consultation_requested").default(false),
  phoneConsultationScheduled: timestamp("phone_consultation_scheduled"),
  
  // Expert analysis results
  expertVerdict: varchar("expert_verdict"), // 'genuine', 'suspicious', 'fake', 'inconclusive'
  expertConfidence: integer("expert_confidence"), // 0-100
  employerVerificationResult: jsonb("employer_verification_result"), // Sponsor licence check results
  documentAnalysisReport: text("document_analysis_report"),
  alterationsDetected: jsonb("alterations_detected"), // List of detected alterations
  recommendations: text("recommendations"),
  
  // Report delivery
  reportDelivered: boolean("report_delivered").default(false),
  reportDeliveredAt: timestamp("report_delivered_at"),
  reportPath: varchar("report_path"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Type exports
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type IpVerification = typeof ipVerifications.$inferSelect;
export type TrustedPattern = typeof trustedPatterns.$inferSelect;
export type VerificationResult = typeof verificationResults.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type PaidSubmission = typeof paidSubmissions.$inferSelect;

// Zod schemas
export const insertUserSchema = createInsertSchema(users);
export const insertIpVerificationSchema = createInsertSchema(ipVerifications);
export const insertTrustedPatternSchema = createInsertSchema(trustedPatterns);
export const insertVerificationResultSchema = createInsertSchema(verificationResults);
export const insertFeedbackSchema = createInsertSchema(feedback).omit({ 
  id: true, 
  createdAt: true 
});
export const insertPaidSubmissionSchema = createInsertSchema(paidSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertIpVerification = z.infer<typeof insertIpVerificationSchema>;
export type InsertTrustedPattern = z.infer<typeof insertTrustedPatternSchema>;
export type InsertVerificationResult = z.infer<typeof insertVerificationResultSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type InsertPaidSubmission = z.infer<typeof insertPaidSubmissionSchema>;
