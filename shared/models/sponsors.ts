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

export const sponsorCanonical = pgTable(
  "sponsor_canonical",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fingerprint: text("fingerprint").notNull(),
    currentName: text("current_name").notNull(),
    townCity: text("town_city"),
    county: text("county"),
    typeRating: text("type_rating"),
    route: text("route"),
    status: text("status").notNull().default("ACTIVE"),
    firstSeen: date("first_seen").notNull(),
    lastSeen: date("last_seen").notNull(),
    grantedAt: date("granted_at").notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    consecutiveMisses: integer("consecutive_misses").notNull().default(0),
    historicalNames: text("historical_names").array().default([]),
  },
  (table) => [
    uniqueIndex("idx_sponsor_canonical_fingerprint").on(table.fingerprint),
    index("idx_sponsor_canonical_status").on(table.status),
    index("idx_sponsor_canonical_current_name").on(table.currentName),
    index("idx_sponsor_canonical_granted_at").on(table.grantedAt),
    index("idx_sc_status_name").on(table.status, table.currentName),
    index("idx_sc_status_town").on(table.status, table.townCity),
    index("idx_sc_status_type").on(table.status, table.typeRating),
  ]
);

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

export const sponsorChanges = pgTable(
  "sponsor_changes",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    organisationName: varchar("organisation_name").notNull(),
    fingerprint: text("fingerprint"),
    changeType: varchar("change_type").notNull(),
    previousValue: varchar("previous_value"),
    newValue: varchar("new_value"),
    detectedAt: timestamp("detected_at").defaultNow(),
    snapshotDate: date("snapshot_date").notNull(),
    isTest: boolean("is_test").default(false),
  },
  (table) => [
    index("idx_sponsor_changes_org_name").on(table.organisationName),
    index("idx_sponsor_changes_fingerprint").on(table.fingerprint),
    index("idx_sponsor_changes_snapshot_date").on(table.snapshotDate),
    index("idx_sponsor_changes_change_type").on(table.changeType),
    index("idx_changes_date_type").on(table.snapshotDate, table.changeType),
    index("idx_changes_fp_detected").on(table.fingerprint, table.detectedAt),
  ]
);

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
    companyStatus: varchar("company_status", { length: 50 }),
    companyType: varchar("company_type", { length: 100 }),
    incorporationDate: date("incorporation_date"),
    sicCodes: jsonb("sic_codes").$type<string[]>().default([]),
    lastFiledAccountsDate: date("last_filed_accounts_date"),
    nextConfStmtDueDate: date("next_conf_stmt_due_date"),
    dissolvedAt: date("dissolved_at"),
    companiesHouseSource: boolean("companies_house_source").default(false),
    fuzzyMatchScore: numeric("fuzzy_match_score", { precision: 4, scale: 3 }),
    historicalNamesRaw: jsonb("historical_names_raw").$type<string[]>().default([]),
  },
  (table) => [
    index("idx_enrichment_fingerprint").on(table.fingerprint),
    index("idx_enrichment_scraped_at").on(table.scrapedAt),
    index("idx_enrichment_status").on(table.scrapeStatus),
  ],
);

export const sponsorLicenceTimeline = pgTable(
  "sponsor_licence_timeline",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fingerprint: varchar("fingerprint", { length: 500 }).notNull(),
    recordedDate: date("recorded_date").notNull(),
    licenceStatus: varchar("licence_status", { length: 100 }).notNull(),
    route: varchar("route", { length: 200 }),
    typeRating: varchar("type_rating", { length: 50 }),
    organisationName: varchar("organisation_name", { length: 500 }),
    source: varchar("source", { length: 50 }).notNull(),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_licence_timeline_fingerprint").on(table.fingerprint),
    index("idx_licence_timeline_date").on(table.recordedDate),
    uniqueIndex("idx_licence_timeline_unique").on(table.fingerprint, table.recordedDate, table.source),
  ],
);

export const enrichmentQueue = pgTable(
  "enrichment_queue",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fingerprint: varchar("fingerprint", { length: 500 }).notNull(),
    jobType: varchar("job_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 255 }),
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

export type SponsorCanonicalEntry = typeof sponsorCanonical.$inferSelect;
export type SponsorListEntry = typeof sponsorList.$inferSelect;
export type CompanyWatch = typeof companyWatches.$inferSelect;
export type SponsorChange = typeof sponsorChanges.$inferSelect;
export type SponsorEnrichmentEntry = typeof sponsorEnrichment.$inferSelect;
export type SponsorLicenceTimelineEntry = typeof sponsorLicenceTimeline.$inferSelect;
export type SponsorLicenceTimelineInsert = typeof sponsorLicenceTimeline.$inferInsert;
export type EnrichmentQueueEntry = typeof enrichmentQueue.$inferSelect;
export type EnrichmentQueueInsert = typeof enrichmentQueue.$inferInsert;
export type JobListing = typeof jobListings.$inferSelect;
export type JobAlertPreference = typeof jobAlertPreferences.$inferSelect;
export type SponsorWatch = typeof sponsorWatches.$inferSelect;

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

export const insertSponsorWatchSchema = createInsertSchema(sponsorWatches).omit({
  id: true,
  createdAt: true,
  notifiedAt: true,
  status: true,
});
export type InsertSponsorWatch = z.infer<typeof insertSponsorWatchSchema>;
