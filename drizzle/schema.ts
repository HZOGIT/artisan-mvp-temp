import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

// ============================================================================
// USERS TABLE (Core authentication)
// ============================================================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================================
// ARTISANS TABLE (Professional profiles)
// ============================================================================
export const artisans = mysqlTable("artisans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  siret: varchar("siret", { length: 14 }),
  nomEntreprise: varchar("nomEntreprise", { length: 255 }),
  adresse: text("adresse"),
  codePostal: varchar("codePostal", { length: 10 }),
  ville: varchar("ville", { length: 100 }),
  telephone: varchar("telephone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  specialite: mysqlEnum("specialite", ["plomberie", "electricite", "chauffage", "multi-services"]).default("plomberie"),
  tauxTVA: decimal("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  logo: text("logo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Artisan = typeof artisans.$inferSelect;
export type InsertArtisan = typeof artisans.$inferInsert;

// ============================================================================
// CLIENTS TABLE
// ============================================================================
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  prenom: varchar("prenom", { length: 255 }),
  email: varchar("email", { length: 320 }),
  telephone: varchar("telephone", { length: 20 }),
  adresse: text("adresse"),
  codePostal: varchar("codePostal", { length: 10 }),
  ville: varchar("ville", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

// ============================================================================
// BIBLIOTHEQUE ARTICLES (Global article library)
// ============================================================================
export const bibliothequeArticles = mysqlTable("bibliotheque_articles", {
  id: int("id").autoincrement().primaryKey(),
  reference: varchar("reference", { length: 50 }).notNull(),
  designation: varchar("designation", { length: 500 }).notNull(),
  description: text("description"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: decimal("prixUnitaireHT", { precision: 10, scale: 2 }).notNull(),
  categorie: varchar("categorie", { length: 100 }),
  sousCategorie: varchar("sousCategorie", { length: 100 }),
  metier: mysqlEnum("metier", ["plomberie", "electricite", "chauffage", "general"]).default("general"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BibliothequeArticle = typeof bibliothequeArticles.$inferSelect;
export type InsertBibliothequeArticle = typeof bibliothequeArticles.$inferInsert;

// ============================================================================
// ARTICLES ARTISAN (Custom articles per artisan)
// ============================================================================
export const articlesArtisan = mysqlTable("articles_artisan", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  reference: varchar("reference", { length: 50 }).notNull(),
  designation: varchar("designation", { length: 500 }).notNull(),
  description: text("description"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: decimal("prixUnitaireHT", { precision: 10, scale: 2 }).notNull(),
  categorie: varchar("categorie", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ArticleArtisan = typeof articlesArtisan.$inferSelect;
export type InsertArticleArtisan = typeof articlesArtisan.$inferInsert;

// ============================================================================
// DEVIS (Quotes)
// ============================================================================
export const devis = mysqlTable("devis", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  clientId: int("clientId").notNull(),
  numero: varchar("numero", { length: 50 }).notNull(),
  dateDevis: timestamp("dateDevis").defaultNow().notNull(),
  dateValidite: timestamp("dateValidite"),
  statut: mysqlEnum("statut", ["brouillon", "envoye", "accepte", "refuse", "expire"]).default("brouillon"),
  objet: text("objet"),
  conditionsPaiement: text("conditionsPaiement"),
  notes: text("notes"),
  totalHT: decimal("totalHT", { precision: 10, scale: 2 }).default("0.00"),
  totalTVA: decimal("totalTVA", { precision: 10, scale: 2 }).default("0.00"),
  totalTTC: decimal("totalTTC", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Devis = typeof devis.$inferSelect;
export type InsertDevis = typeof devis.$inferInsert;

// ============================================================================
// DEVIS LIGNES (Quote line items)
// ============================================================================
export const devisLignes = mysqlTable("devis_lignes", {
  id: int("id").autoincrement().primaryKey(),
  devisId: int("devisId").notNull(),
  ordre: int("ordre").default(0),
  reference: varchar("reference", { length: 50 }),
  designation: varchar("designation", { length: 500 }).notNull(),
  description: text("description"),
  quantite: decimal("quantite", { precision: 10, scale: 2 }).default("1.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: decimal("prixUnitaireHT", { precision: 10, scale: 2 }).notNull(),
  tauxTVA: decimal("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  montantHT: decimal("montantHT", { precision: 10, scale: 2 }).default("0.00"),
  montantTVA: decimal("montantTVA", { precision: 10, scale: 2 }).default("0.00"),
  montantTTC: decimal("montantTTC", { precision: 10, scale: 2 }).default("0.00"),
});

export type DevisLigne = typeof devisLignes.$inferSelect;
export type InsertDevisLigne = typeof devisLignes.$inferInsert;

// ============================================================================
// FACTURES (Invoices)
// ============================================================================
export const factures = mysqlTable("factures", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  clientId: int("clientId").notNull(),
  devisId: int("devisId"),
  numero: varchar("numero", { length: 50 }).notNull(),
  dateFacture: timestamp("dateFacture").defaultNow().notNull(),
  dateEcheance: timestamp("dateEcheance"),
  statut: mysqlEnum("statut", ["brouillon", "envoyee", "payee", "en_retard", "annulee"]).default("brouillon"),
  objet: text("objet"),
  conditionsPaiement: text("conditionsPaiement"),
  notes: text("notes"),
  totalHT: decimal("totalHT", { precision: 10, scale: 2 }).default("0.00"),
  totalTVA: decimal("totalTVA", { precision: 10, scale: 2 }).default("0.00"),
  totalTTC: decimal("totalTTC", { precision: 10, scale: 2 }).default("0.00"),
  montantPaye: decimal("montantPaye", { precision: 10, scale: 2 }).default("0.00"),
  datePaiement: timestamp("datePaiement"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Facture = typeof factures.$inferSelect;
export type InsertFacture = typeof factures.$inferInsert;

// ============================================================================
// FACTURES LIGNES (Invoice line items)
// ============================================================================
export const facturesLignes = mysqlTable("factures_lignes", {
  id: int("id").autoincrement().primaryKey(),
  factureId: int("factureId").notNull(),
  ordre: int("ordre").default(0),
  reference: varchar("reference", { length: 50 }),
  designation: varchar("designation", { length: 500 }).notNull(),
  description: text("description"),
  quantite: decimal("quantite", { precision: 10, scale: 2 }).default("1.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: decimal("prixUnitaireHT", { precision: 10, scale: 2 }).notNull(),
  tauxTVA: decimal("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  montantHT: decimal("montantHT", { precision: 10, scale: 2 }).default("0.00"),
  montantTVA: decimal("montantTVA", { precision: 10, scale: 2 }).default("0.00"),
  montantTTC: decimal("montantTTC", { precision: 10, scale: 2 }).default("0.00"),
});

export type FactureLigne = typeof facturesLignes.$inferSelect;
export type InsertFactureLigne = typeof facturesLignes.$inferInsert;

// ============================================================================
// INTERVENTIONS
// ============================================================================
export const interventions = mysqlTable("interventions", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  clientId: int("clientId").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  dateDebut: timestamp("dateDebut").notNull(),
  dateFin: timestamp("dateFin"),
  statut: mysqlEnum("statut", ["planifiee", "en_cours", "terminee", "annulee"]).default("planifiee"),
  adresse: text("adresse"),
  notes: text("notes"),
  devisId: int("devisId"),
  factureId: int("factureId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Intervention = typeof interventions.$inferSelect;
export type InsertIntervention = typeof interventions.$inferInsert;

// ============================================================================
// NOTIFICATIONS
// ============================================================================
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  type: mysqlEnum("type", ["info", "alerte", "rappel", "succes", "erreur"]).default("info"),
  titre: varchar("titre", { length: 255 }).notNull(),
  message: text("message"),
  lien: varchar("lien", { length: 500 }),
  lu: boolean("lu").default(false),
  archived: boolean("archived").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ============================================================================
// PARAMETRES ARTISAN (Artisan settings)
// ============================================================================
export const parametresArtisan = mysqlTable("parametres_artisan", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull().unique(),
  prefixeDevis: varchar("prefixeDevis", { length: 10 }).default("DEV"),
  prefixeFacture: varchar("prefixeFacture", { length: 10 }).default("FAC"),
  compteurDevis: int("compteurDevis").default(1),
  compteurFacture: int("compteurFacture").default(1),
  mentionsLegales: text("mentionsLegales"),
  conditionsGenerales: text("conditionsGenerales"),
  notificationsEmail: boolean("notificationsEmail").default(true),
  rappelDevisJours: int("rappelDevisJours").default(7),
  rappelFactureJours: int("rappelFactureJours").default(30),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParametresArtisan = typeof parametresArtisan.$inferSelect;
export type InsertParametresArtisan = typeof parametresArtisan.$inferInsert;


// ============================================================================
// SIGNATURES DEVIS (Electronic signatures for quotes)
// ============================================================================
export const signaturesDevis = mysqlTable("signatures_devis", {
  id: int("id").autoincrement().primaryKey(),
  devisId: int("devisId").notNull().unique(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  signatureData: text("signatureData"), // Base64 encoded signature image
  signataireName: varchar("signataireName", { length: 255 }),
  signataireEmail: varchar("signataireEmail", { length: 320 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  signedAt: timestamp("signedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SignatureDevis = typeof signaturesDevis.$inferSelect;
export type InsertSignatureDevis = typeof signaturesDevis.$inferInsert;

// ============================================================================
// STOCKS (Inventory management)
// ============================================================================
export const stocks = mysqlTable("stocks", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  articleId: int("articleId"), // Reference to bibliothequeArticles or articlesArtisan
  articleType: mysqlEnum("articleType", ["bibliotheque", "artisan"]).default("bibliotheque"),
  reference: varchar("reference", { length: 50 }).notNull(),
  designation: varchar("designation", { length: 500 }).notNull(),
  quantiteEnStock: decimal("quantiteEnStock", { precision: 10, scale: 2 }).default("0.00"),
  seuilAlerte: decimal("seuilAlerte", { precision: 10, scale: 2 }).default("5.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixAchat: decimal("prixAchat", { precision: 10, scale: 2 }),
  emplacement: varchar("emplacement", { length: 100 }),
  fournisseur: varchar("fournisseur", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Stock = typeof stocks.$inferSelect;
export type InsertStock = typeof stocks.$inferInsert;

// ============================================================================
// MOUVEMENTS STOCK (Stock movements history)
// ============================================================================
export const mouvementsStock = mysqlTable("mouvements_stock", {
  id: int("id").autoincrement().primaryKey(),
  stockId: int("stockId").notNull(),
  type: mysqlEnum("type", ["entree", "sortie", "ajustement"]).notNull(),
  quantite: decimal("quantite", { precision: 10, scale: 2 }).notNull(),
  quantiteAvant: decimal("quantiteAvant", { precision: 10, scale: 2 }).notNull(),
  quantiteApres: decimal("quantiteApres", { precision: 10, scale: 2 }).notNull(),
  motif: text("motif"),
  reference: varchar("reference", { length: 100 }), // Reference to devis/facture/intervention
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MouvementStock = typeof mouvementsStock.$inferSelect;
export type InsertMouvementStock = typeof mouvementsStock.$inferInsert;
