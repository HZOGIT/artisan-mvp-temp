import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  numeric,
  unique,
} from "drizzle-orm/pg-core";
import { delaiPaiementTypeEnum } from "./factures";

export const artisanSpecialiteEnum = pgEnum("artisan_specialite", ["plomberie", "electricite", "chauffage", "multi-services"]);
export const formeJuridiqueEnum = pgEnum("forme_juridique", ["EI", "micro", "EURL", "SARL", "SAS", "SASU", "SA", "autre"]);

export const artisans = pgTable("artisans", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  siret: varchar("siret", { length: 14 }),
  nomEntreprise: varchar("nomEntreprise", { length: 255 }),
  adresse: text("adresse"),
  codePostal: varchar("codePostal", { length: 10 }),
  ville: varchar("ville", { length: 100 }),
  telephone: varchar("telephone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  specialite: artisanSpecialiteEnum("specialite").default("plomberie"),
  tauxTVA: numeric("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  numeroTVA: varchar("numeroTVA", { length: 20 }),
  iban: varchar("iban", { length: 34 }),
  codeAPE: varchar("codeAPE", { length: 10 }),
  formeJuridique: formeJuridiqueEnum("formeJuridique"),
  capitalSocial: numeric("capitalSocial", { precision: 12, scale: 2 }),
  villeRCS: varchar("villeRCS", { length: 100 }),
  numeroRM: varchar("numeroRM", { length: 50 }),
  logo: text("logo"),
  slug: varchar("slug", { length: 255 }).unique(),
  icalToken: varchar("icalToken", { length: 64 }),
  metier: varchar("metier", { length: 100 }),
  plan: varchar("plan", { length: 20 }).default("essentiel"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  franchiseTVA: boolean("franchiseTVA").default(false).notNull(),
  assuranceDecennaleNom: varchar("assuranceDecennaleNom", { length: 255 }),
  assuranceDecennalePolice: varchar("assuranceDecennalePolice", { length: 100 }),
  assuranceDecennaleGarantie: varchar("assuranceDecennaleGarantie", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  pendingDeletionAt: timestamp("pendingDeletionAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type Artisan = typeof artisans.$inferSelect;
export type InsertArtisan = typeof artisans.$inferInsert;

export const parametresArtisan = pgTable("parametres_artisan", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull().unique(),
  prefixeDevis: varchar("prefixeDevis", { length: 10 }).default("DEV"),
  prefixeFacture: varchar("prefixeFacture", { length: 10 }).default("FAC"),
  prefixeAvoir: varchar("prefixeAvoir", { length: 10 }).default("AV"),
  compteurDevis: integer("compteurDevis").default(1),
  compteurFacture: integer("compteurFacture").default(1),
  compteurAvoir: integer("compteurAvoir").default(1),
  mentionsLegales: text("mentionsLegales"),
  conditionsGenerales: text("conditionsGenerales"),
  mediateurConsommation: text("mediateurConsommation"),
  notificationsEmail: boolean("notificationsEmail").default(true),
  rappelDevisJours: integer("rappelDevisJours").default(7),
  rappelFactureJours: integer("rappelFactureJours").default(30),
  objectifCA: numeric("objectifCA", { precision: 10, scale: 2 }).default("0"),
  objectifDevis: integer("objectifDevis").default(0),
  objectifClients: integer("objectifClients").default(0),
  vitrineActive: boolean("vitrineActive").default(false),
  vitrineDescription: text("vitrineDescription"),
  vitrineZone: varchar("vitrineZone", { length: 500 }),
  vitrineServices: text("vitrineServices"),
  vitrineExperience: integer("vitrineExperience"),
  couleurPrincipale: varchar("couleurPrincipale", { length: 20 }).default("#4F46E5"),
  couleurSecondaire: varchar("couleurSecondaire", { length: 20 }).default("#6366F1"),
  conditionsPaiementDefaut: text("conditionsPaiementDefaut"),
  delaiPaiementJours: integer("delaiPaiementJours"),
  delaiPaiementType: delaiPaiementTypeEnum("delaiPaiementType").default("net"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ParametresArtisan = typeof parametresArtisan.$inferSelect;
export type InsertParametresArtisan = typeof parametresArtisan.$inferInsert;

export const modules = pgTable("modules", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  label: varchar("label", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }).notNull(),
  categorie: varchar("categorie", { length: 50 }).notNull(),
  plan_minimum: varchar("plan_minimum", { length: 20 }).default("essentiel").notNull(),
  actif_par_defaut: boolean("actif_par_defaut").default(true).notNull(),
  ordre: integer("ordre").default(0).notNull(),
  created_at: timestamp("created_at").defaultNow(),
});
export type Module = typeof modules.$inferSelect;
export type InsertModule = typeof modules.$inferInsert;

export const artisanModules = pgTable("artisan_modules", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  module_slug: varchar("module_slug", { length: 50 }).notNull(),
  actif: boolean("actif").default(true).notNull(),
  activated_at: timestamp("activated_at").defaultNow(),
}, (t) => ({
  uqArtisanModule: unique("uq_artisan_module").on(t.artisan_id, t.module_slug),
}));
export type ArtisanModule = typeof artisanModules.$inferSelect;
export type InsertArtisanModule = typeof artisanModules.$inferInsert;
