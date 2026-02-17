import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, date, bigint } from "drizzle-orm/mysql-core";

// ============================================================================
// USERS TABLE (Core authentication)
// ============================================================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  password: varchar("password", { length: 255 }),
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
  numeroTVA: varchar("numeroTVA", { length: 20 }),
  iban: varchar("iban", { length: 34 }),
  codeAPE: varchar("codeAPE", { length: 10 }),
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
  id: int("id").primaryKey().autoincrement(),
  metier: varchar("metier", { length: 50 }).notNull(),
  categorie: varchar("categorie", { length: 50 }).notNull(),
  sous_categorie: varchar("sous_categorie", { length: 100 }).notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  prix_base: decimal("prix_base", { precision: 10, scale: 2 }).notNull(),
  unite: varchar("unite", { length: 50 }).notNull(),
  duree_moyenne_minutes: int("duree_moyenne_minutes"),
  visible: boolean("visible").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow(),
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
  statut: mysqlEnum("statut", ["en_attente", "accepte", "refuse"]).default("en_attente"),
  signatureData: text("signatureData"), // Base64 encoded signature image
  signataireName: varchar("signataireName", { length: 255 }),
  signataireEmail: varchar("signataireEmail", { length: 320 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  motifRefus: text("motifRefus"),
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
  type: mysqlEnum("type", ["maintenance_preventive", "entretien", "depannage", "contrat_service"]).default("entretien"),
  montantHT: decimal("montantHT", { precision: 10, scale: 2 }).notNull(),
  tauxTVA: decimal("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  periodicite: mysqlEnum("periodicite", ["mensuel", "trimestriel", "semestriel", "annuel"]).notNull(),
  dateDebut: timestamp("dateDebut").notNull(),
  dateFin: timestamp("dateFin"),
  reconduction: boolean("reconduction").default(true),
  preavisResiliation: int("preavisResiliation").default(1),
  prochainFacturation: timestamp("prochainFacturation"),
  prochainPassage: timestamp("prochainPassage"),
  conditionsParticulieres: text("conditionsParticulieres"),
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
// INTERVENTIONS CONTRAT (Maintenance visits linked to contracts)
// ============================================================================
export const interventionsContrat = mysqlTable("interventions_contrat", {
  id: int("id").autoincrement().primaryKey(),
  contratId: int("contratId").notNull(),
  artisanId: int("artisanId").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  dateIntervention: timestamp("dateIntervention").notNull(),
  duree: varchar("duree", { length: 50 }),
  technicienNom: varchar("technicienNom", { length: 255 }),
  statut: mysqlEnum("statut", ["planifiee", "en_cours", "effectuee", "annulee"]).default("planifiee"),
  rapport: text("rapport"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type InterventionContrat = typeof interventionsContrat.$inferSelect;
export type InsertInterventionContrat = typeof interventionsContrat.$inferInsert;

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


// ============================================================================
// RAPPORTS PERSONNALISABLES
// ============================================================================
export const rapportsPersonnalises = mysqlTable("rapports_personnalises", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  nom: varchar("nom", { length: 100 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["ventes", "clients", "interventions", "stocks", "fournisseurs", "techniciens", "financier"]).notNull(),
  filtres: json("filtres"), // Filtres JSON (période, client, statut, etc.)
  colonnes: json("colonnes"), // Colonnes à afficher
  groupement: varchar("groupement", { length: 50 }), // Grouper par (jour, semaine, mois, client, etc.)
  tri: varchar("tri", { length: 50 }), // Tri par défaut
  format: mysqlEnum("format", ["tableau", "graphique", "liste"]).default("tableau"),
  graphiqueType: mysqlEnum("graphiqueType", ["bar", "line", "pie", "doughnut"]),
  favori: boolean("favori").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RapportPersonnalise = typeof rapportsPersonnalises.$inferSelect;
export type InsertRapportPersonnalise = typeof rapportsPersonnalises.$inferInsert;

// ============================================================================
// EXECUTIONS DE RAPPORTS (Historique des rapports générés)
// ============================================================================
export const executionsRapports = mysqlTable("executions_rapports", {
  id: int("id").autoincrement().primaryKey(),
  rapportId: int("rapportId").notNull(),
  artisanId: int("artisanId").notNull(),
  dateExecution: timestamp("dateExecution").defaultNow().notNull(),
  parametres: json("parametres"), // Paramètres utilisés pour cette exécution
  resultats: json("resultats"), // Résultats mis en cache
  nombreLignes: int("nombreLignes").default(0),
  tempsExecution: int("tempsExecution"), // En millisecondes
});

export type ExecutionRapport = typeof executionsRapports.$inferSelect;
export type InsertExecutionRapport = typeof executionsRapports.$inferInsert;


// ============================================================================
// NOTIFICATIONS PUSH (Tokens et préférences)
// ============================================================================
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: varchar("userAgent", { length: 255 }),
  actif: boolean("actif").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

// Préférences de notification par technicien
export const preferencesNotifications = mysqlTable("preferences_notifications", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  nouvelleAssignation: boolean("nouvelleAssignation").default(true),
  modificationIntervention: boolean("modificationIntervention").default(true),
  annulationIntervention: boolean("annulationIntervention").default(true),
  rappelIntervention: boolean("rappelIntervention").default(true),
  nouveauMessage: boolean("nouveauMessage").default(true),
  demandeAvis: boolean("demandeAvis").default(false),
  heureDebutNotif: varchar("heureDebutNotif", { length: 5 }).default("08:00"),
  heureFinNotif: varchar("heureFinNotif", { length: 5 }).default("20:00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PreferenceNotification = typeof preferencesNotifications.$inferSelect;
export type InsertPreferenceNotification = typeof preferencesNotifications.$inferInsert;

// Historique des notifications envoyées
export const historiqueNotificationsPush = mysqlTable("historique_notifications_push", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  type: mysqlEnum("type", ["assignation", "modification", "annulation", "rappel", "message", "avis"]).notNull(),
  titre: varchar("titre", { length: 100 }).notNull(),
  corps: text("corps"),
  referenceId: int("referenceId"), // ID de l'intervention, message, etc.
  referenceType: varchar("referenceType", { length: 50 }),
  statut: mysqlEnum("statut", ["envoye", "echec", "lu"]).default("envoye"),
  dateEnvoi: timestamp("dateEnvoi").defaultNow().notNull(),
  dateLecture: timestamp("dateLecture"),
});

export type HistoriqueNotificationPush = typeof historiqueNotificationsPush.$inferSelect;
export type InsertHistoriqueNotificationPush = typeof historiqueNotificationsPush.$inferInsert;

// ============================================================================
// CONGES ET ABSENCES
// ============================================================================
export const conges = mysqlTable("conges", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  artisanId: int("artisanId").notNull(),
  type: mysqlEnum("type", ["conge_paye", "rtt", "maladie", "sans_solde", "formation", "autre"]).notNull(),
  dateDebut: date("dateDebut").notNull(),
  dateFin: date("dateFin").notNull(),
  demiJourneeDebut: boolean("demiJourneeDebut").default(false), // Matin ou après-midi
  demiJourneeFin: boolean("demiJourneeFin").default(false),
  motif: text("motif"),
  statut: mysqlEnum("statut", ["en_attente", "approuve", "refuse", "annule"]).default("en_attente"),
  commentaireValidation: text("commentaireValidation"),
  dateValidation: timestamp("dateValidation"),
  validePar: int("validePar"), // userId de l'artisan qui a validé
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conge = typeof conges.$inferSelect;
export type InsertConge = typeof conges.$inferInsert;

// Solde de congés par technicien et type
export const soldesConges = mysqlTable("soldes_conges", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  artisanId: int("artisanId").notNull(),
  type: mysqlEnum("type", ["conge_paye", "rtt"]).notNull(),
  annee: int("annee").notNull(),
  soldeInitial: decimal("soldeInitial", { precision: 5, scale: 2 }).default("0.00"),
  soldeRestant: decimal("soldeRestant", { precision: 5, scale: 2 }).default("0.00"),
  joursAcquis: decimal("joursAcquis", { precision: 5, scale: 2 }).default("0.00"),
  joursPris: decimal("joursPris", { precision: 5, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SoldeConge = typeof soldesConges.$inferSelect;
export type InsertSoldeConge = typeof soldesConges.$inferInsert;

// ============================================================================
// PREVISIONS DE CA
// ============================================================================
export const previsionsCA = mysqlTable("previsions_ca", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  mois: int("mois").notNull(), // 1-12
  annee: int("annee").notNull(),
  caPrevisionnel: decimal("caPrevisionnel", { precision: 12, scale: 2 }).default("0.00"),
  caRealise: decimal("caRealise", { precision: 12, scale: 2 }).default("0.00"),
  ecart: decimal("ecart", { precision: 12, scale: 2 }).default("0.00"),
  ecartPourcentage: decimal("ecartPourcentage", { precision: 5, scale: 2 }).default("0.00"),
  methodeCalcul: mysqlEnum("methodeCalcul", ["moyenne_mobile", "regression_lineaire", "saisonnalite", "manuel"]).default("moyenne_mobile"),
  confiance: decimal("confiance", { precision: 5, scale: 2 }), // Niveau de confiance 0-100
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PrevisionCA = typeof previsionsCA.$inferSelect;
export type InsertPrevisionCA = typeof previsionsCA.$inferInsert;

// Historique mensuel du CA (pour les calculs de prévision)
export const historiqueCA = mysqlTable("historique_ca", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  mois: int("mois").notNull(),
  annee: int("annee").notNull(),
  caTotal: decimal("caTotal", { precision: 12, scale: 2 }).default("0.00"),
  nombreFactures: int("nombreFactures").default(0),
  nombreClients: int("nombreClients").default(0),
  panierMoyen: decimal("panierMoyen", { precision: 10, scale: 2 }).default("0.00"),
  tauxConversion: decimal("tauxConversion", { precision: 5, scale: 2 }), // Devis signés / Devis envoyés
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoriqueCA = typeof historiqueCA.$inferSelect;
export type InsertHistoriqueCA = typeof historiqueCA.$inferInsert;


// ============================================================================
// GESTION DES VEHICULES
// ============================================================================
export const vehicules = mysqlTable("vehicules", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  immatriculation: varchar("immatriculation", { length: 20 }).notNull(),
  marque: varchar("marque", { length: 100 }),
  modele: varchar("modele", { length: 100 }),
  annee: int("annee"),
  typeCarburant: mysqlEnum("typeCarburant", ["essence", "diesel", "electrique", "hybride", "gpl"]).default("diesel"),
  kilometrageActuel: int("kilometrageActuel").default(0),
  dateAchat: date("dateAchat"),
  prixAchat: decimal("prixAchat", { precision: 10, scale: 2 }),
  technicienId: int("technicienId"), // Technicien assigné
  statut: mysqlEnum("statut", ["actif", "en_maintenance", "hors_service", "vendu"]).default("actif"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Vehicule = typeof vehicules.$inferSelect;
export type InsertVehicule = typeof vehicules.$inferInsert;

// Historique kilométrique
export const historiqueKilometrage = mysqlTable("historique_kilometrage", {
  id: int("id").autoincrement().primaryKey(),
  vehiculeId: int("vehiculeId").notNull(),
  technicienId: int("technicienId"),
  kilometrage: int("kilometrage").notNull(),
  dateReleve: date("dateReleve").notNull(),
  motif: varchar("motif", { length: 255 }), // Ex: "Intervention client", "Déplacement personnel"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoriqueKilometrage = typeof historiqueKilometrage.$inferSelect;
export type InsertHistoriqueKilometrage = typeof historiqueKilometrage.$inferInsert;

// Entretiens véhicules
export const entretiensVehicules = mysqlTable("entretiens_vehicules", {
  id: int("id").autoincrement().primaryKey(),
  vehiculeId: int("vehiculeId").notNull(),
  type: mysqlEnum("type", ["vidange", "pneus", "freins", "controle_technique", "revision", "reparation", "autre"]).notNull(),
  dateEntretien: date("dateEntretien").notNull(),
  kilometrageEntretien: int("kilometrageEntretien"),
  cout: decimal("cout", { precision: 10, scale: 2 }),
  prestataire: varchar("prestataire", { length: 255 }),
  description: text("description"),
  prochainEntretienKm: int("prochainEntretienKm"),
  prochainEntretienDate: date("prochainEntretienDate"),
  facture: text("facture"), // URL du document
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EntretienVehicule = typeof entretiensVehicules.$inferSelect;
export type InsertEntretienVehicule = typeof entretiensVehicules.$inferInsert;

// Assurances véhicules
export const assurancesVehicules = mysqlTable("assurances_vehicules", {
  id: int("id").autoincrement().primaryKey(),
  vehiculeId: int("vehiculeId").notNull(),
  compagnie: varchar("compagnie", { length: 255 }).notNull(),
  numeroContrat: varchar("numeroContrat", { length: 100 }),
  typeAssurance: mysqlEnum("typeAssurance", ["tiers", "tiers_plus", "tous_risques"]).default("tiers"),
  dateDebut: date("dateDebut").notNull(),
  dateFin: date("dateFin").notNull(),
  primeAnnuelle: decimal("primeAnnuelle", { precision: 10, scale: 2 }),
  franchise: decimal("franchise", { precision: 10, scale: 2 }),
  document: text("document"), // URL du contrat
  alerteEnvoyee: boolean("alerteEnvoyee").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AssuranceVehicule = typeof assurancesVehicules.$inferSelect;
export type InsertAssuranceVehicule = typeof assurancesVehicules.$inferInsert;

// ============================================================================
// BADGES ET GAMIFICATION
// ============================================================================
export const badges = mysqlTable("badges", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  code: varchar("code", { length: 50 }).notNull(), // Ex: "first_intervention", "100_interventions"
  nom: varchar("nom", { length: 100 }).notNull(),
  description: text("description"),
  icone: varchar("icone", { length: 50 }), // Nom de l'icône
  couleur: varchar("couleur", { length: 20 }), // Couleur du badge
  categorie: mysqlEnum("categorie", ["interventions", "avis", "ca", "anciennete", "special"]).default("interventions"),
  condition: text("condition"), // Description de la condition
  seuil: int("seuil"), // Valeur à atteindre
  points: int("points").default(10), // Points attribués
  actif: boolean("actif").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Badge = typeof badges.$inferSelect;
export type InsertBadge = typeof badges.$inferInsert;

// Badges obtenus par les techniciens
export const badgesTechniciens = mysqlTable("badges_techniciens", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  badgeId: int("badgeId").notNull(),
  dateObtention: timestamp("dateObtention").defaultNow().notNull(),
  valeurAtteinte: int("valeurAtteinte"), // Valeur au moment de l'obtention
  notifie: boolean("notifie").default(false),
});

export type BadgeTechnicien = typeof badgesTechniciens.$inferSelect;
export type InsertBadgeTechnicien = typeof badgesTechniciens.$inferInsert;

// Objectifs mensuels
export const objectifsTechniciens = mysqlTable("objectifs_techniciens", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  artisanId: int("artisanId").notNull(),
  mois: int("mois").notNull(),
  annee: int("annee").notNull(),
  objectifInterventions: int("objectifInterventions").default(0),
  objectifCA: decimal("objectifCA", { precision: 10, scale: 2 }).default("0.00"),
  objectifAvisPositifs: int("objectifAvisPositifs").default(0),
  interventionsRealisees: int("interventionsRealisees").default(0),
  caRealise: decimal("caRealise", { precision: 10, scale: 2 }).default("0.00"),
  avisPositifsObtenus: int("avisPositifsObtenus").default(0),
  pointsGagnes: int("pointsGagnes").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ObjectifTechnicien = typeof objectifsTechniciens.$inferSelect;
export type InsertObjectifTechnicien = typeof objectifsTechniciens.$inferInsert;

// Classement des techniciens
export const classementTechniciens = mysqlTable("classement_techniciens", {
  id: int("id").autoincrement().primaryKey(),
  technicienId: int("technicienId").notNull(),
  artisanId: int("artisanId").notNull(),
  periode: mysqlEnum("periode", ["semaine", "mois", "trimestre", "annee"]).notNull(),
  dateDebut: date("dateDebut").notNull(),
  dateFin: date("dateFin").notNull(),
  rang: int("rang").notNull(),
  pointsTotal: int("pointsTotal").default(0),
  interventions: int("interventions").default(0),
  ca: decimal("ca", { precision: 10, scale: 2 }).default("0.00"),
  noteMoyenne: decimal("noteMoyenne", { precision: 3, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClassementTechnicien = typeof classementTechniciens.$inferSelect;
export type InsertClassementTechnicien = typeof classementTechniciens.$inferInsert;

// ============================================================================
// ALERTES ECARTS PREVISIONS CA
// ============================================================================
export const configAlertesPrevisions = mysqlTable("config_alertes_previsions", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull().unique(),
  seuilAlertePositif: decimal("seuilAlertePositif", { precision: 5, scale: 2 }).default("10.00"), // +10%
  seuilAlerteNegatif: decimal("seuilAlerteNegatif", { precision: 5, scale: 2 }).default("10.00"), // -10%
  alerteEmail: boolean("alerteEmail").default(true),
  alerteSms: boolean("alerteSms").default(false),
  emailDestination: varchar("emailDestination", { length: 320 }),
  telephoneDestination: varchar("telephoneDestination", { length: 20 }),
  frequenceVerification: mysqlEnum("frequenceVerification", ["quotidien", "hebdomadaire", "mensuel"]).default("hebdomadaire"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConfigAlertePrevision = typeof configAlertesPrevisions.$inferSelect;
export type InsertConfigAlertePrevision = typeof configAlertesPrevisions.$inferInsert;

// Historique des alertes envoyées
export const historiqueAlertesPrevisions = mysqlTable("historique_alertes_previsions", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  mois: int("mois").notNull(),
  annee: int("annee").notNull(),
  typeAlerte: mysqlEnum("typeAlerte", ["depassement_positif", "depassement_negatif"]).notNull(),
  caPrevisionnel: decimal("caPrevisionnel", { precision: 12, scale: 2 }),
  caRealise: decimal("caRealise", { precision: 12, scale: 2 }),
  ecartPourcentage: decimal("ecartPourcentage", { precision: 5, scale: 2 }),
  canalEnvoi: mysqlEnum("canalEnvoi", ["email", "sms", "les_deux"]).notNull(),
  dateEnvoi: timestamp("dateEnvoi").defaultNow().notNull(),
  statut: mysqlEnum("statut", ["envoye", "echec", "lu"]).default("envoye"),
  message: text("message"),
});

export type HistoriqueAlertePrevision = typeof historiqueAlertesPrevisions.$inferSelect;
export type InsertHistoriqueAlertePrevision = typeof historiqueAlertesPrevisions.$inferInsert;


// ============================================================================
// CHANTIERS MULTI-INTERVENTIONS
// ============================================================================
export const chantiers = mysqlTable("chantiers", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  clientId: int("clientId").notNull(),
  reference: varchar("reference", { length: 50 }).notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  adresse: text("adresse"),
  codePostal: varchar("codePostal", { length: 10 }),
  ville: varchar("ville", { length: 100 }),
  dateDebut: date("dateDebut"),
  dateFinPrevue: date("dateFinPrevue"),
  dateFinReelle: date("dateFinReelle"),
  budgetPrevisionnel: decimal("budgetPrevisionnel", { precision: 12, scale: 2 }),
  budgetRealise: decimal("budgetRealise", { precision: 12, scale: 2 }).default("0.00"),
  statut: mysqlEnum("statut", ["planifie", "en_cours", "en_pause", "termine", "annule"]).default("planifie"),
  avancement: int("avancement").default(0), // Pourcentage 0-100
  priorite: mysqlEnum("priorite", ["basse", "normale", "haute", "urgente"]).default("normale"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Chantier = typeof chantiers.$inferSelect;
export type InsertChantier = typeof chantiers.$inferInsert;

// Phases d'un chantier
export const phasesChantier = mysqlTable("phases_chantier", {
  id: int("id").autoincrement().primaryKey(),
  chantierId: int("chantierId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  ordre: int("ordre").default(1),
  dateDebutPrevue: date("dateDebutPrevue"),
  dateFinPrevue: date("dateFinPrevue"),
  dateDebutReelle: date("dateDebutReelle"),
  dateFinReelle: date("dateFinReelle"),
  statut: mysqlEnum("statut", ["a_faire", "en_cours", "termine", "annule"]).default("a_faire"),
  avancement: int("avancement").default(0),
  budgetPhase: decimal("budgetPhase", { precision: 10, scale: 2 }),
  coutReel: decimal("coutReel", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PhaseChantier = typeof phasesChantier.$inferSelect;
export type InsertPhaseChantier = typeof phasesChantier.$inferInsert;

// Association interventions-chantiers
export const interventionsChantier = mysqlTable("interventions_chantier", {
  id: int("id").autoincrement().primaryKey(),
  chantierId: int("chantierId").notNull(),
  interventionId: int("interventionId").notNull(),
  phaseId: int("phaseId"), // Optionnel: lié à une phase spécifique
  ordre: int("ordre").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InterventionChantier = typeof interventionsChantier.$inferSelect;
export type InsertInterventionChantier = typeof interventionsChantier.$inferInsert;

// Documents du chantier
export const documentsChantier = mysqlTable("documents_chantier", {
  id: int("id").autoincrement().primaryKey(),
  chantierId: int("chantierId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["plan", "photo", "permis", "contrat", "facture", "autre"]).default("autre"),
  url: text("url").notNull(),
  taille: int("taille"), // En octets
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});

export type DocumentChantier = typeof documentsChantier.$inferSelect;
export type InsertDocumentChantier = typeof documentsChantier.$inferInsert;

// ============================================================================
// INTEGRATIONS COMPTABLES
// ============================================================================
export const configurationsComptables = mysqlTable("configurations_comptables", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull().unique(),
  logiciel: mysqlEnum("logiciel", ["sage", "quickbooks", "ciel", "ebp", "autre"]).default("sage"),
  formatExport: mysqlEnum("formatExport", ["fec", "iif", "qbo", "csv"]).default("fec"),
  // Comptes comptables
  compteVentes: varchar("compteVentes", { length: 20 }).default("706000"),
  compteTVACollectee: varchar("compteTVACollectee", { length: 20 }).default("445710"),
  compteClients: varchar("compteClients", { length: 20 }).default("411000"),
  compteAchats: varchar("compteAchats", { length: 20 }).default("607000"),
  compteTVADeductible: varchar("compteTVADeductible", { length: 20 }).default("445660"),
  compteFournisseurs: varchar("compteFournisseurs", { length: 20 }).default("401000"),
  compteBanque: varchar("compteBanque", { length: 20 }).default("512000"),
  compteCaisse: varchar("compteCaisse", { length: 20 }).default("530000"),
  // Journaux
  journalVentes: varchar("journalVentes", { length: 10 }).default("VE"),
  journalAchats: varchar("journalAchats", { length: 10 }).default("AC"),
  journalBanque: varchar("journalBanque", { length: 10 }).default("BQ"),
  // Paramètres
  prefixeFacture: varchar("prefixeFacture", { length: 10 }).default("FA"),
  prefixeAvoir: varchar("prefixeAvoir", { length: 10 }).default("AV"),
  exerciceDebut: int("exerciceDebut").default(1), // Mois de début d'exercice
  actif: boolean("actif").default(true),
  // Synchronisation automatique
  syncAutoFactures: boolean("syncAutoFactures").default(false),
  syncAutoPaiements: boolean("syncAutoPaiements").default(false),
  frequenceSync: mysqlEnum("frequenceSync", ["quotidien", "hebdomadaire", "mensuel", "manuel"]).default("manuel"),
  heureSync: varchar("heureSync", { length: 5 }).default("02:00"),
  notifierErreurs: boolean("notifierErreurs").default(true),
  notifierSucces: boolean("notifierSucces").default(false),
  derniereSync: timestamp("derniereSync"),
  prochainSync: timestamp("prochainSync"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConfigurationComptable = typeof configurationsComptables.$inferSelect;
export type InsertConfigurationComptable = typeof configurationsComptables.$inferInsert;

// Historique des exports comptables
export const exportsComptables = mysqlTable("exports_comptables", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  logiciel: mysqlEnum("logiciel", ["sage", "quickbooks", "ciel", "ebp", "autre"]).notNull(),
  formatExport: mysqlEnum("formatExport", ["fec", "iif", "qbo", "csv"]).notNull(),
  periodeDebut: date("periodeDebut").notNull(),
  periodeFin: date("periodeFin").notNull(),
  nombreEcritures: int("nombreEcritures").default(0),
  montantTotal: decimal("montantTotal", { precision: 12, scale: 2 }),
  fichierUrl: text("fichierUrl"),
  statut: mysqlEnum("statut", ["en_cours", "termine", "erreur"]).default("en_cours"),
  erreur: text("erreur"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExportComptable = typeof exportsComptables.$inferSelect;
export type InsertExportComptable = typeof exportsComptables.$inferInsert;

// ============================================================================
// DEVIS AUTOMATIQUE PAR IA
// ============================================================================
export const analysesPhotosChantier = mysqlTable("analyses_photos_chantier", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  clientId: int("clientId"),
  titre: varchar("titre", { length: 255 }),
  description: text("description"),
  statut: mysqlEnum("statut", ["en_attente", "en_cours", "termine", "erreur"]).default("en_attente"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnalysePhotoChantier = typeof analysesPhotosChantier.$inferSelect;
export type InsertAnalysePhotoChantier = typeof analysesPhotosChantier.$inferInsert;

// Photos uploadées pour analyse
export const photosAnalyse = mysqlTable("photos_analyse", {
  id: int("id").autoincrement().primaryKey(),
  analyseId: int("analyseId").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  ordre: int("ordre").default(1),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});

export type PhotoAnalyse = typeof photosAnalyse.$inferSelect;
export type InsertPhotoAnalyse = typeof photosAnalyse.$inferInsert;

// Résultats de l'analyse IA
export const resultatsAnalyseIA = mysqlTable("resultats_analyse_ia", {
  id: int("id").autoincrement().primaryKey(),
  analyseId: int("analyseId").notNull(),
  typeTravauxDetecte: varchar("typeTravauxDetecte", { length: 255 }),
  descriptionTravaux: text("descriptionTravaux"),
  urgence: mysqlEnum("urgence", ["faible", "moyenne", "haute", "critique"]).default("moyenne"),
  confiance: decimal("confiance", { precision: 5, scale: 2 }), // Score de confiance 0-100
  rawResponse: json("rawResponse"), // Réponse brute de l'IA
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ResultatAnalyseIA = typeof resultatsAnalyseIA.$inferSelect;
export type InsertResultatAnalyseIA = typeof resultatsAnalyseIA.$inferInsert;

// Suggestions d'articles par l'IA
export const suggestionsArticlesIA = mysqlTable("suggestions_articles_ia", {
  id: int("id").autoincrement().primaryKey(),
  resultatId: int("resultatId").notNull(),
  articleId: int("articleId"), // Si correspondance trouvée dans la bibliothèque
  nomArticle: varchar("nomArticle", { length: 255 }).notNull(),
  description: text("description"),
  quantiteSuggeree: decimal("quantiteSuggeree", { precision: 10, scale: 2 }).default("1.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixEstime: decimal("prixEstime", { precision: 10, scale: 2 }),
  confiance: decimal("confiance", { precision: 5, scale: 2 }),
  selectionne: boolean("selectionne").default(true), // Pour permettre à l'utilisateur de désélectionner
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SuggestionArticleIA = typeof suggestionsArticlesIA.$inferSelect;
export type InsertSuggestionArticleIA = typeof suggestionsArticlesIA.$inferInsert;

// Devis générés à partir de l'analyse IA
export const devisGenereIA = mysqlTable("devis_genere_ia", {
  id: int("id").autoincrement().primaryKey(),
  analyseId: int("analyseId").notNull(),
  devisId: int("devisId"), // Lien vers le devis créé
  montantEstime: decimal("montantEstime", { precision: 12, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DevisGenereIA = typeof devisGenereIA.$inferSelect;
export type InsertDevisGenereIA = typeof devisGenereIA.$inferInsert;


// ============================================================================
// PREFERENCES COULEURS CALENDRIER
// ============================================================================
export const preferencesCouleursCalendrier = mysqlTable("preferences_couleurs_calendrier", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  interventionId: int("interventionId").notNull(),
  couleur: varchar("couleur", { length: 50 }).notNull(), // ex: "bg-blue-500"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PreferenceCouleurCalendrier = typeof preferencesCouleursCalendrier.$inferSelect;
export type InsertPreferenceCouleurCalendrier = typeof preferencesCouleursCalendrier.$inferInsert;


// ============================================================================
// CONFIGURATION RELANCES AUTOMATIQUES
// ============================================================================
export const configRelancesAuto = mysqlTable("config_relances_auto", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull().unique(),
  actif: boolean("actif").default(false),
  joursApresEnvoi: int("joursApresEnvoi").default(7),
  joursEntreRelances: int("joursEntreRelances").default(7),
  nombreMaxRelances: int("nombreMaxRelances").default(3),
  heureEnvoi: varchar("heureEnvoi", { length: 5 }).default("09:00"),
  joursEnvoi: varchar("joursEnvoi", { length: 50 }).default("1,2,3,4,5"), // jours de la semaine (1=lundi, 7=dimanche)
  modeleEmailId: int("modeleEmailId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConfigRelancesAuto = typeof configRelancesAuto.$inferSelect;
export type InsertConfigRelancesAuto = typeof configRelancesAuto.$inferInsert;


// ============================================================================
// MODELES DEVIS (Reusable quote templates)
// ============================================================================
export const modelesDevis = mysqlTable("modeles_devis", {
  id: int("id").autoincrement().primaryKey(),
  artisanId: int("artisanId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  notes: text("notes"),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModeleDevis = typeof modelesDevis.$inferSelect;
export type InsertModeleDevis = typeof modelesDevis.$inferInsert;

// ============================================================================
// MODELES DEVIS LIGNES (Line items for quote templates)
// ============================================================================
export const modelesDevisLignes = mysqlTable("modeles_devis_lignes", {
  id: int("id").autoincrement().primaryKey(),
  modeleId: int("modeleId").notNull(),
  articleId: int("articleId"),
  designation: varchar("designation", { length: 255 }).notNull(),
  description: text("description"),
  quantite: decimal("quantite", { precision: 10, scale: 2 }).default("1.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: decimal("prixUnitaireHT", { precision: 10, scale: 2 }).default("0.00"),
  tauxTVA: decimal("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  remise: decimal("remise", { precision: 5, scale: 2 }).default("0.00"),
  ordre: int("ordre").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModeleDevisLigne = typeof modelesDevisLignes.$inferSelect;
export type InsertModeleDevisLigne = typeof modelesDevisLignes.$inferInsert;


// ============================================================================
// LUCIA AUTH SESSIONS TABLE
// ============================================================================
export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;
