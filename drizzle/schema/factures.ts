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
  date,
  index,
} from "drizzle-orm/pg-core";
import { files } from "./files";

export const factureStatutEnum = pgEnum("facture_statut", ["brouillon", "validee", "envoyee", "payee", "en_retard", "annulee"]);
export const regimeTVAFactureEnum = pgEnum("regime_tva_facture", ["normal", "autoliquidation_btp", "exonere"]);
export const cycleVieEnum = pgEnum("facture_cycle_vie", [
  "non_soumise", "deposee", "emise", "recue", "mise_a_dispo", "prise_en_charge",
  "approuvee", "en_litige", "refusee", "rejetee", "encaissee", "paiement_transmis",
]);
export const factureTypeDocumentEnum = pgEnum("facture_type_document", ["facture", "avoir"]);
export const delaiPaiementTypeEnum = pgEnum("delai_paiement_type", ["net", "fin_de_mois"]);
export const ligneTypeEnum = pgEnum("ligne_type", ["produit", "section", "note"]);
export const paiementStatutEnum = pgEnum("paiement_statut", ["en_attente", "payee", "echouee", "remboursee"]);
export const relanceTypeEnum = pgEnum("relance_type", ["email", "notification"]);
export const relanceStatutEnum = pgEnum("relance_statut", ["envoye", "echec"]);
export const modeleEmailTypeEnum = pgEnum("modele_email_type", ["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"]);
export const reglementModeEnum = pgEnum("reglement_mode", ["cheque", "virement", "especes", "carte", "autre"]);

export const tvaCategories = pgTable("tva_categories", {
  id: varchar("id", { length: 30 }).primaryKey(),
  taux: numeric("taux", { precision: 5, scale: 2 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  mentionLegale: text("mention_legale"),
  codeFacturX: varchar("code_facturx", { length: 5 }),
  compteCollecte: varchar("compte_collecte", { length: 10 }),
  ordre: integer("ordre").default(0).notNull(),
  actif: boolean("actif").default(true).notNull(),
});
export type TvaCategorie = typeof tvaCategories.$inferSelect;
export type InsertTvaCategorie = typeof tvaCategories.$inferInsert;

export const factures = pgTable("factures", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId").notNull(),
  devisId: integer("devisId"),
  numero: varchar("numero", { length: 50 }),
  dateFacture: timestamp("dateFacture").defaultNow().notNull(),
  dateEcheance: timestamp("dateEcheance"),
  statut: factureStatutEnum("statut").default("brouillon"),
  typeDocument: factureTypeDocumentEnum("typeDocument").default("facture"),
  factureOrigineId: integer("factureOrigineId"),
  objet: text("objet"),
  referenceClient: varchar("referenceClient", { length: 100 }),
  siretDestinataire: varchar("siretDestinataire", { length: 14 }),
  conditionsPaiement: text("conditionsPaiement"),
  notes: text("notes"),
  totalHT: numeric("totalHT", { precision: 10, scale: 2 }).default("0.00"),
  totalTVA: numeric("totalTVA", { precision: 10, scale: 2 }).default("0.00"),
  totalTTC: numeric("totalTTC", { precision: 10, scale: 2 }).default("0.00"),
  montantPaye: numeric("montantPaye", { precision: 10, scale: 2 }).default("0.00"),
  datePaiement: timestamp("datePaiement"),
  modePaiement: varchar("modePaiement", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  statutCycleVie: cycleVieEnum("statutCycleVie").default("non_soumise"),
  paId: varchar("paId", { length: 100 }),
  paDocumentId: varchar("paDocumentId", { length: 100 }),
  paFormat: varchar("paFormat", { length: 50 }),
  nombreRelances: integer("nombreRelances").default(0).notNull(),
  regimeTVA: regimeTVAFactureEnum("regimeTVA").default("normal"),
  pdfFileId: integer("pdfFileId").references(() => files.id, { onDelete: "set null" }),
  pdfStorageKey: varchar("pdfStorageKey", { length: 500 }),
  estAcompte: boolean("estAcompte").notNull().default(false),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("idx_factures_artisan").on(t.artisanId),
  index("idx_factures_client").on(t.clientId),
  index("idx_factures_devis").on(t.devisId),
]);
export type Facture = typeof factures.$inferSelect;
export type InsertFacture = typeof factures.$inferInsert;

export const facturesLignes = pgTable("factures_lignes", {
  id: serial("id").primaryKey(),
  factureId: integer("factureId").notNull(),
  ordre: integer("ordre").default(0),
  articleId: integer("articleId"),
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
}, (t) => [
  index("idx_factures_lignes_facture").on(t.factureId),
]);
export type FactureLigne = typeof facturesLignes.$inferSelect;
export type InsertFactureLigne = typeof facturesLignes.$inferInsert;

export const paiementsStripe = pgTable("paiements_stripe", {
  id: serial("id").primaryKey(),
  factureId: integer("factureId").notNull(),
  artisanId: integer("artisanId").notNull(),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  montant: numeric("montant", { precision: 10, scale: 2 }).notNull(),
  devise: varchar("devise", { length: 3 }).default("EUR"),
  statut: paiementStatutEnum("statut").default("en_attente"),
  lienPaiement: varchar("lienPaiement", { length: 500 }),
  tokenPaiement: varchar("tokenPaiement", { length: 64 }),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type PaiementStripe = typeof paiementsStripe.$inferSelect;
export type InsertPaiementStripe = typeof paiementsStripe.$inferInsert;

export const relancesDevis = pgTable("relances_devis", {
  id: serial("id").primaryKey(),
  devisId: integer("devisId").notNull(),
  artisanId: integer("artisanId").notNull(),
  type: relanceTypeEnum("type").notNull(),
  destinataire: varchar("destinataire", { length: 320 }),
  message: text("message"),
  statut: relanceStatutEnum("statut").default("envoye"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type RelanceDevis = typeof relancesDevis.$inferSelect;
export type InsertRelanceDevis = typeof relancesDevis.$inferInsert;

export const modelesEmail = pgTable("modeles_email", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  nom: varchar("nom", { length: 100 }).notNull(),
  type: modeleEmailTypeEnum("type").notNull(),
  sujet: varchar("sujet", { length: 255 }).notNull(),
  contenu: text("contenu").notNull(),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ModeleEmail = typeof modelesEmail.$inferSelect;
export type InsertModeleEmail = typeof modelesEmail.$inferInsert;

export const configRelancesAuto = pgTable("config_relances_auto", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull().unique(),
  actif: boolean("actif").default(false),
  joursApresEnvoi: integer("joursApresEnvoi").default(7),
  joursEntreRelances: integer("joursEntreRelances").default(7),
  nombreMaxRelances: integer("nombreMaxRelances").default(3),
  heureEnvoi: varchar("heureEnvoi", { length: 5 }).default("09:00"),
  joursEnvoi: varchar("joursEnvoi", { length: 50 }).default("1,2,3,4,5"),
  modeleEmailId: integer("modeleEmailId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ConfigRelancesAuto = typeof configRelancesAuto.$inferSelect;
export type InsertConfigRelancesAuto = typeof configRelancesAuto.$inferInsert;

export const emailsLog = pgTable("emails_log", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId"),
  destinataire: varchar("destinataire", { length: 320 }).notNull(),
  sujet: varchar("sujet", { length: 500 }).notNull(),
  type: varchar("type", { length: 50 }),
  resendId: varchar("resendId", { length: 255 }),
  statut: varchar("statut", { length: 20 }).notNull(),
  erreur: text("erreur"),
  entiteType: varchar("entiteType", { length: 50 }),
  entiteId: integer("entiteId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailLog = typeof emailsLog.$inferSelect;
export type InsertEmailLog = typeof emailsLog.$inferInsert;

export const reglements = pgTable("reglements", {
  id: serial("id").primaryKey(),
  factureId: integer("factureId").notNull().references(() => factures.id, { onDelete: "cascade" }),
  artisanId: integer("artisanId").notNull(),
  montant: numeric("montant", { precision: 10, scale: 2 }).notNull(),
  date: date("date").notNull(),
  mode: reglementModeEnum("mode").notNull(),
  reference: varchar("reference", { length: 100 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Reglement = typeof reglements.$inferSelect;
export type InsertReglement = typeof reglements.$inferInsert;

export const attestationsTvaStatutEnum = pgEnum("attestations_tva_statut", ["genere", "signe"]);

export const attestationsTva = pgTable("attestations_tva", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  factureId: integer("factureId").references(() => factures.id, { onDelete: "cascade" }),
  /** FK vers devis.id — ON DELETE CASCADE ajouté manuellement dans la migration (évite l'import circulaire). */
  devisId: integer("devisId"),
  s3Key: varchar("s3Key", { length: 500 }).notNull(),
  signedS3Key: varchar("signedS3Key", { length: 500 }),
  statut: attestationsTvaStatutEnum("statut").default("genere").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type AttestationTva = typeof attestationsTva.$inferSelect;
export type InsertAttestationTva = typeof attestationsTva.$inferInsert;
