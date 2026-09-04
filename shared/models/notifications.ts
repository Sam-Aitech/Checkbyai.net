import {
  pgTable,
  text,
  varchar,
  timestamp,
  index,
  integer,
  boolean,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";
import { sponsorChanges } from "./sponsors";

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
      webhook: boolean;
    };
  };
};

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  licence_revoked:    { enabled: true,  channels: { email: true,  inApp: true,  sms: false, webhook: false } },
  rating_downgraded:  { enabled: true,  channels: { email: true,  inApp: false, sms: false, webhook: false } },
  licence_reinstated: { enabled: true,  channels: { email: true,  inApp: true,  sms: false, webhook: false } },
  rating_upgraded:    { enabled: false, channels: { email: false, inApp: true,  sms: false, webhook: false } },
  route_added:        { enabled: false, channels: { email: false, inApp: true,  sms: false, webhook: false } },
  route_removed:      { enabled: false, channels: { email: false, inApp: false, sms: false, webhook: false } },
  weekly_digest:      { enabled: true,  channels: { email: true,  inApp: false, sms: false, webhook: false } },
};

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
  webhookEnabled: boolean("webhook_enabled").default(false),
  webhookUrl: varchar("webhook_url"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: varchar("p256dh").notNull(),
  auth: varchar("auth").notNull(),
  deviceName: varchar("device_name"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_push_subscriptions").on(table.userId, table.endpoint),
  index("idx_push_subscriptions_user_id").on(table.userId),
]);

export const notificationLog = pgTable(
  "notification_log",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id").references(() => users.id).notNull(),
    changeId: integer("change_id").references(() => sponsorChanges.id).notNull(),
    channel: varchar("channel").notNull(),
    status: varchar("status").notNull().default("queued"),
    sentAt: timestamp("sent_at"),
    deliverAfter: timestamp("deliver_after"),
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

export const notifEngineLog = pgTable(
  "notif_engine_log",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: varchar("user_id").references(() => users.id).notNull(),
    changeId: integer("change_id").references(() => sponsorChanges.id).notNull(),
    eventType: varchar("event_type").notNull(),
    channel: varchar("channel").notNull().default("email"),
    status: varchar("status").notNull(),
    sentAt: timestamp("sent_at"),
    deliverAfter: timestamp("deliver_after"),
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

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type NotifEngineLogEntry = typeof notifEngineLog.$inferSelect;
export type NotifLogEntry = typeof notifLog.$inferSelect;

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  updatedAt: true,
});
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;

export const insertNotificationLogSchema = createInsertSchema(notificationLog).omit({
  id: true,
});
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
