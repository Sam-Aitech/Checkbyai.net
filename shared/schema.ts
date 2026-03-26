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
  uuid,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Per-event, per-channel notification preferences.
// Stored as jsonb on users.notif_prefs to avoid an extra join in the hot notification path.
// null column = use DEFAULT_NOTIF_PREFS. Partial updates are deep-merged server-side.
export type NotifEventType =
  | "licence_revoked"
  | "rating_downgraded"
  | "licence_reinstated"
  | "rating_upgraded"
  | "route_added"
  | "route_removed"
  | "weekly_digest";

export type NotifPrefs = {
  [K in NotifEventType]: {
    enabled: boolean;
    channels: {
      email: boolean;
      inApp: boolean;
      sms: boolean;
    };
  };
};

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  licence_revoked:    { enabled: true,  channels: { email: true,  inApp: true,  sms: false } },
  rating_downgraded:  { enabled: true,  channels: { email: true,  inApp: false, sms: false } },
  licence_reinstated: { enabled: true,  channels: { email: true,  inApp: true,  sms: false } },
  rating_upgraded:    { enabled: false, channels: { email: false, inApp: true,  sms: false } },
  route_added:        { enabled: false, channels: { email: false, inApp: true,  sms: false } },
  route_removed:      { enabled: false, channels: { email: false, inApp: false, sms: false } },
  weekly_digest:      { enabled: true,  channels: { email: true,  inApp: false, sms: false } },
};

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
  createdBy: varchar("created_by").references(() => users.id),
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
    index("idx_verification_user_verified").on(table.userId, table.verifiedAt),
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
// Status state machine:
//   ACTIVE          — currently on register, established (grantedAt < today)
//   NEWLY_GRANTED   — appeared in today's CSV, was not previously known
//   GRACE_PERIOD    — absent from today's CSV for exactly 1 day (awaiting confirmation)
//   REMOVED_REVOKED — absent 2+ consecutive days, confirmed removed from register
export const sponsorCanonical = pgTable(
  "sponsor_canonical",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fingerprint: text("fingerprint").notNull(),
    currentName: text("current_name").notNull(),
    townCity: text("town_city"),
    typeRating: text("type_rating"),
    route: text("route"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | NEWLY_GRANTED | GRACE_PERIOD | REMOVED_REVOKED
    firstSeen: date("first_seen").notNull(),
    lastSeen: date("last_seen").notNull(),
    grantedAt: date("granted_at").notNull(),            // date of first appearance on register
    removedAt: timestamp("removed_at", { withTimezone: true }), // set when status → REMOVED_REVOKED
    consecutiveMisses: integer("consecutive_misses").notNull().default(0),
    historicalNames: text("historical_names").array().default([]),
  },
  (table) => [
    uniqueIndex("idx_sponsor_canonical_fingerprint").on(table.fingerprint),
    index("idx_sponsor_canonical_status").on(table.status),
    index("idx_sponsor_canonical_current_name").on(table.currentName),
    index("idx_sponsor_canonical_granted_at").on(table.grantedAt),
    // Compound indexes for sub-10ms filtered search queries (migration 0014).
    // Replace two single-column scans with one seek + filter per query shape.
    index("idx_sc_status_name").on(table.status, table.currentName),
    index("idx_sc_status_town").on(table.status, table.townCity),
    index("idx_sc_status_type").on(table.status, table.typeRating),
  ]
);

/**
 * @deprecated sponsor_list is retired. No new rows are written as of 2026-03-20.
 * Superseded by: sponsorCanonical (per-company state) + csv_archive (daily CSV files on disk).
 * Schedule: DROP TABLE sponsor_list after 2026-04-20 (30-day holdback).
 */
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
// changeType values: NEW_LICENCE | RE_ACTIVATED | REMOVED_REVOKED |
//                    UPGRADED | DOWNGRADED | ROUTE_CHANGE | NAME_CHANGE
export const sponsorChanges = pgTable(
  "sponsor_changes",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    organisationName: varchar("organisation_name").notNull(),
    fingerprint: text("fingerprint"),              // direct link to sponsor_canonical.fingerprint
    changeType: varchar("change_type").notNull(),
    previousValue: varchar("previous_value"),
    newValue: varchar("new_value"),
    detectedAt: timestamp("detected_at").defaultNow(),
    snapshotDate: date("snapshot_date").notNull(),
  },
  (table) => [
    index("idx_sponsor_changes_org_name").on(table.organisationName),
    index("idx_sponsor_changes_fingerprint").on(table.fingerprint),
    index("idx_sponsor_changes_snapshot_date").on(table.snapshotDate),
    index("idx_sponsor_changes_change_type").on(table.changeType),
    // Compound indexes for history and change-feed endpoints (migration 0014).
    index("idx_changes_date_type").on(table.snapshotDate, table.changeType),
    index("idx_changes_fp_detected").on(table.fingerprint, table.detectedAt),
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

// Audit log written by the notification engine (Part 5).
// Separate from notification_log to avoid coupling to the legacy dispatcher schema.
// Tracks event-type-filtered sends, skips, queued deferrals, and failures.
export const notifEngineLog = pgTable(
  "notif_engine_log",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id").references(() => users.id).notNull(),
    changeId: integer("change_id").references(() => sponsorChanges.id).notNull(),
    eventType: varchar("event_type").notNull(),
    channel: varchar("channel").notNull().default("email"),
    status: varchar("status").notNull(), // 'sent' | 'failed' | 'skipped' | 'queued'
    sentAt: timestamp("sent_at"),
    deliverAfter: timestamp("deliver_after"), // null = immediate, set = deferred (starter plan)
    providerMessageId: varchar("provider_message_id"),
    errorDetails: text("error_details"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_notif_engine_log_user_id").on(table.userId),
    index("idx_notif_engine_log_change_id").on(table.changeId),
    index("idx_notif_engine_log_status").on(table.status),
    index("idx_notif_engine_log_deliver_after").on(table.deliverAfter),
  ]
);

// New-generation audit log written by the notification engine (Part 5+).
// Supersedes notif_engine_log (kept for backwards-compat; dropped after Part 5 migration).
// uuid PK avoids int-sequence contention; success boolean simplifies analytics queries.
export const notifLog = pgTable(
  "notif_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id").references(() => users.id).notNull(),
    changeId: integer("change_id").references(() => sponsorChanges.id),
    eventType: varchar("event_type").notNull(),
    channel: varchar("channel").notNull().default("email"),
    companyName: text("company_name").notNull(),
    success: boolean("success").notNull(),
    providerMessageId: varchar("provider_message_id"),
    errorDetails: text("error_details"),
    sentAt: timestamp("sent_at").defaultNow(),
  },
  (table) => [
    index("idx_notif_log_user_sent").on(table.userId, table.sentAt),
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
    // ── Companies House enrichment fields ─────────────────────────────────────
    companyStatus: varchar("company_status", { length: 50 }),             // 'active' | 'dissolved' | 'administration' | 'liquidation'
    companyType: varchar("company_type", { length: 100 }),                // 'private-limited-company' | 'llp' | etc.
    incorporationDate: date("incorporation_date"),
    sicCodes: jsonb("sic_codes").$type<string[]>().default([]),            // e.g. ["62012", "82990"]
    lastFiledAccountsDate: date("last_filed_accounts_date"),
    nextConfStmtDueDate: date("next_conf_stmt_due_date"),
    dissolvedAt: date("dissolved_at"),
    companiesHouseSource: boolean("companies_house_source").default(false), // true = official API hit
    fuzzyMatchScore: numeric("fuzzy_match_score", { precision: 4, scale: 3 }), // 0.000–1.000
    historicalNamesRaw: jsonb("historical_names_raw").$type<string[]>().default([]),
  },
  (table) => [
    index("idx_enrichment_fingerprint").on(table.fingerprint),
    index("idx_enrichment_scraped_at").on(table.scrapedAt),
    index("idx_enrichment_status").on(table.scrapeStatus),
  ],
);

// ─── Phase D: Pro Enrichment — Historical Timeline ───────────────────────────

// 1-to-many: each row is a point-in-time snapshot of a sponsor's licence status,
// sourced either from the daily Home Office CSV diff or from the lsuk scraper.
export const sponsorLicenceTimeline = pgTable(
  "sponsor_licence_timeline",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fingerprint: varchar("fingerprint", { length: 500 }).notNull(),
    recordedDate: date("recorded_date").notNull(),
    licenceStatus: varchar("licence_status", { length: 100 }).notNull(),  // 'Active' | 'Revoked' | 'Suspended' | 'Surrendered'
    route: varchar("route", { length: 200 }),
    typeRating: varchar("type_rating", { length: 50 }),
    organisationName: varchar("organisation_name", { length: 500 }),       // name as it appeared on that date
    source: varchar("source", { length: 50 }).notNull(),                   // 'home-office-csv' | 'lsuk-scrape'
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_licence_timeline_fingerprint").on(table.fingerprint),
    index("idx_licence_timeline_date").on(table.recordedDate),
    uniqueIndex("idx_licence_timeline_unique").on(table.fingerprint, table.recordedDate, table.source),
  ],
);

// Async enrichment worker state ledger — survives Redis restarts.
// Workers claim rows optimistically; exponential backoff is encoded in nextAttemptAt.
export const enrichmentQueue = pgTable(
  "enrichment_queue",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fingerprint: varchar("fingerprint", { length: 500 }).notNull(),
    jobType: varchar("job_type", { length: 50 }).notNull(),  // 'companies_house' | 'licence_history'
    // 'pending' | 'in_progress' | 'completed' | 'failed' | 'rate_limited' | 'captcha_blocked' | 'no_match'
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    priority: integer("priority").notNull().default(0),       // higher = processed first; Pro watchlist = 10
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 255 }),          // worker instance ID
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_enrichment_queue_poll").on(table.status, table.nextAttemptAt),
    index("idx_enrichment_queue_fingerprint").on(table.fingerprint),
    uniqueIndex("idx_enrichment_queue_unique").on(table.fingerprint, table.jobType),
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

// ==========================================
// Pipeline Infrastructure Tables (Phase 0)
// ==========================================

// Immutable daily archive of the validated Gov.uk CSV (one row per day).
// Replaces the sponsor_list row-per-record approach.
// File lives on disk at file_path; this table is the registry.
export const csvArchive = pgTable(
  "csv_archive",
  {
    id:             integer("id").primaryKey().generatedByDefaultAsIdentity(),
    snapshotDate:   date("snapshot_date").notNull(),
    filePath:       text("file_path").notNull(),          // absolute path to qsv-cleaned CSV
    recordCount:    integer("record_count").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),    // integrity check
    sourceUrl:      text("source_url"),
    isValid:        boolean("is_valid").notNull().default(true),
    downloadedAt:   timestamp("downloaded_at", { withTimezone: true }).defaultNow().notNull(),
    // ETL integrity flag (migration 0014).
    // PENDING_SYNC = archive downloaded, state machine not yet run
    // SYNCED       = state machine completed successfully for this archive
    // FAILED       = state machine ran but aborted with an error
    syncStatus:     text("sync_status").notNull().default("SYNCED"),
  },
  (table) => [
    uniqueIndex("idx_csv_archive_date").on(table.snapshotDate),
  ]
);

// Stores the csvdiff output for each nightly run (added/removed counts + raw JSON path).
export const diffResults = pgTable(
  "diff_results",
  {
    id:                   integer("id").primaryKey().generatedByDefaultAsIdentity(),
    runDate:              date("run_date").notNull(),
    addedCount:           integer("added_count").notNull().default(0),
    removedCount:         integer("removed_count").notNull().default(0),
    attributeChangeCount: integer("attribute_change_count").notNull().default(0),
    diffDurationMs:       integer("diff_duration_ms"),
    diffJsonPath:         text("diff_json_path"),          // kept for backward-compat; superseded by diffJson
    diffJson:             jsonb("diff_json"),              // bounded payload { added, removed, modified } — DB-native, scale-safe
    createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_diff_results_run_date").on(table.runDate),
  ]
);

// Subscription audit log — tracks every plan change with source, actor, and reason
export const subscriptionAuditLog = pgTable(
  "subscription_audit_log",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    changedBy: varchar("changed_by"),              // admin userId, 'stripe', or 'system'
    source: varchar("source").notNull(),           // 'stripe_webhook' | 'admin_override' | 'system'
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
export type SponsorListEntry = typeof sponsorList.$inferSelect;  // kept for admin snapshot routes
export type CompanyWatch = typeof companyWatches.$inferSelect;
export type SponsorChange = typeof sponsorChanges.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type NotifEngineLogEntry = typeof notifEngineLog.$inferSelect; // deprecated — use NotifLogEntry
export type NotifLogEntry = typeof notifLog.$inferSelect;
export type CsvArchiveEntry = typeof csvArchive.$inferSelect;
export type DiffResultEntry = typeof diffResults.$inferSelect;
export type SubscriptionAuditLogEntry = typeof subscriptionAuditLog.$inferSelect;
export type SponsorLicenceTimelineEntry = typeof sponsorLicenceTimeline.$inferSelect;
export type SponsorLicenceTimelineInsert = typeof sponsorLicenceTimeline.$inferInsert;
export type EnrichmentQueueEntry = typeof enrichmentQueue.$inferSelect;
export type EnrichmentQueueInsert = typeof enrichmentQueue.$inferInsert;
export type SponsorEnrichmentEntry = typeof sponsorEnrichment.$inferSelect;

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

// Reactivation watches — users opt in to be notified when a currently-unlicensed
// company reappears on the GOV.UK sponsor register.
// Status state machine:
//   pending_activation — watching, not yet notified
//   notified          — reactivation detected, email sent
//   cancelled         — user cancelled the watch
export const sponsorWatches = pgTable(
  "sponsor_watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    companyNumber: text("company_number"),
    status: varchar("status", { enum: ["pending_activation", "notified", "cancelled"] })
      .notNull()
      .default("pending_activation"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    notifiedAt: timestamp("notified_at"),
  },
  (table) => [
    index("idx_sponsor_watches_user_id").on(table.userId),
    index("idx_sponsor_watches_status").on(table.status),
    index("idx_sponsor_watches_company_name").on(table.companyName),
  ]
);

export type SponsorWatch = typeof sponsorWatches.$inferSelect;
export const insertSponsorWatchSchema = createInsertSchema(sponsorWatches).omit({
  id: true,
  createdAt: true,
  notifiedAt: true,
  status: true,
});
export type InsertSponsorWatch = z.infer<typeof insertSponsorWatchSchema>;

// ─── Support Tickets ──────────────────────────────────────────────────────────
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: varchar("status", { enum: ["open", "resolved"] }).notNull().default("open"),
    adminReply: text("admin_reply"),
    repliedAt: timestamp("replied_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_support_tickets_user_id").on(table.userId),
    index("idx_support_tickets_status").on(table.status),
    index("idx_support_tickets_created").on(table.createdAt),
  ]
);

export type SupportTicket = typeof supportTickets.$inferSelect;
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true, status: true, adminReply: true, repliedAt: true, createdAt: true, userId: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
