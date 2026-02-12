import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  boolean,
  uniqueIndex,
  date,
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
  credits: integer("credits").default(0), // Purchased verification credits
  dailyVerificationsUsed: integer("daily_verifications_used").default(0),
  lastVerificationDate: varchar("last_verification_date"), // YYYY-MM-DD format
  verificationLimit: integer("verification_limit"), // null=default (1/day), -1=unlimited, positive=custom limit
  totalVerificationsUsed: integer("total_verifications_used").default(0), // for tracking custom limits
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
  aiInstructions: text("ai_instructions"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
  status: varchar("status").default("active"),
});

// Global AI rules table for instructions that apply to all documents
export const globalAiRules = pgTable("global_ai_rules", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  category: varchar("category").notNull(),
  ruleText: text("rule_text").notNull(),
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
    receiptId: varchar("receipt_id").unique(),
    documentHash: varchar("document_hash"),
    verifiedAt: timestamp("verified_at").defaultNow(),
    // HITL (Human-in-the-Loop) feedback fields
    adminStatus: varchar("admin_status").default("pending"), // 'pending', 'approved', 'fake'
    adminFeedback: text("admin_feedback"), // Admin reasoning when marking as fake
    adminReviewedBy: varchar("admin_reviewed_by").references(() => users.id),
    adminReviewedAt: timestamp("admin_reviewed_at"),
    accuracyScore: integer("accuracy_score"), // AI accuracy rating after human review
  },
  (table) => [
    index("idx_verification_verified_at").on(table.verifiedAt),
    index("idx_verification_result").on(table.result),
    index("idx_verification_user_id").on(table.userId),
    index("idx_verification_result_date").on(table.result, table.verifiedAt),
    index("idx_verification_admin_status").on(table.adminStatus),
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

// Expert requests table for Master Package orders
export const expertRequests = pgTable("expert_requests", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  fileUrl: varchar("file_url").notNull(),
  filename: varchar("filename"),
  status: varchar("status").default("pending"), // 'pending', 'in_progress', 'completed'
  expertComments: text("expert_comments"),
  expertVerdict: varchar("expert_verdict"), // 'genuine', 'suspicious', 'fake'
  stripeSessionId: varchar("stripe_session_id"),
  priority: boolean("priority").default(true), // Master package gets priority
  deadline: timestamp("deadline"), // 24 hour SLA
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==========================================
// Sponsor Licence Monitor Tables
// ==========================================

// Daily snapshot of the UK government sponsor licence register
export const sponsorList = pgTable(
  "sponsor_list",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    organisationName: varchar("organisation_name").notNull(),
    organisationNameNormalized: varchar("organisation_name_normalized").notNull(),
    townCity: varchar("town_city"),
    county: varchar("county"),
    typeRating: varchar("type_rating"),
    route: varchar("route"),
    snapshotDate: date("snapshot_date").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_sponsor_list_org_snapshot").on(table.organisationNameNormalized, table.snapshotDate),
    index("idx_sponsor_list_snapshot_date").on(table.snapshotDate),
    index("idx_sponsor_list_org_name_normalized").on(table.organisationNameNormalized),
  ]
);

// Which companies each user is monitoring
export const companyWatches = pgTable(
  "company_watches",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id").references(() => users.id).notNull(),
    organisationName: varchar("organisation_name").notNull(),
    organisationNameNormalized: varchar("organisation_name_normalized").notNull(),
    townCity: varchar("town_city"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_company_watches_user_id").on(table.userId),
    index("idx_company_watches_org_normalized").on(table.organisationNameNormalized),
  ]
);

// Logs every detected change in the sponsor register
export const sponsorChanges = pgTable(
  "sponsor_changes",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    organisationName: varchar("organisation_name").notNull(),
    changeType: varchar("change_type").notNull(), // 'REMOVED', 'ADDED', 'DOWNGRADED', 'UPGRADED', 'ROUTE_CHANGE'
    previousValue: varchar("previous_value"),
    newValue: varchar("new_value"),
    detectedAt: timestamp("detected_at").defaultNow(),
    snapshotDate: date("snapshot_date").notNull(),
  },
  (table) => [
    index("idx_sponsor_changes_org_name").on(table.organisationName),
    index("idx_sponsor_changes_snapshot_date").on(table.snapshotDate),
    index("idx_sponsor_changes_change_type").on(table.changeType),
  ]
);

// How each user wants to be notified
export const notificationPreferences = pgTable("notification_preferences", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  emailEnabled: boolean("email_enabled").default(true),
  email: varchar("email"),
  whatsappEnabled: boolean("whatsapp_enabled").default(false),
  whatsappNumber: varchar("whatsapp_number"),
  whatsappVerified: boolean("whatsapp_verified").default(false),
  smsEnabled: boolean("sms_enabled").default(false),
  smsNumber: varchar("sms_number"),
  smsVerified: boolean("sms_verified").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Records every notification sent
export const notificationLog = pgTable(
  "notification_log",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id").references(() => users.id).notNull(),
    changeId: integer("change_id").references(() => sponsorChanges.id).notNull(),
    channel: varchar("channel").notNull(), // 'email', 'whatsapp', 'sms'
    status: varchar("status").notNull().default("queued"), // 'queued', 'sent', 'delivered', 'failed'
    sentAt: timestamp("sent_at"),
    providerMessageId: varchar("provider_message_id"),
    errorDetails: text("error_details"),
  },
  (table) => [
    index("idx_notification_log_user_id").on(table.userId),
    index("idx_notification_log_change_id").on(table.changeId),
    index("idx_notification_log_status").on(table.status),
  ]
);

// Type exports
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type IpVerification = typeof ipVerifications.$inferSelect;
export type TrustedPattern = typeof trustedPatterns.$inferSelect;
export type GlobalAiRule = typeof globalAiRules.$inferSelect;
export type VerificationResult = typeof verificationResults.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type PaidSubmission = typeof paidSubmissions.$inferSelect;
export type ExpertRequest = typeof expertRequests.$inferSelect;
export type SponsorListEntry = typeof sponsorList.$inferSelect;
export type CompanyWatch = typeof companyWatches.$inferSelect;
export type SponsorChange = typeof sponsorChanges.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NotificationLogEntry = typeof notificationLog.$inferSelect;

// Zod schemas
export const insertUserSchema = createInsertSchema(users);
export const insertIpVerificationSchema = createInsertSchema(ipVerifications);
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
export const insertPaidSubmissionSchema = createInsertSchema(paidSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertIpVerification = z.infer<typeof insertIpVerificationSchema>;
export type InsertTrustedPattern = z.infer<typeof insertTrustedPatternSchema>;
export type InsertGlobalAiRule = z.infer<typeof insertGlobalAiRuleSchema>;
export type InsertVerificationResult = z.infer<typeof insertVerificationResultSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type InsertPaidSubmission = z.infer<typeof insertPaidSubmissionSchema>;
export const insertExpertRequestSchema = createInsertSchema(expertRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertExpertRequest = z.infer<typeof insertExpertRequestSchema>;

export const insertSponsorListSchema = createInsertSchema(sponsorList).omit({
  id: true,
  createdAt: true,
});
export type InsertSponsorListEntry = z.infer<typeof insertSponsorListSchema>;

export const insertCompanyWatchSchema = createInsertSchema(companyWatches).omit({
  id: true,
  createdAt: true,
});
export type InsertCompanyWatch = z.infer<typeof insertCompanyWatchSchema>;

export const insertSponsorChangeSchema = createInsertSchema(sponsorChanges).omit({
  id: true,
  detectedAt: true,
});
export type InsertSponsorChange = z.infer<typeof insertSponsorChangeSchema>;

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  updatedAt: true,
});
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;

export const insertNotificationLogSchema = createInsertSchema(notificationLog).omit({
  id: true,
});
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
