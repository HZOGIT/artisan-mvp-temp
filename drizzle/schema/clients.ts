import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const clientTypeEnum = pgEnum("client_type", ["particulier", "professionnel"]);

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  prenom: varchar("prenom", { length: 255 }),
  email: varchar("email", { length: 320 }),
  telephone: varchar("telephone", { length: 20 }),
  adresse: text("adresse"),
  codePostal: varchar("codePostal", { length: 10 }),
  ville: varchar("ville", { length: 100 }),
  adresseFacturation: text("adresseFacturation"),
  codePostalFacturation: varchar("codePostalFacturation", { length: 10 }),
  villeFacturation: varchar("villeFacturation", { length: 100 }),
  type: clientTypeEnum("type").default("particulier"),
  raisonSociale: varchar("raisonSociale", { length: 255 }),
  siret: varchar("siret", { length: 14 }),
  numeroTVA: varchar("numeroTVA", { length: 20 }),
  etiquettes: varchar("etiquettes", { length: 500 }),
  notes: text("notes"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

export const clientPortalAccess = pgTable("client_portal_access", {
  id: serial("id").primaryKey(),
  clientId: integer("clientId").notNull(),
  artisanId: integer("artisanId").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastAccessAt: timestamp("lastAccessAt"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ClientPortalAccess = typeof clientPortalAccess.$inferSelect;
export type InsertClientPortalAccess = typeof clientPortalAccess.$inferInsert;

export const clientPortalSessions = pgTable("client_portal_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("clientId").notNull(),
  sessionToken: varchar("sessionToken", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  userAgent: text("userAgent"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ClientPortalSession = typeof clientPortalSessions.$inferSelect;
export type InsertClientPortalSession = typeof clientPortalSessions.$inferInsert;
