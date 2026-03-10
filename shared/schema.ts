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
  cosCheckApproved: boolean("cos_check_approved").default(false),
  cosCheckSubscription: boolean("cos_check_subscription").default(false),
  ipExempt: boolean("ip_exempt").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_users_stripe_customer_id").on(table.stripeCustomerId),
  index("idx_users_role").on(table.role),
]);

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
}, (table) => [
  // NOTE: GIN indexes on metadata/patterns JSONB columns are applied via
  // migrations/0001_gin_indexes_jsonb.sql (CREATE INDEX CONCURRENTLY).
  // Drizzle ORM's DSL does not support jsonb_path_ops operator class syntax.
  index("idx_tp_status").on(table.status),
]);

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
    // NOTE: GIN indexes on metadata/analysis_details JSONB columns are defined in
    // migrations/0001_gin_indexes_jsonb.sql. They reduce admin HITL query cost
    // from O(N) full scan to O(log N) for JSONB key-path lookups.
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
}, (table) => [
  index("idx_feedback_verification_id").on(table.verificationId),
  index("idx_feedback_user_id").on(table.userId),
]);

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
}, (table) => [
  index("idx_paid_submissions_stripe_session_id").on(table.stripeSessionId),
  index("idx_paid_submissions_review_status").on(table.reviewStatus),
  index("idx_paid_submissions_email").on(table.email),
]);

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
}, (table) => [
  index("idx_expert_requests_status").on(table.status),
  index("idx_expert_requests_user_id").on(table.userId),
  index("idx_expert_requests_stripe_session_id").on(table.stripeSessionId),
]);

// DB-backed idempotency for Stripe checkout sessions (prevents duplicate credit grants on restart)
export const processedCheckouts = pgTable("processed_checkouts", {
  sessionId: varchar("session_id").primaryKey(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

// ==========================================
// Sponsor Licence Monitor Tables
// ==========================================

// Canonical sponsor records — single source of truth for all sponsors
export const sponsorCanonical = pgTable(
  "sponsor_canonical",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fingerprint: text("fingerprint").notNull(),
    currentName: text("current_name").notNull(),
    townCity: text("town_city"),
    typeRating: text("type_rating"),
    route: text("route"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | NOT_LISTED
    firstSeen: date("first_seen").notNull(),
    lastSeen: date("last_seen").notNull(),
    consecutiveMisses: integer("consecutive_misses").notNull().default(0),
    historicalNames: text("historical_names").array().default([]),
  },
  (table) => [
    uniqueIndex("idx_sponsor_canonical_fingerprint").on(table.fingerprint),
    index("idx_sponsor_canonical_status").on(table.status),
    index("idx_sponsor_canonical_current_name").on(table.currentName),
  ]
);

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
    fingerprint: text("fingerprint"),
    snapshotDate: date("snapshot_date").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_sponsor_list_org_snapshot").on(table.organisationNameNormalized, table.snapshotDate),
    index("idx_sponsor_list_snapshot_date").on(table.snapshotDate),
    index("idx_sponsor_list_org_name_normalized").on(table.organisationNameNormalized),
    index("idx_sponsor_list_fingerprint").on(table.fingerprint),
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
    fingerprint: text("fingerprint"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_company_watches_user_id").on(table.userId),
    index("idx_company_watches_org_normalized").on(table.organisationNameNormalized),
    index("idx_company_watches_fingerprint").on(table.fingerprint),
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
    status: varchar("status").notNull().default("queued"), // 'queued', 'sent', 'delivered', 'failed', 'skipped'
    sentAt: timestamp("sent_at"),
    deliverAfter: timestamp("deliver_after"), // null = immediate, set = delayed delivery
    providerMessageId: varchar("provider_message_id"),
    errorDetails: text("error_details"),
  },
  (table) => [
    index("idx_notification_log_user_id").on(table.userId),
    index("idx_notification_log_change_id").on(table.changeId),
    index("idx_notification_log_status").on(table.status),
    index("idx_notification_log_deliver_after").on(table.deliverAfter),
  ]
);

// Daily AI-generated digest for landing page
export const dailyDigest = pgTable("daily_digest", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  snapshotDate: date("snapshot_date").notNull().unique(),
  addedCount: integer("added_count").notNull(),
  updatedCount: integer("updated_count").notNull(),
  removedCount: integer("removed_count").notNull(),
  headlineGenerated: text("headline_generated").notNull(),
  headlineVariants: jsonb("headline_variants").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
  displayedOnLanding: boolean("displayed_on_landing").default(false),
  selectedVariantIndex: integer("selected_variant_index").default(0),
  aiModel: text("ai_model").default("deepseek-chat"),
});

// AI generation audit log
export const aiGenerationLogs = pgTable("ai_generation_logs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  snapshotDate: date("snapshot_date").notNull(),
  headlineGenerated: text("headline_generated"),
  validationPassed: boolean("validation_passed").notNull(),
  modelUsed: text("model_used").notNull(),
  errorDetails: text("error_details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const monitorJobRuns = pgTable("monitor_job_runs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  runDate: date("run_date").notNull().unique(),
  source: varchar("source").notNull(),
  status: varchar("status").notNull(),
  recordsProcessed: integer("records_processed").default(0),
  changesDetected: integer("changes_detected").default(0),
  changeSummary: jsonb("change_summary"),
  notificationsSent: integer("notifications_sent").default(0),
  notificationsSkipped: integer("notifications_skipped").default(0),
  notificationsFailed: integer("notifications_failed").default(0),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// ─── Phase C: Company Enrichment & Job Alerts ────────────────────────────────

// Caches Companies House data scraped for each watched sponsor (7 day TTL)
export const sponsorEnrichment = pgTable(
  "sponsor_enrichment",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fingerprint: varchar("fingerprint", { length: 500 }).notNull().unique(),
    companyNumber: varchar("company_number", { length: 20 }),
    natureOfBusiness: text("nature_of_business"),
    registeredAddress: text("registered_address"),
    websiteUrl: varchar("website_url", { length: 500 }),
    scrapedAt: timestamp("scraped_at").defaultNow(),
    scrapeStatus: varchar("scrape_status", { length: 20 }).notNull().default("pending"),
    lastAttempted: timestamp("last_attempted"),
  },
  (table) => [
    index("idx_enrichment_fingerprint").on(table.fingerprint),
    index("idx_enrichment_scraped_at").on(table.scrapedAt),
    index("idx_enrichment_status").on(table.scrapeStatus),
  ],
);

// Stores deduplicated job listings found for watched sponsors across job boards
export const jobListings = pgTable(
  "job_listings",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fingerprint: varchar("fingerprint", { length: 500 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    location: varchar("location", { length: 300 }),
    salary: varchar("salary", { length: 200 }),
    sourceBoard: varchar("source_board", { length: 50 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull().unique(),
    firstSeen: timestamp("first_seen").defaultNow(),
    lastSeen: timestamp("last_seen").defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    index("idx_jobs_fingerprint").on(table.fingerprint),
    index("idx_jobs_first_seen").on(table.firstSeen),
    index("idx_jobs_active").on(table.isActive),
  ],
);

// Per-user per-company opt-in for job opening alerts (Pro plan only)
export const jobAlertPreferences = pgTable(
  "job_alert_preferences",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 500 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_job_prefs_user_id").on(table.userId),
    index("idx_job_prefs_fingerprint").on(table.fingerprint),
    uniqueIndex("idx_job_prefs_unique").on(table.userId, table.fingerprint),
  ],
);

// Type exports
export type DailyDigest = typeof dailyDigest.$inferSelect;
export type AiGenerationLog = typeof aiGenerationLogs.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type IpVerification = typeof ipVerifications.$inferSelect;
export type TrustedPattern = typeof trustedPatterns.$inferSelect;
export type GlobalAiRule = typeof globalAiRules.$inferSelect;
export type VerificationResult = typeof verificationResults.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type PaidSubmission = typeof paidSubmissions.$inferSelect;
export type ExpertRequest = typeof expertRequests.$inferSelect;
export type SponsorCanonicalEntry = typeof sponsorCanonical.$inferSelect;
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

export const insertMonitorJobRunSchema = createInsertSchema(monitorJobRuns).omit({
  id: true,
  startedAt: true,
});
export type InsertMonitorJobRun = z.infer<typeof insertMonitorJobRunSchema>;
export type MonitorJobRun = typeof monitorJobRuns.$inferSelect;

// System-wide settings (admin-configurable key-value store)
export const systemSettings = pgTable("system_settings", {
  key: varchar("key").primaryKey().notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type SystemSetting = typeof systemSettings.$inferSelect;
