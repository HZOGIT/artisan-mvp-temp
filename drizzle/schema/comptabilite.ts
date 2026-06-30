import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  date,
  boolean,
  numeric,
  unique,
} from "drizzle-orm/pg-core";

export const regimeTVAEnum = pgEnum("regime_tva", ["encaissements", "debits"]);

export const ecritureJournalEnum = pgEnum("ecriture_journal", ["VE", "AC", "BQ", "OD"]);
export const ecritureStatutEnum = pgEnum("ecriture_statut", ["brouillon", "validee"]);
export const compteTypeEnum = pgEnum("compte_type", ["actif", "passif", "charge", "produit"]);
export const previsionMethodeEnum = pgEnum("prevision_methode", ["moyenne_mobile", "regression_lineaire", "saisonnalite", "manuel"]);
export const comptaLogicielEnum = pgEnum("compta_logiciel", ["sage", "quickbooks", "ciel", "ebp", "autre"]);
export const comptaFormatExportEnum = pgEnum("compta_format_export", ["fec", "iif", "qbo", "csv"]);
export const comptaFrequenceSyncEnum = pgEnum("compta_frequence_sync", ["quotidien", "hebdomadaire", "mensuel", "manuel"]);
export const exportStatutEnum = pgEnum("export_statut", ["en_cours", "termine", "erreur"]);
export const depenseModePaiementEnum = pgEnum("depense_mode_paiement", ["carte", "especes", "virement", "cheque", "prelevement"]);
export const depenseStatutEnum = pgEnum("depense_statut", ["brouillon", "soumise", "approuvee", "rejetee", "remboursee"]);
export const depenseFrequenceEnum = pgEnum("depense_frequence", ["mensuelle", "trimestrielle", "annuelle"]);
export const ndfStatutEnum = pgEnum("ndf_statut", ["brouillon", "soumise", "approuvee", "rejetee", "payee"]);
export const releveStatutEnum = pgEnum("releve_statut", ["en_cours", "termine", "erreur"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["debit", "credit"]);

export const ecrituresComptables = pgTable("ecritures_comptables", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  dateEcriture: timestamp("dateEcriture").notNull(),
  journal: ecritureJournalEnum("journal").notNull(),
  numeroCompte: varchar("numeroCompte", { length: 10 }).notNull(),
  libelleCompte: varchar("libelleCompte", { length: 100 }),
  libelle: varchar("libelle", { length: 255 }).notNull(),
  pieceRef: varchar("pieceRef", { length: 50 }),
  debit: numeric("debit", { precision: 12, scale: 2 }).default("0.00"),
  credit: numeric("credit", { precision: 12, scale: 2 }).default("0.00"),
  factureId: integer("factureId"),
  lettrage: varchar("lettrage", { length: 10 }),
  pointage: boolean("pointage").default(false),
  statut: ecritureStatutEnum("statut").default("brouillon").notNull(),
  /** Numéro de pièce permanent (A47 A-1 LPF) — assigné à la validation, immuable. */
  ecritureNum: integer("ecritureNum"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EcritureComptable = typeof ecrituresComptables.$inferSelect;
export type InsertEcritureComptable = typeof ecrituresComptables.$inferInsert;

export const planComptable = pgTable("plan_comptable", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  numeroCompte: varchar("numeroCompte", { length: 10 }).notNull(),
  libelle: varchar("libelle", { length: 100 }).notNull(),
  classe: integer("classe").notNull(),
  type: compteTypeEnum("type").notNull(),
  actif: boolean("actif").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uqArtisanCompte: unique("uq_plan_comptable_artisan_compte").on(t.artisanId, t.numeroCompte),
}));
export type CompteComptable = typeof planComptable.$inferSelect;
export type InsertCompteComptable = typeof planComptable.$inferInsert;

export const previsionsCA = pgTable("previsions_ca", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  mois: integer("mois").notNull(),
  annee: integer("annee").notNull(),
  caPrevisionnel: numeric("caPrevisionnel", { precision: 12, scale: 2 }).default("0.00"),
  caRealise: numeric("caRealise", { precision: 12, scale: 2 }).default("0.00"),
  ecart: numeric("ecart", { precision: 12, scale: 2 }).default("0.00"),
  ecartPourcentage: numeric("ecartPourcentage", { precision: 5, scale: 2 }).default("0.00"),
  methodeCalcul: previsionMethodeEnum("methodeCalcul").default("moyenne_mobile"),
  confiance: numeric("confiance", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type PrevisionCA = typeof previsionsCA.$inferSelect;
export type InsertPrevisionCA = typeof previsionsCA.$inferInsert;

export const historiqueCA = pgTable("historique_ca", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  mois: integer("mois").notNull(),
  annee: integer("annee").notNull(),
  caTotal: numeric("caTotal", { precision: 12, scale: 2 }).default("0.00"),
  nombreFactures: integer("nombreFactures").default(0),
  nombreClients: integer("nombreClients").default(0),
  panierMoyen: numeric("panierMoyen", { precision: 10, scale: 2 }).default("0.00"),
  tauxConversion: numeric("tauxConversion", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type HistoriqueCA = typeof historiqueCA.$inferSelect;
export type InsertHistoriqueCA = typeof historiqueCA.$inferInsert;

export const configurationsComptables = pgTable("configurations_comptables", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull().unique(),
  logiciel: comptaLogicielEnum("logiciel").default("sage"),
  formatExport: comptaFormatExportEnum("formatExport").default("fec"),
  compteVentes: varchar("compteVentes", { length: 20 }).default("706000"),
  compteTVACollectee: varchar("compteTVACollectee", { length: 20 }).default("445710"),
  compteClients: varchar("compteClients", { length: 20 }).default("411000"),
  compteAchats: varchar("compteAchats", { length: 20 }).default("607000"),
  compteTVADeductible: varchar("compteTVADeductible", { length: 20 }).default("445660"),
  compteFournisseurs: varchar("compteFournisseurs", { length: 20 }).default("401000"),
  compteBanque: varchar("compteBanque", { length: 20 }).default("512000"),
  compteCaisse: varchar("compteCaisse", { length: 20 }).default("530000"),
  journalVentes: varchar("journalVentes", { length: 10 }).default("VE"),
  journalAchats: varchar("journalAchats", { length: 10 }).default("AC"),
  journalBanque: varchar("journalBanque", { length: 10 }).default("BQ"),
  prefixeFacture: varchar("prefixeFacture", { length: 10 }).default("FA"),
  prefixeAvoir: varchar("prefixeAvoir", { length: 10 }).default("AV"),
  exerciceDebut: integer("exerciceDebut").default(1),
  regimeTVA: regimeTVAEnum("regimeTVA").default("encaissements").notNull(),
  actif: boolean("actif").default(true),
  syncAutoFactures: boolean("syncAutoFactures").default(false),
  syncAutoPaiements: boolean("syncAutoPaiements").default(false),
  frequenceSync: comptaFrequenceSyncEnum("frequenceSync").default("manuel"),
  heureSync: varchar("heureSync", { length: 5 }).default("02:00"),
  notifierErreurs: boolean("notifierErreurs").default(true),
  notifierSucces: boolean("notifierSucces").default(false),
  dateVerrouillageCompta: date("dateVerrouillageCompta"),
  derniereSync: timestamp("derniereSync"),
  prochainSync: timestamp("prochainSync"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ConfigurationComptable = typeof configurationsComptables.$inferSelect;
export type InsertConfigurationComptable = typeof configurationsComptables.$inferInsert;

export const exportsComptables = pgTable("exports_comptables", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  logiciel: comptaLogicielEnum("logiciel").notNull(),
  formatExport: comptaFormatExportEnum("formatExport").notNull(),
  periodeDebut: date("periodeDebut").notNull(),
  periodeFin: date("periodeFin").notNull(),
  nombreEcritures: integer("nombreEcritures").default(0),
  montantTotal: numeric("montantTotal", { precision: 12, scale: 2 }),
  fichierUrl: text("fichierUrl"),
  statut: exportStatutEnum("statut").default("en_cours"),
  erreur: text("erreur"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ExportComptable = typeof exportsComptables.$inferSelect;
export type InsertExportComptable = typeof exportsComptables.$inferInsert;

export const depenses = pgTable("depenses", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  user_id: integer("user_id").notNull(),
  numero: varchar("numero", { length: 20 }).notNull(),
  date_depense: date("date_depense").notNull(),
  fournisseur: varchar("fournisseur", { length: 255 }),
  categorie: varchar("categorie", { length: 50 }).notNull(),
  sous_categorie: varchar("sous_categorie", { length: 100 }),
  description: text("description"),
  montant_ht: numeric("montant_ht", { precision: 10, scale: 2 }).default("0").notNull(),
  taux_tva: numeric("taux_tva", { precision: 5, scale: 2 }).default("20"),
  montant_tva: numeric("montant_tva", { precision: 10, scale: 2 }).default("0"),
  montant_ttc: numeric("montant_ttc", { precision: 10, scale: 2 }).default("0").notNull(),
  mode_paiement: depenseModePaiementEnum("mode_paiement").default("carte"),
  statut: depenseStatutEnum("statut").default("brouillon"),
  remboursable: boolean("remboursable").default(true),
  rembourse: boolean("rembourse").default(false),
  date_remboursement: date("date_remboursement"),
  chantier_id: integer("chantier_id"),
  intervention_id: integer("intervention_id"),
  client_id: integer("client_id"),
  notes: text("notes"),
  justificatif_url: text("justificatif_url"),
  justificatif_nom: varchar("justificatif_nom", { length: 255 }),
  ocr_brut: text("ocr_brut"),
  ocr_traite: boolean("ocr_traite").default(false),
  recurrente: boolean("recurrente").default(false),
  frequence_recurrence: depenseFrequenceEnum("frequence_recurrence"),
  prochaine_occurrence: date("prochaine_occurrence"),
  tva_deductible: boolean("tva_deductible").default(true),
  coeff_deductibilite: numeric("coeff_deductibilite", { precision: 5, scale: 2 }).default("100").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});
export type Depense = typeof depenses.$inferSelect;
export type InsertDepense = typeof depenses.$inferInsert;

export const categoriesDepenses = pgTable("categories_depenses", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  nom: varchar("nom", { length: 100 }).notNull(),
  couleur: varchar("couleur", { length: 20 }).default("#6366f1"),
  icone: varchar("icone", { length: 50 }).default("Receipt"),
  compte_comptable: varchar("compte_comptable", { length: 10 }),
  deductible_tva: boolean("deductible_tva").default(true),
  deductible_ir: boolean("deductible_ir").default(true),
  plafond_mensuel: numeric("plafond_mensuel", { precision: 10, scale: 2 }),
  actif: boolean("actif").default(true),
  ordre: integer("ordre").default(0),
  created_at: timestamp("created_at").defaultNow(),
}, (t) => ({
  uqCatArtisanNom: unique("uq_cat_artisan_nom").on(t.artisan_id, t.nom),
}));
export type CategorieDepense = typeof categoriesDepenses.$inferSelect;
export type InsertCategorieDepense = typeof categoriesDepenses.$inferInsert;

export const notesDeFrais = pgTable("notes_de_frais", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  user_id: integer("user_id").notNull(),
  numero: varchar("numero", { length: 20 }).notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  periode_debut: date("periode_debut").notNull(),
  periode_fin: date("periode_fin").notNull(),
  statut: ndfStatutEnum("statut").default("brouillon"),
  montant_total: numeric("montant_total", { precision: 10, scale: 2 }).default("0"),
  montant_rembourse: numeric("montant_rembourse", { precision: 10, scale: 2 }).default("0"),
  date_soumission: date("date_soumission"),
  date_approbation: date("date_approbation"),
  date_paiement: date("date_paiement"),
  commentaire_approbateur: text("commentaire_approbateur"),
  created_at: timestamp("created_at").defaultNow(),
});
export type NoteDeFrais = typeof notesDeFrais.$inferSelect;
export type InsertNoteDeFrais = typeof notesDeFrais.$inferInsert;

export const notesFraisDepenses = pgTable("notes_frais_depenses", {
  id: serial("id").primaryKey(),
  note_id: integer("note_id").notNull(),
  depense_id: integer("depense_id").notNull(),
}, (t) => ({
  uqNoteDepense: unique("uq_note_depense").on(t.note_id, t.depense_id),
}));
export type NoteFraisDepense = typeof notesFraisDepenses.$inferSelect;
export type InsertNoteFraisDepense = typeof notesFraisDepenses.$inferInsert;

export const budgetsCategories = pgTable("budgets_categories", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  categorie: varchar("categorie", { length: 50 }).notNull(),
  mois: varchar("mois", { length: 7 }).notNull(),
  budget: numeric("budget", { precision: 10, scale: 2 }).default("0"),
  depense_reelle: numeric("depense_reelle", { precision: 10, scale: 2 }).default("0"),
}, (t) => ({
  uqBudgetMois: unique("uq_budget_mois").on(t.artisan_id, t.categorie, t.mois),
}));
export type BudgetCategorie = typeof budgetsCategories.$inferSelect;
export type InsertBudgetCategorie = typeof budgetsCategories.$inferInsert;

export const relevesBancaires = pgTable("releves_bancaires", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  nom_fichier: varchar("nom_fichier", { length: 255 }).notNull(),
  date_import: timestamp("date_import").defaultNow(),
  nb_transactions: integer("nb_transactions").default(0),
  nb_importees: integer("nb_importees").default(0),
  statut: releveStatutEnum("statut").default("en_cours"),
});
export type ReleveBancaire = typeof relevesBancaires.$inferSelect;
export type InsertReleveBancaire = typeof relevesBancaires.$inferInsert;

export const transactionsBancaires = pgTable("transactions_bancaires", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  releve_id: integer("releve_id"),
  date_transaction: date("date_transaction").notNull(),
  libelle: text("libelle").notNull(),
  montant: numeric("montant", { precision: 10, scale: 2 }).notNull(),
  type_transaction: transactionTypeEnum("type_transaction").notNull(),
  categorie_suggeree: varchar("categorie_suggeree", { length: 50 }),
  depense_id: integer("depense_id"),
  /** Facture rapprochée (lettrage encaissement) — nullable, FK ON DELETE SET NULL. */
  facture_id: integer("facture_id"),
  ignoree: boolean("ignoree").default(false),
  created_at: timestamp("created_at").defaultNow(),
});
export type TransactionBancaire = typeof transactionsBancaires.$inferSelect;
export type InsertTransactionBancaire = typeof transactionsBancaires.$inferInsert;

export const reglesCategorisation = pgTable("regles_categorisation", {
  id: serial("id").primaryKey(),
  artisan_id: integer("artisan_id").notNull(),
  motif_libelle: varchar("motif_libelle", { length: 255 }).notNull(),
  categorie: varchar("categorie", { length: 50 }).notNull(),
  actif: boolean("actif").default(true),
  created_at: timestamp("created_at").defaultNow(),
});
export type RegleCategorisation = typeof reglesCategorisation.$inferSelect;
export type InsertRegleCategorisation = typeof reglesCategorisation.$inferInsert;
