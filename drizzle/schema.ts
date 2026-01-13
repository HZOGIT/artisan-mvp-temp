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
  technicienId: int("technicienId"),
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


// ============================================================================
// FOURNISSEURS TABLE (Suppliers)
// ============================================================================
export const fournisseurs = mysqlTable("fournisseurs", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  contact: varchar("contact", { length: 255 }),
  email: varchar("email", { length: 320 }),
  telephone: varchar("telephone", { length: 20 }),
  adresse: text("adresse"),
  codePostal: varchar("codePostal", { length: 10 }),
  ville: varchar("ville", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Fournisseur = typeof fournisseurs.$inferSelect;
export type InsertFournisseur = typeof fournisseurs.$inferInsert;

// ============================================================================
// ARTICLES FOURNISSEURS (Article-Supplier relationship)
// ============================================================================
export const articlesFournisseurs = mysqlTable("articles_fournisseurs", {
  id: int("id").autoincrement().primaryKey(),
  articleId: int("articleId").notNull(),
  fournisseurId: int("fournisseurId").notNull(),
  referenceExterne: varchar("referenceExterne", { length: 100 }),
  prixAchat: decimal("prixAchat", { precision: 10, scale: 2 }),
  delaiLivraison: int("delaiLivraison"), // in days
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ArticleFournisseur = typeof articlesFournisseurs.$inferSelect;
export type InsertArticleFournisseur = typeof articlesFournisseurs.$inferInsert;

// ============================================================================
// SMS VERIFICATION (For signature validation)
// ============================================================================
export const smsVerifications = mysqlTable("sms_verifications", {
  id: int("id").autoincrement().primaryKey(),
  signatureId: int("signatureId").notNull(),
  telephone: varchar("telephone", { length: 20 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  verified: boolean("verified").default(false),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SmsVerification = typeof smsVerifications.$inferSelect;
export type InsertSmsVerification = typeof smsVerifications.$inferInsert;


// ============================================================================
// RELANCES DEVIS (Automatic follow-up for unsigned quotes)
// ============================================================================
export const relancesDevis = mysqlTable("relances_devis", {
  id: int("id").autoincrement().primaryKey(),
  devisId: int("devisId").notNull(),
  artisanId: int("artisanId").notNull(),
  type: mysqlEnum("type", ["email", "notification"]).notNull(),
  destinataire: varchar("destinataire", { length: 320 }),
  message: text("message"),
  statut: mysqlEnum("statut", ["envoye", "echec"]).default("envoye"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RelanceDevis = typeof relancesDevis.$inferSelect;
export type InsertRelanceDevis = typeof relancesDevis.$inferInsert;


// ============================================================================
// EMAIL TEMPLATES (Customizable email templates for follow-ups)
// ============================================================================
export const modelesEmail = mysqlTable("modeles_email", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  nom: varchar("nom", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"]).notNull(),
  sujet: varchar("sujet", { length: 255 }).notNull(),
  contenu: text("contenu").notNull(),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModeleEmail = typeof modelesEmail.$inferSelect;
export type InsertModeleEmail = typeof modelesEmail.$inferInsert;

// ============================================================================
// COMMANDES FOURNISSEURS (Supplier orders for performance tracking)
// ============================================================================
export const commandesFournisseurs = mysqlTable("commandes_fournisseurs", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  fournisseurId: int("fournisseurId").notNull(),
  reference: varchar("reference", { length: 50 }),
  dateCommande: timestamp("dateCommande").defaultNow().notNull(),
  dateLivraisonPrevue: timestamp("dateLivraisonPrevue"),
  dateLivraisonReelle: timestamp("dateLivraisonReelle"),
  statut: mysqlEnum("statut", ["en_attente", "confirmee", "expediee", "livree", "annulee"]).default("en_attente"),
  montantTotal: decimal("montantTotal", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CommandeFournisseur = typeof commandesFournisseurs.$inferSelect;
export type InsertCommandeFournisseur = typeof commandesFournisseurs.$inferInsert;

// ============================================================================
// LIGNES COMMANDES FOURNISSEURS (Order line items)
// ============================================================================
export const lignesCommandesFournisseurs = mysqlTable("lignes_commandes_fournisseurs", {
  id: int("id").autoincrement().primaryKey(),
  commandeId: int("commandeId").notNull(),
  stockId: int("stockId"),
  designation: varchar("designation", { length: 255 }).notNull(),
  reference: varchar("reference", { length: 50 }),
  quantite: decimal("quantite", { precision: 10, scale: 2 }).notNull(),
  prixUnitaire: decimal("prixUnitaire", { precision: 10, scale: 2 }),
  montantTotal: decimal("montantTotal", { precision: 10, scale: 2 }),
});

export type LigneCommandeFournisseur = typeof lignesCommandesFournisseurs.$inferSelect;
export type InsertLigneCommandeFournisseur = typeof lignesCommandesFournisseurs.$inferInsert;

// ============================================================================
// PAIEMENTS STRIPE (Online payments for invoices)
// ============================================================================
export const paiementsStripe = mysqlTable("paiements_stripe", {
  id: int("id").autoincrement().primaryKey(),
  factureId: int("factureId").notNull(),
  artisanId: int("artisanId").notNull(),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  montant: decimal("montant", { precision: 10, scale: 2 }).notNull(),
  devise: varchar("devise", { length: 3 }).default("EUR"),
  statut: mysqlEnum("statut", ["en_attente", "complete", "echoue", "rembourse"]).default("en_attente"),
  lienPaiement: varchar("lienPaiement", { length: 500 }),
  tokenPaiement: varchar("tokenPaiement", { length: 64 }),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PaiementStripe = typeof paiementsStripe.$inferSelect;
export type InsertPaiementStripe = typeof paiementsStripe.$inferInsert;


// ============================================================================
// CLIENT PORTAL ACCESS (Magic link authentication for clients)
// ============================================================================
export const clientPortalAccess = mysqlTable("client_portal_access", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  artisanId: int("artisanId").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastAccessAt: timestamp("lastAccessAt"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientPortalAccess = typeof clientPortalAccess.$inferSelect;
export type InsertClientPortalAccess = typeof clientPortalAccess.$inferInsert;

// ============================================================================
// CLIENT PORTAL SESSIONS (Active sessions for client portal)
// ============================================================================
export const clientPortalSessions = mysqlTable("client_portal_sessions", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  sessionToken: varchar("sessionToken", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  userAgent: text("userAgent"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientPortalSession = typeof clientPortalSessions.$inferSelect;
export type InsertClientPortalSession = typeof clientPortalSessions.$inferInsert;

// ============================================================================
// CONTRATS MAINTENANCE (Recurring billing contracts)
// ============================================================================
export const contratsMaintenance = mysqlTable("contrats_maintenance", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  clientId: int("clientId").notNull(),
  reference: varchar("reference", { length: 50 }).notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  montantHT: decimal("montantHT", { precision: 10, scale: 2 }).notNull(),
  tauxTVA: decimal("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  periodicite: mysqlEnum("periodicite", ["mensuel", "trimestriel", "semestriel", "annuel"]).notNull(),
  dateDebut: timestamp("dateDebut").notNull(),
  dateFin: timestamp("dateFin"),
  prochainFacturation: timestamp("prochainFacturation"),
  statut: mysqlEnum("statut", ["actif", "suspendu", "termine", "annule"]).default("actif"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ContratMaintenance = typeof contratsMaintenance.$inferSelect;
export type InsertContratMaintenance = typeof contratsMaintenance.$inferInsert;

// ============================================================================
// FACTURES RECURRENTES (Generated invoices from contracts)
// ============================================================================
export const facturesRecurrentes = mysqlTable("factures_recurrentes", {
  id: int("id").autoincrement().primaryKey(),
  contratId: int("contratId").notNull(),
  factureId: int("factureId").notNull(),
  periodeDebut: timestamp("periodeDebut").notNull(),
  periodeFin: timestamp("periodeFin").notNull(),
  genereeAutomatiquement: boolean("genereeAutomatiquement").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FactureRecurrente = typeof facturesRecurrentes.$inferSelect;
export type InsertFactureRecurrente = typeof facturesRecurrentes.$inferInsert;

// ============================================================================
// INTERVENTIONS MOBILE (Mobile app data for field work)
// ============================================================================
export const interventionsMobile = mysqlTable("interventions_mobile", {
  id: int("id").autoincrement().primaryKey(),
  interventionId: int("interventionId").notNull(),
  artisanId: int("artisanId").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  heureArrivee: timestamp("heureArrivee"),
  heureDepart: timestamp("heureDepart"),
  notesIntervention: text("notesIntervention"),
  signatureClient: text("signatureClient"),
  signatureDate: timestamp("signatureDate"),
  syncStatus: mysqlEnum("syncStatus", ["synced", "pending", "error"]).default("synced"),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type InterventionMobile = typeof interventionsMobile.$inferSelect;
export type InsertInterventionMobile = typeof interventionsMobile.$inferInsert;

// ============================================================================
// PHOTOS INTERVENTIONS (Photos taken during field work)
// ============================================================================
export const photosInterventions = mysqlTable("photos_interventions", {
  id: int("id").autoincrement().primaryKey(),
  interventionMobileId: int("interventionMobileId").notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  description: varchar("description", { length: 255 }),
  type: mysqlEnum("type", ["avant", "pendant", "apres"]).default("pendant"),
  takenAt: timestamp("takenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PhotoIntervention = typeof photosInterventions.$inferSelect;
export type InsertPhotoIntervention = typeof photosInterventions.$inferInsert;


// ============================================================================
// CONVERSATIONS (Chat between artisan and clients)
// ============================================================================
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  clientId: int("clientId").notNull(),
  sujet: varchar("sujet", { length: 255 }),
  statut: mysqlEnum("statut", ["active", "archivee"]).default("active"),
  dernierMessageAt: timestamp("dernierMessageAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// ============================================================================
// MESSAGES (Chat messages)
// ============================================================================
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  expediteur: mysqlEnum("expediteur", ["artisan", "client"]).notNull(),
  contenu: text("contenu").notNull(),
  lu: boolean("lu").default(false),
  luAt: timestamp("luAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ============================================================================
// TECHNICIENS (Team members)
// ============================================================================
export const techniciens = mysqlTable("techniciens", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  prenom: varchar("prenom", { length: 255 }),
  email: varchar("email", { length: 320 }),
  telephone: varchar("telephone", { length: 20 }),
  specialite: varchar("specialite", { length: 100 }),
  couleur: varchar("couleur", { length: 7 }).default("#3b82f6"),
  statut: mysqlEnum("statut", ["actif", "inactif", "conge"]).default("actif"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Technicien = typeof techniciens.$inferSelect;
export type InsertTechnicien = typeof techniciens.$inferInsert;

// ============================================================================
// DISPONIBILITES TECHNICIENS (Availability schedule)
// ============================================================================
export const disponibilitesTechniciens = mysqlTable("disponibilites_techniciens", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  jourSemaine: int("jourSemaine").notNull(), // 0=Dimanche, 1=Lundi, etc.
  heureDebut: varchar("heureDebut", { length: 5 }).notNull(), // Format HH:MM
  heureFin: varchar("heureFin", { length: 5 }).notNull(),
  disponible: boolean("disponible").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DisponibiliteTechnicien = typeof disponibilitesTechniciens.$inferSelect;
export type InsertDisponibiliteTechnicien = typeof disponibilitesTechniciens.$inferInsert;

// ============================================================================
// AVIS CLIENTS (Customer reviews)
// ============================================================================
export const avisClients = mysqlTable("avis_clients", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  clientId: int("clientId").notNull(),
  interventionId: int("interventionId"),
  note: int("note").notNull(), // 1-5 étoiles
  commentaire: text("commentaire"),
  tokenAvis: varchar("tokenAvis", { length: 64 }).unique(),
  reponseArtisan: text("reponseArtisan"),
  reponseAt: timestamp("reponseAt"),
  statut: mysqlEnum("statut", ["en_attente", "publie", "masque"]).default("en_attente"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AvisClient = typeof avisClients.$inferSelect;
export type InsertAvisClient = typeof avisClients.$inferInsert;

// ============================================================================
// DEMANDES AVIS (Review requests sent to clients)
// ============================================================================
export const demandesAvis = mysqlTable("demandes_avis", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  clientId: int("clientId").notNull(),
  interventionId: int("interventionId").notNull(),
  tokenDemande: varchar("tokenDemande", { length: 64 }).notNull().unique(),
  emailEnvoyeAt: timestamp("emailEnvoyeAt"),
  avisRecuAt: timestamp("avisRecuAt"),
  statut: mysqlEnum("statut", ["envoyee", "ouverte", "completee", "expiree"]).default("envoyee"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DemandeAvis = typeof demandesAvis.$inferSelect;
export type InsertDemandeAvis = typeof demandesAvis.$inferInsert;


// ============================================================================
// POSITIONS GPS TECHNICIENS (Real-time GPS tracking)
// ============================================================================
export const positionsTechniciens = mysqlTable("positions_techniciens", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  precision: int("precision"), // Précision en mètres
  vitesse: decimal("vitesse", { precision: 5, scale: 2 }), // km/h
  cap: int("cap"), // Direction en degrés (0-360)
  batterie: int("batterie"), // Niveau de batterie en %
  enDeplacement: boolean("enDeplacement").default(false),
  interventionEnCoursId: int("interventionEnCoursId"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PositionTechnicien = typeof positionsTechniciens.$inferSelect;
export type InsertPositionTechnicien = typeof positionsTechniciens.$inferInsert;

// ============================================================================
// HISTORIQUE DEPLACEMENTS (Movement history for reporting)
// ============================================================================
export const historiqueDeplacements = mysqlTable("historique_deplacements", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  interventionId: int("interventionId"),
  dateDebut: timestamp("dateDebut").notNull(),
  dateFin: timestamp("dateFin"),
  distanceKm: decimal("distanceKm", { precision: 8, scale: 2 }),
  dureeMinutes: int("dureeMinutes"),
  latitudeDepart: decimal("latitudeDepart", { precision: 10, scale: 8 }),
  longitudeDepart: decimal("longitudeDepart", { precision: 11, scale: 8 }),
  latitudeArrivee: decimal("latitudeArrivee", { precision: 10, scale: 8 }),
  longitudeArrivee: decimal("longitudeArrivee", { precision: 11, scale: 8 }),
  adresseDepart: text("adresseDepart"),
  adresseArrivee: text("adresseArrivee"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoriqueDeplacement = typeof historiqueDeplacements.$inferSelect;
export type InsertHistoriqueDeplacement = typeof historiqueDeplacements.$inferInsert;

// ============================================================================
// ECRITURES COMPTABLES (Accounting entries)
// ============================================================================
export const ecrituresComptables = mysqlTable("ecritures_comptables", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  dateEcriture: timestamp("dateEcriture").notNull(),
  journal: mysqlEnum("journal", ["VE", "AC", "BQ", "OD"]).notNull(), // Ventes, Achats, Banque, Opérations Diverses
  numeroCompte: varchar("numeroCompte", { length: 10 }).notNull(),
  libelleCompte: varchar("libelleCompte", { length: 100 }),
  libelle: varchar("libelle", { length: 255 }).notNull(),
  pieceRef: varchar("pieceRef", { length: 50 }), // Référence facture/devis
  debit: decimal("debit", { precision: 12, scale: 2 }).default("0.00"),
  credit: decimal("credit", { precision: 12, scale: 2 }).default("0.00"),
  factureId: int("factureId"),
  lettrage: varchar("lettrage", { length: 10 }),
  pointage: boolean("pointage").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EcritureComptable = typeof ecrituresComptables.$inferSelect;
export type InsertEcritureComptable = typeof ecrituresComptables.$inferInsert;

// ============================================================================
// PLAN COMPTABLE (Chart of accounts)
// ============================================================================
export const planComptable = mysqlTable("plan_comptable", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  numeroCompte: varchar("numeroCompte", { length: 10 }).notNull(),
  libelle: varchar("libelle", { length: 100 }).notNull(),
  classe: int("classe").notNull(), // 1-7
  type: mysqlEnum("type", ["actif", "passif", "charge", "produit"]).notNull(),
  actif: boolean("actif").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CompteComptable = typeof planComptable.$inferSelect;
export type InsertCompteComptable = typeof planComptable.$inferInsert;

// ============================================================================
// DEVIS OPTIONS (Multi-option quotes)
// ============================================================================
export const devisOptions = mysqlTable("devis_options", {
  id: int("id").autoincrement().primaryKey(),
  devisId: int("devisId").notNull(),
  nom: varchar("nom", { length: 100 }).notNull(), // Ex: "Option Standard", "Option Premium"
  description: text("description"),
  ordre: int("ordre").default(1),
  totalHT: decimal("totalHT", { precision: 10, scale: 2 }).default("0.00"),
  totalTVA: decimal("totalTVA", { precision: 10, scale: 2 }).default("0.00"),
  totalTTC: decimal("totalTTC", { precision: 10, scale: 2 }).default("0.00"),
  recommandee: boolean("recommandee").default(false), // Option recommandée par l'artisan
  selectionnee: boolean("selectionnee").default(false), // Option choisie par le client
  dateSelection: timestamp("dateSelection"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DevisOption = typeof devisOptions.$inferSelect;
export type InsertDevisOption = typeof devisOptions.$inferInsert;

// ============================================================================
// DEVIS OPTIONS LIGNES (Line items for each option)
// ============================================================================
export const devisOptionsLignes = mysqlTable("devis_options_lignes", {
  id: int("id").autoincrement().primaryKey(),
  optionId: int("optionId").notNull(),
  articleId: int("articleId"),
  designation: varchar("designation", { length: 255 }).notNull(),
  description: text("description"),
  quantite: decimal("quantite", { precision: 10, scale: 2 }).default("1.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: decimal("prixUnitaireHT", { precision: 10, scale: 2 }).default("0.00"),
  tauxTVA: decimal("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  remise: decimal("remise", { precision: 5, scale: 2 }).default("0.00"),
  montantHT: decimal("montantHT", { precision: 10, scale: 2 }).default("0.00"),
  montantTVA: decimal("montantTVA", { precision: 10, scale: 2 }).default("0.00"),
  montantTTC: decimal("montantTTC", { precision: 10, scale: 2 }).default("0.00"),
  ordre: int("ordre").default(1),
});

export type DevisOptionLigne = typeof devisOptionsLignes.$inferSelect;
export type InsertDevisOptionLigne = typeof devisOptionsLignes.$inferInsert;
