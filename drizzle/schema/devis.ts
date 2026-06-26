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
} from "drizzle-orm/pg-core";
import { tvaCategories, ligneTypeEnum } from "./factures";

export const devisStatutEnum = pgEnum("devis_statut", ["brouillon", "envoye", "accepte", "refuse", "expire"]);
export const signatureStatutEnum = pgEnum("signature_statut", ["en_attente", "accepte", "refuse"]);

export const devis = pgTable("devis", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId").notNull(),
  numero: varchar("numero", { length: 50 }).notNull(),
  dateDevis: timestamp("dateDevis").defaultNow().notNull(),
  dateValidite: timestamp("dateValidite"),
  dateVue: timestamp("dateVue"),
  statut: devisStatutEnum("statut").default("brouillon"),
  objet: text("objet"),
  referenceClient: varchar("referenceClient", { length: 100 }),
  conditionsPaiement: text("conditionsPaiement"),
  notes: text("notes"),
  totalHT: numeric("totalHT", { precision: 10, scale: 2 }).default("0.00"),
  totalTVA: numeric("totalTVA", { precision: 10, scale: 2 }).default("0.00"),
  totalTTC: numeric("totalTTC", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type Devis = typeof devis.$inferSelect;
export type InsertDevis = typeof devis.$inferInsert;

export const devisLignes = pgTable("devis_lignes", {
  id: serial("id").primaryKey(),
  devisId: integer("devisId").notNull(),
  ordre: integer("ordre").default(0),
  reference: varchar("reference", { length: 50 }),
  designation: varchar("designation", { length: 500 }).notNull(),
  description: text("description"),
  quantite: numeric("quantite", { precision: 10, scale: 2 }).default("1.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: numeric("prixUnitaireHT", { precision: 10, scale: 2 }).notNull(),
  tauxTVA: numeric("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  remise: numeric("remise", { precision: 5, scale: 2 }).default("0.00"),
  montantHT: numeric("montantHT", { precision: 10, scale: 2 }).default("0.00"),
  montantTVA: numeric("montantTVA", { precision: 10, scale: 2 }).default("0.00"),
  montantTTC: numeric("montantTTC", { precision: 10, scale: 2 }).default("0.00"),
  type: ligneTypeEnum("type").default("produit"),
  tvaCategorieId: varchar("tvaCategorieId", { length: 30 }).references(() => tvaCategories.id),
});
export type DevisLigne = typeof devisLignes.$inferSelect;
export type InsertDevisLigne = typeof devisLignes.$inferInsert;

export const signaturesDevis = pgTable("signatures_devis", {
  id: serial("id").primaryKey(),
  devisId: integer("devisId").notNull().unique(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  statut: signatureStatutEnum("statut").default("en_attente"),
  signatureData: text("signatureData"),
  signataireName: varchar("signataireName", { length: 255 }),
  signataireEmail: varchar("signataireEmail", { length: 320 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  motifRefus: text("motifRefus"),
  signedAt: timestamp("signedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  documentHash: varchar("documentHash", { length: 64 }),
  documentHashedAt: timestamp("documentHashedAt"),
});
export type SignatureDevis = typeof signaturesDevis.$inferSelect;
export type InsertSignatureDevis = typeof signaturesDevis.$inferInsert;

export const devisOptions = pgTable("devis_options", {
  id: serial("id").primaryKey(),
  devisId: integer("devisId").notNull(),
  nom: varchar("nom", { length: 100 }).notNull(),
  description: text("description"),
  ordre: integer("ordre").default(1),
  totalHT: numeric("totalHT", { precision: 10, scale: 2 }).default("0.00"),
  totalTVA: numeric("totalTVA", { precision: 10, scale: 2 }).default("0.00"),
  totalTTC: numeric("totalTTC", { precision: 10, scale: 2 }).default("0.00"),
  recommandee: boolean("recommandee").default(false),
  selectionnee: boolean("selectionnee").default(false),
  dateSelection: timestamp("dateSelection"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type DevisOption = typeof devisOptions.$inferSelect;
export type InsertDevisOption = typeof devisOptions.$inferInsert;

export const devisOptionsLignes = pgTable("devis_options_lignes", {
  id: serial("id").primaryKey(),
  optionId: integer("optionId").notNull(),
  articleId: integer("articleId"),
  designation: varchar("designation", { length: 255 }).notNull(),
  description: text("description"),
  quantite: numeric("quantite", { precision: 10, scale: 2 }).default("1.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: numeric("prixUnitaireHT", { precision: 10, scale: 2 }).default("0.00"),
  tauxTVA: numeric("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  montantHT: numeric("montantHT", { precision: 10, scale: 2 }).default("0.00"),
  montantTVA: numeric("montantTVA", { precision: 10, scale: 2 }).default("0.00"),
  montantTTC: numeric("montantTTC", { precision: 10, scale: 2 }).default("0.00"),
  ordre: integer("ordre").default(1),
  tvaCategorieId: varchar("tvaCategorieId", { length: 30 }).references(() => tvaCategories.id),
});
export type DevisOptionLigne = typeof devisOptionsLignes.$inferSelect;
export type InsertDevisOptionLigne = typeof devisOptionsLignes.$inferInsert;

export const modelesDevis = pgTable("modeles_devis", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  notes: text("notes"),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ModeleDevis = typeof modelesDevis.$inferSelect;
export type InsertModeleDevis = typeof modelesDevis.$inferInsert;

export const modelesDevisLignes = pgTable("modeles_devis_lignes", {
  id: serial("id").primaryKey(),
  modeleId: integer("modeleId").notNull(),
  articleId: integer("articleId"),
  designation: varchar("designation", { length: 255 }).notNull(),
  description: text("description"),
  quantite: numeric("quantite", { precision: 10, scale: 2 }).default("1.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: numeric("prixUnitaireHT", { precision: 10, scale: 2 }).default("0.00"),
  tauxTVA: numeric("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  tvaCategorieId: varchar("tvaCategorieId", { length: 30 }).references(() => tvaCategories.id),
  ordre: integer("ordre").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ModeleDevisLigne = typeof modelesDevisLignes.$inferSelect;
export type InsertModeleDevisLigne = typeof modelesDevisLignes.$inferInsert;

export const smsVerifications = pgTable("sms_verifications", {
  id: serial("id").primaryKey(),
  signatureId: integer("signatureId").notNull(),
  telephone: varchar("telephone", { length: 20 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  verified: boolean("verified").default(false),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SmsVerification = typeof smsVerifications.$inferSelect;
export type InsertSmsVerification = typeof smsVerifications.$inferInsert;
