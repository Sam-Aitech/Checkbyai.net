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
import { users } from "./users";

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
  notificationsQueued: integer("notifications_queued").default(0),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  isGapDay: boolean("is_gap_day").default(false),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const jobTriggerAudit = pgTable(
  "job_trigger_audit",
  {
    triggerId: uuid("trigger_id").primaryKey().defaultRandom(),
    correlationId: varchar("correlation_id", { length: 64 }).notNull(),
    jobName: varchar("job_name", { length: 100 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    triggeredBy: varchar("triggered_by", { length: 255 }).notNull().references(() => users.id),
    triggerSource: varchar("trigger_source", { length: 20 }).notNull().default("manual"),
    callbackUrl: text("callback_url"),
    callbackStatus: varchar("callback_status", { length: 20 }),
    callbackAttempts: integer("callback_attempts").notNull().default(0),
    callbackLastError: text("callback_last_error"),
    callbackLastAttemptAt: timestamp("callback_last_attempt_at"),
    reason: text("reason"),
    status: varchar("status", { length: 20 }).notNull().default("accepted"),
    failureReason: text("failure_reason"),
    triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    index("idx_job_trigger_audit_job_name").on(table.jobName, table.triggeredAt),
    index("idx_job_trigger_audit_triggered_by").on(table.triggeredBy, table.triggeredAt),
    index("idx_job_trigger_audit_idempotency").on(table.jobName, table.idempotencyKey),
    index("idx_job_trigger_audit_status").on(table.status),
  ]
);

export const shadowRunResults = pgTable(
  "shadow_run_results",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    correlationId: varchar("correlation_id", { length: 64 }).notNull(),
    jobName: varchar("job_name", { length: 100 }).notNull(),
    runMode: varchar("run_mode", { length: 20 }).notNull().default("shadow"),
    triggerSource: varchar("trigger_source", { length: 20 }).notNull().default("manual"),
    triggeredBy: varchar("triggered_by", { length: 255 }).notNull().references(() => users.id),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
    result: varchar("result", { length: 20 }).notNull(),
    failureReason: text("failure_reason"),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_shadow_run_results_job_created").on(table.jobName, table.createdAt),
    index("idx_shadow_run_results_correlation").on(table.correlationId),
  ]
);

export const shadowParityReports = pgTable(
  "shadow_parity_reports",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    shadowRunId: integer("shadow_run_id").notNull().references(() => shadowRunResults.id),
    productionCorrelationId: varchar("production_correlation_id", { length: 64 }),
    jobName: varchar("job_name", { length: 100 }).notNull(),
    parityScore: numeric("parity_score", { precision: 5, scale: 4 }).notNull(),
    outcomeMatch: boolean("outcome_match").notNull(),
    durationDriftMs: integer("duration_drift_ms"),
    recordsDrift: integer("records_drift"),
    changeDriftJson: jsonb("change_drift_json").$type<Record<string, unknown>>().default({}),
    driftSummary: text("drift_summary"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_shadow_parity_reports_job_created").on(table.jobName, table.createdAt),
    index("idx_shadow_parity_reports_shadow_run").on(table.shadowRunId),
  ]
);

export const csvArchive = pgTable(
  "csv_archive",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    snapshotDate: date("snapshot_date").notNull(),
    filePath: text("file_path").notNull(),
    recordCount: integer("record_count").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    sourceUrl: text("source_url"),
    isValid: boolean("is_valid").notNull().default(true),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }).defaultNow().notNull(),
    syncStatus: text("sync_status").notNull().default("SYNCED"),
  },
  (table) => [
    uniqueIndex("idx_csv_archive_date").on(table.snapshotDate),
  ]
);

export const diffResults = pgTable(
  "diff_results",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    runDate: date("run_date").notNull(),
    addedCount: integer("added_count").notNull().default(0),
    removedCount: integer("removed_count").notNull().default(0),
    attributeChangeCount: integer("attribute_change_count").notNull().default(0),
    diffDurationMs: integer("diff_duration_ms"),
    diffJsonPath: text("diff_json_path"),
    diffJson: jsonb("diff_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_diff_results_run_date").on(table.runDate),
  ]
);

export const sponsorStaging = pgTable(
  "sponsor_staging",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    snapshotId: text("snapshot_id").notNull(),
    rowNum: integer("row_num").notNull(),
    organisationName: text("organisation_name").notNull(),
    townCity: text("town_city"),
    county: text("county"),
    typeRating: text("type_rating"),
    route: text("route"),
    fingerprint: text("fingerprint").notNull(),
    snapshotDate: date("snapshot_date").notNull(),
  },
  (table) => [
    uniqueIndex("idx_sponsor_staging_snapshot_row").on(table.snapshotId, table.rowNum),
    index("idx_sponsor_staging_snapshot_id").on(table.snapshotId),
    index("idx_sponsor_staging_fingerprint").on(table.fingerprint),
  ]
);

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    snapshotId: text("snapshot_id").notNull().unique(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
  }
);

export const systemSettings = pgTable("system_settings", {
  key: varchar("key").primaryKey().notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jobLocks = pgTable("job_locks", {
  jobName: varchar("job_name", { length: 100 }).primaryKey(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull(),
  lockedBy: varchar("locked_by", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

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

export const incidentTickets = pgTable(
  "incident_tickets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    jobName: varchar("job_name").notNull(),
    severity: varchar("severity", { enum: ["P0", "P1", "P2", "P3"] }).notNull(),
    status: varchar("status", { enum: ["open", "auto-remediated", "resolved"] })
      .notNull()
      .default("open"),
    title: text("title").notNull(),
    context: jsonb("context").notNull(),
    remediationCorrelationId: varchar("remediation_correlation_id"),
    resolvedBy: varchar("resolved_by"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_incident_tickets_job").on(table.jobName),
    index("idx_incident_tickets_severity").on(table.severity),
    index("idx_incident_tickets_status").on(table.status),
    index("idx_incident_tickets_created").on(table.createdAt),
  ],
);

export type DailyDigest = typeof dailyDigest.$inferSelect;
export type AiGenerationLog = typeof aiGenerationLogs.$inferSelect;
export type MonitorJobRun = typeof monitorJobRuns.$inferSelect;
export type JobTriggerAuditEntry = typeof jobTriggerAudit.$inferSelect;
export type ShadowRunResultEntry = typeof shadowRunResults.$inferSelect;
export type ShadowParityReportEntry = typeof shadowParityReports.$inferSelect;
export type CsvArchiveEntry = typeof csvArchive.$inferSelect;
export type DiffResultEntry = typeof diffResults.$inferSelect;
export type SponsorStagingEntry = typeof sponsorStaging.$inferSelect;
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type JobLock = typeof jobLocks.$inferSelect;
export type InsertJobLock = typeof jobLocks.$inferInsert;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type IncidentTicketEntry = typeof incidentTickets.$inferSelect;

export const insertMonitorJobRunSchema = createInsertSchema(monitorJobRuns).omit({
  id: true,
  startedAt: true,
});
export type InsertMonitorJobRun = z.infer<typeof insertMonitorJobRunSchema>;

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  status: true, adminReply: true, repliedAt: true, createdAt: true, userId: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
