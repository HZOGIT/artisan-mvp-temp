import { pgTable, serial, integer, varchar, text, timestamp, unique, boolean, index } from "drizzle-orm/pg-core";
import { artisans } from "./artisans";
import { cycleVieEnum, factures } from "./factures";

export const paEntites = pgTable("pa_entites", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull().references(() => artisans.id),
  fournisseur: varchar("fournisseur", { length: 50 }).notNull(),
  paEntityId: varchar("paEntityId", { length: 100 }),
  statutProvisioning: varchar("statutProvisioning", { length: 30 }).default("pending"),
  kybStatut: varchar("kybStatut", { length: 50 }),
  derniereErreur: text("derniereErreur"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  uqArtisanFournisseur: unique("pa_entites_artisan_fournisseur").on(t.artisanId, t.fournisseur),
}));
export type PaEntite = typeof paEntites.$inferSelect;
export type InsertPaEntite = typeof paEntites.$inferInsert;

export const facturesCycleVieEvents = pgTable("factures_cycle_vie_events", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull().references(() => artisans.id),
  factureId: integer("factureId").notNull().references(() => factures.id),
  statut: cycleVieEnum("statut").notNull(),
  motif: text("motif"),
  source: varchar("source", { length: 30 }).notNull().default("local"),
  paEventId: varchar("paEventId", { length: 100 }).unique(),
  occurredAt: timestamp("occurredAt").notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
});
export type FactureCycleVieEvent = typeof facturesCycleVieEvents.$inferSelect;
export type InsertFactureCycleVieEvent = typeof facturesCycleVieEvents.$inferInsert;

export const paOutbox = pgTable("pa_outbox", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull().references(() => artisans.id),
  factureId: integer("factureId").notNull().references(() => factures.id, { onDelete: "cascade" }),
  statut: varchar("statut", { length: 30 }).default("pending").notNull(),
  tentatives: integer("tentatives").default(0),
  derniereErreur: text("derniereErreur"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  traiteeAt: timestamp("traiteeAt"),
});
export type PaOutbox = typeof paOutbox.$inferSelect;
export type InsertPaOutbox = typeof paOutbox.$inferInsert;

export const facturesEntrantes = pgTable("factures_entrantes", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull().references(() => artisans.id),
  paDocumentId: varchar("paDocumentId", { length: 100 }).notNull(),
  emetteurSiret: varchar("emetteurSiret", { length: 14 }),
  montantTTC: varchar("montantTTC", { length: 20 }),
  date: timestamp("date"),
  facturxBase64: text("facturxBase64"),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  lu: boolean("lu").default(false).notNull(),
}, (t) => ({
  uqArtisanDocument: unique("fe_artisan_document").on(t.artisanId, t.paDocumentId),
}));
export type FactureEntrante = typeof facturesEntrantes.$inferSelect;
export type InsertFactureEntrante = typeof facturesEntrantes.$inferInsert;

export const superpdpTokens = pgTable("superpdp_tokens", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull().unique().references(() => artisans.id, { onDelete: "cascade" }),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => ({
  idxArtisanId: index("superpdp_tokens_artisan_id_idx").on(t.artisanId),
}));
export type SuperpdpToken = typeof superpdpTokens.$inferSelect;
export type InsertSuperpdpToken = typeof superpdpTokens.$inferInsert;

export function isTerminal(statut: string): boolean {
  return statut === "refusee" || statut === "rejetee";
}
