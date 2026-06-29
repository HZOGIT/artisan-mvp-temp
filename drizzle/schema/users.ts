import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  bigint,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "artisan", "secretaire", "technicien"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  prenom: varchar("prenom", { length: 255 }),
  email: varchar("email", { length: 320 }).unique(),
  password: varchar("password", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("artisan").notNull(),
  artisanId: integer("artisanId"),
  actif: boolean("actif").default(true).notNull(),
  resetToken: varchar("resetToken", { length: 64 }),
  resetTokenExpiry: timestamp("resetTokenExpiry"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  passwordChangedAt: timestamp("passwordChangedAt"),
  registrationIp: varchar("registrationIp", { length: 64 }),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const permissionsUtilisateur = pgTable("permissions_utilisateur", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  permission: varchar("permission", { length: 50 }).notNull(),
  autorise: boolean("autorise").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [unique("permissions_utilisateur_userid_permission_unique").on(t.userId, t.permission)]);
export type PermissionUtilisateur = typeof permissionsUtilisateur.$inferSelect;
export type InsertPermissionUtilisateur = typeof permissionsUtilisateur.$inferInsert;

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
});
export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

export const eventLog = pgTable("events", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId"),
  userId: integer("userId"),
  entityType: varchar("entityType", { length: 100 }).notNull(),
  entityId: integer("entityId").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  details: text("details"),
  payload: jsonb("payload"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EventLog = typeof eventLog.$inferSelect;
export type InsertEventLog = typeof eventLog.$inferInsert;

export const eventOutbox = pgTable("event_outbox", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  userId: integer("userId"),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: integer("entityId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EventOutbox = typeof eventOutbox.$inferSelect;
export type InsertEventOutbox = typeof eventOutbox.$inferInsert;

export const activeSessions = pgTable("active_sessions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  artisan_id: integer("artisan_id").notNull(),
  session_token: varchar("session_token", { length: 200 }).notNull(),
  device_fingerprint: varchar("device_fingerprint", { length: 255 }),
  ip: varchar("ip", { length: 64 }),
  expires_at: timestamp("expires_at").notNull(),
  last_active_at: timestamp("last_active_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userToken: unique("sessions_user_token").on(t.user_id, t.session_token),
}));
export type ActiveSession = typeof activeSessions.$inferSelect;
export type InsertActiveSession = typeof activeSessions.$inferInsert;

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  artisan_id: integer("artisan_id").notNull(),
  device_fingerprint: varchar("device_fingerprint", { length: 255 }).notNull(),
  device_type: varchar("device_type", { length: 50 }),
  browser: varchar("browser", { length: 100 }),
  os: varchar("os", { length: 100 }),
  last_ip: varchar("last_ip", { length: 64 }),
  last_active_at: timestamp("last_active_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userFingerprint: unique("devices_user_fingerprint").on(t.user_id, t.device_fingerprint),
}));
export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;

export const adminAuditLog = pgTable("admin_audit_log", {
  id:          serial("id").primaryKey(),
  staffUserId: integer("staff_user_id").references(() => users.id),
  action:      varchar("action", { length: 100 }).notNull(),
  targetType:  varchar("target_type", { length: 50 }),
  targetId:    integer("target_id"),
  metadata:    jsonb("metadata"),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type InsertAdminAuditLog = typeof adminAuditLog.$inferInsert;

/**
 * Table plateforme (pas de tenant) — opt-out global par adresse email pour les emails
 * lifecycle/marketing. RLS désactivée : même logique que `events` (journal global).
 * Lecture autorisée au rôle app_tenant pour que la garde pre-send fonctionne.
 */
export const emailOptouts = pgTable("email_optouts", {
  id:        serial("id").primaryKey(),
  email:     varchar("email", { length: 320 }).notNull().unique(),
  reason:    text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type EmailOptout = typeof emailOptouts.$inferSelect;
export type InsertEmailOptout = typeof emailOptouts.$inferInsert;
