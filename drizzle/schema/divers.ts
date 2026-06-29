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
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { artisans } from "./artisans";
import { users } from "./users";
import { alerteEnvoiStatutEnum } from "./rh";
import { interventions } from "./contrats";

export const stockArticleTypeEnum = pgEnum("stock_article_type", ["bibliotheque", "artisan"]);
export const mouvementTypeEnum = pgEnum("mouvement_type", ["entree", "sortie", "ajustement"]);
export const commandeStatutEnum = pgEnum("commande_statut", ["brouillon", "envoyee", "confirmee", "partiellement_livree", "livree", "annulee"]);
export const commandeStatutFacturationEnum = pgEnum("commande_statut_facturation", ["a_facturer", "facturee"]);
export const chantierStatutEnum = pgEnum("chantier_statut", ["planifie", "en_cours", "en_pause", "termine", "annule"]);
export const chantierPrioriteEnum = pgEnum("chantier_priorite", ["basse", "normale", "haute", "urgente"]);
export const phaseStatutEnum = pgEnum("phase_statut", ["a_faire", "en_cours", "termine", "annule"]);
export const documentChantierTypeEnum = pgEnum("document_chantier_type", ["plan", "photo", "permis", "contrat", "facture", "autre"]);
export const activiteTypeEnum = pgEnum("activite_type", ["appel", "email", "rdv", "relance", "autre"]);
export const activiteEntiteTypeEnum = pgEnum("activite_entite_type", ["client", "devis", "facture", "chantier", "aucun"]);
export const notificationTypeEnum = pgEnum("notification_type", ["info", "alerte", "rappel", "succes", "erreur"]);
export const avisStatutEnum = pgEnum("avis_statut", ["en_attente", "publie", "masque"]);
export const demandeContactStatutEnum = pgEnum("demande_contact_statut", ["nouveau", "contacte", "converti", "perdu"]);
export const demandeAvisStatutEnum = pgEnum("demande_avis_statut", ["envoyee", "ouverte", "completee", "expiree"]);
export const badgeCategorieEnum = pgEnum("badge_categorie", ["interventions", "avis", "ca", "anciennete", "special"]);
export const alerteFrequenceEnum = pgEnum("alerte_frequence", ["quotidien", "hebdomadaire", "mensuel"]);
export const alerteTypeEnum = pgEnum("alerte_type", ["depassement_positif", "depassement_negatif"]);
export const alerteCanalEnum = pgEnum("alerte_canal", ["email", "sms", "les_deux"]);
export const suiviStatutEnum = pgEnum("suivi_statut", ["a_faire", "en_cours", "termine"]);
export const analyseStatutEnum = pgEnum("analyse_statut", ["en_attente", "en_cours", "termine", "erreur"]);
export const conversationStatutEnum = pgEnum("conversation_statut", ["ouverte", "fermee", "archivee"]);
export const messageAuteurEnum = pgEnum("message_auteur", ["artisan", "client"]);
export const rapportTypeEnum = pgEnum("rapport_type", ["ventes", "clients", "interventions", "stocks", "fournisseurs", "techniciens", "financier"]);
export const rapportFormatEnum = pgEnum("rapport_format", ["tableau", "graphique", "liste"]);
export const rapportGraphiqueTypeEnum = pgEnum("rapport_graphique_type", ["bar", "line", "pie", "doughnut"]);
export const analyseUrgenceEnum = pgEnum("analyse_urgence", ["faible", "moyenne", "haute", "critique"]);

export const bibliothequeArticles = pgTable("bibliotheque_articles", {
  id: serial("id").primaryKey(),
  metier: varchar("metier", { length: 50 }).notNull(),
  categorie: varchar("categorie", { length: 50 }).notNull(),
  sous_categorie: varchar("sous_categorie", { length: 100 }).notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  prix_base: numeric("prix_base", { precision: 10, scale: 2 }).notNull(),
  unite: varchar("unite", { length: 50 }).notNull(),
  tauxTVA: numeric("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  prixRevient: numeric("prixRevient", { precision: 10, scale: 2 }),
  duree_moyenne_minutes: integer("duree_moyenne_minutes"),
  visible: boolean("visible").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});
export type BibliothequeArticle = typeof bibliothequeArticles.$inferSelect;
export type InsertBibliothequeArticle = typeof bibliothequeArticles.$inferInsert;

export const articlesArtisan = pgTable("articles_artisan", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  reference: varchar("reference", { length: 50 }).notNull(),
  designation: varchar("designation", { length: 500 }).notNull(),
  description: text("description"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaireHT: numeric("prixUnitaireHT", { precision: 10, scale: 2 }).notNull(),
  tauxTVA: numeric("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  prixRevientHT: numeric("prixRevientHT", { precision: 10, scale: 2 }),
  categorie: varchar("categorie", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ArticleArtisan = typeof articlesArtisan.$inferSelect;
export type InsertArticleArtisan = typeof articlesArtisan.$inferInsert;

export const articlesFournisseurs = pgTable("articles_fournisseurs", {
  id: serial("id").primaryKey(),
  articleId: integer("articleId").notNull(),
  fournisseurId: integer("fournisseurId").notNull(),
  referenceExterne: varchar("referenceExterne", { length: 100 }),
  prixAchat: numeric("prixAchat", { precision: 10, scale: 2 }),
  delaiLivraison: integer("delaiLivraison"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ArticleFournisseur = typeof articlesFournisseurs.$inferSelect;
export type InsertArticleFournisseur = typeof articlesFournisseurs.$inferInsert;

export const stocks = pgTable("stocks", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  articleId: integer("articleId"),
  articleType: stockArticleTypeEnum("articleType").default("bibliotheque"),
  reference: varchar("reference", { length: 50 }).notNull(),
  designation: varchar("designation", { length: 500 }).notNull(),
  quantiteEnStock: numeric("quantiteEnStock", { precision: 10, scale: 2 }).default("0.00"),
  seuilAlerte: numeric("seuilAlerte", { precision: 10, scale: 2 }).default("5.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixAchat: numeric("prixAchat", { precision: 10, scale: 2 }),
  emplacement: varchar("emplacement", { length: 100 }),
  fournisseur: varchar("fournisseur", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type Stock = typeof stocks.$inferSelect;
export type InsertStock = typeof stocks.$inferInsert;

export const mouvementsStock = pgTable("mouvements_stock", {
  id: serial("id").primaryKey(),
  stockId: integer("stockId").notNull(),
  type: mouvementTypeEnum("type").notNull(),
  quantite: numeric("quantite", { precision: 10, scale: 2 }).notNull(),
  quantiteAvant: numeric("quantiteAvant", { precision: 10, scale: 2 }).notNull(),
  quantiteApres: numeric("quantiteApres", { precision: 10, scale: 2 }).notNull(),
  motif: text("motif"),
  reference: varchar("reference", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MouvementStock = typeof mouvementsStock.$inferSelect;
export type InsertMouvementStock = typeof mouvementsStock.$inferInsert;

export const inventaireStatutEnum = pgEnum("inventaire_statut", ["brouillon", "valide"]);

export const inventaires = pgTable("inventaires", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  date: date("date").defaultNow().notNull(),
  statut: inventaireStatutEnum("statut").default("brouillon").notNull(),
  note: text("note"),
  valeurEcart: numeric("valeurEcart", { precision: 12, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type Inventaire = typeof inventaires.$inferSelect;
export type InsertInventaire = typeof inventaires.$inferInsert;

export const inventairesLignes = pgTable("inventaires_lignes", {
  id: serial("id").primaryKey(),
  inventaireId: integer("inventaireId").notNull(),
  stockId: integer("stockId").notNull(),
  reference: varchar("reference", { length: 50 }).notNull(),
  designation: varchar("designation", { length: 500 }).notNull(),
  unite: varchar("unite", { length: 20 }).notNull().default("unité"),
  quantiteTheorique: numeric("quantiteTheorique", { precision: 10, scale: 2 }).notNull(),
  quantiteReelle: numeric("quantiteReelle", { precision: 10, scale: 2 }),
  ecart: numeric("ecart", { precision: 10, scale: 2 }),
});
export type InventaireLigne = typeof inventairesLignes.$inferSelect;
export type InsertInventaireLigne = typeof inventairesLignes.$inferInsert;

export const fournisseurs = pgTable("fournisseurs", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  contact: varchar("contact", { length: 255 }),
  email: varchar("email", { length: 320 }),
  telephone: varchar("telephone", { length: 20 }),
  adresse: text("adresse"),
  codePostal: varchar("codePostal", { length: 10 }),
  ville: varchar("ville", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("idx_fournisseurs_artisan").on(t.artisanId),
]);
export type Fournisseur = typeof fournisseurs.$inferSelect;
export type InsertFournisseur = typeof fournisseurs.$inferInsert;

export const commandesFournisseurs = pgTable("commandes_fournisseurs", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  fournisseurId: integer("fournisseurId").notNull(),
  numero: varchar("numero", { length: 20 }),
  reference: varchar("reference", { length: 50 }),
  dateCommande: timestamp("dateCommande").defaultNow().notNull(),
  dateLivraisonPrevue: timestamp("dateLivraisonPrevue"),
  dateLivraisonReelle: timestamp("dateLivraisonReelle"),
  statut: commandeStatutEnum("statut").default("brouillon"),
  montantTotal: numeric("montantTotal", { precision: 10, scale: 2 }),
  totalHT: numeric("totalHT", { precision: 10, scale: 2 }),
  totalTVA: numeric("totalTVA", { precision: 10, scale: 2 }),
  totalTTC: numeric("totalTTC", { precision: 10, scale: 2 }),
  delaiLivraison: varchar("delaiLivraison", { length: 100 }),
  adresseLivraison: text("adresseLivraison"),
  notes: text("notes"),
  statutFacturation: commandeStatutFacturationEnum("statutFacturation").default("a_facturer"),
  depenseId: integer("depenseId"),
  alerteRetardEnvoyee: boolean("alerteRetardEnvoyee").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => [
  index("idx_commandes_fournisseurs_artisan").on(t.artisanId),
]);
export type CommandeFournisseur = typeof commandesFournisseurs.$inferSelect;
export type InsertCommandeFournisseur = typeof commandesFournisseurs.$inferInsert;

export const lignesCommandesFournisseurs = pgTable("lignes_commandes_fournisseurs", {
  id: serial("id").primaryKey(),
  commandeId: integer("commandeId").notNull(),
  articleId: integer("articleId"),
  stockId: integer("stockId"),
  designation: varchar("designation", { length: 255 }).notNull(),
  reference: varchar("reference", { length: 50 }),
  quantite: numeric("quantite", { precision: 10, scale: 2 }).notNull(),
  quantiteRecue: numeric("quantiteRecue", { precision: 10, scale: 2 }).default("0.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixUnitaire: numeric("prixUnitaire", { precision: 10, scale: 2 }),
  tauxTVA: numeric("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  montantTotal: numeric("montantTotal", { precision: 10, scale: 2 }),
});
export type LigneCommandeFournisseur = typeof lignesCommandesFournisseurs.$inferSelect;
export type InsertLigneCommandeFournisseur = typeof lignesCommandesFournisseurs.$inferInsert;

export const chantiers = pgTable("chantiers", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId").notNull(),
  reference: varchar("reference", { length: 50 }).notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  adresse: text("adresse"),
  codePostal: varchar("codePostal", { length: 10 }),
  ville: varchar("ville", { length: 100 }),
  dateDebut: date("dateDebut"),
  dateFinPrevue: date("dateFinPrevue"),
  dateFinReelle: date("dateFinReelle"),
  budgetPrevisionnel: numeric("budgetPrevisionnel", { precision: 12, scale: 2 }),
  budgetRealise: numeric("budgetRealise", { precision: 12, scale: 2 }).default("0.00"),
  statut: chantierStatutEnum("statut").default("planifie"),
  avancement: integer("avancement").default(0),
  priorite: chantierPrioriteEnum("priorite").default("normale"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("idx_chantiers_artisan").on(t.artisanId),
]);
export type Chantier = typeof chantiers.$inferSelect;
export type InsertChantier = typeof chantiers.$inferInsert;

export const phasesChantier = pgTable("phases_chantier", {
  id: serial("id").primaryKey(),
  chantierId: integer("chantierId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  ordre: integer("ordre").default(1),
  dateDebutPrevue: date("dateDebutPrevue"),
  dateFinPrevue: date("dateFinPrevue"),
  dateDebutReelle: date("dateDebutReelle"),
  dateFinReelle: date("dateFinReelle"),
  statut: phaseStatutEnum("statut").default("a_faire"),
  avancement: integer("avancement").default(0),
  budgetPhase: numeric("budgetPhase", { precision: 10, scale: 2 }),
  coutReel: numeric("coutReel", { precision: 10, scale: 2 }).default("0.00"),
  heuresPrevues: numeric("heuresPrevues", { precision: 7, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PhaseChantier = typeof phasesChantier.$inferSelect;
export type InsertPhaseChantier = typeof phasesChantier.$inferInsert;

export const documentsChantier = pgTable("documents_chantier", {
  id: serial("id").primaryKey(),
  chantierId: integer("chantierId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  type: documentChantierTypeEnum("type").default("autre"),
  url: text("url").notNull(),
  taille: integer("taille"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type DocumentChantier = typeof documentsChantier.$inferSelect;
export type InsertDocumentChantier = typeof documentsChantier.$inferInsert;

export const pointagesChantier = pgTable("pointages_chantier", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  chantierId: integer("chantierId").notNull(),
  phaseId: integer("phaseId"),
  technicienId: integer("technicienId"),
  date: date("date").notNull(),
  heures: numeric("heures", { precision: 6, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PointageChantier = typeof pointagesChantier.$inferSelect;
export type InsertPointageChantier = typeof pointagesChantier.$inferInsert;

export const suiviChantier = pgTable("suivi_chantier", {
  id: serial("id").primaryKey(),
  chantierId: integer("chantierId").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  statut: suiviStatutEnum("statut").default("a_faire"),
  pourcentage: integer("pourcentage").default(0),
  ordre: integer("ordre").default(1),
  visibleClient: boolean("visibleClient").default(true),
  dateDebut: date("dateDebut"),
  dateFin: date("dateFin"),
  commentaire: text("commentaire"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type SuiviChantier = typeof suiviChantier.$inferSelect;
export type InsertSuiviChantier = typeof suiviChantier.$inferInsert;

export const analysesPhotosChantier = pgTable("analyses_photos_chantier", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId"),
  titre: varchar("titre", { length: 255 }),
  description: text("description"),
  statut: analyseStatutEnum("statut").default("en_attente"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type AnalysePhotoChantier = typeof analysesPhotosChantier.$inferSelect;
export type InsertAnalysePhotoChantier = typeof analysesPhotosChantier.$inferInsert;

export const activites = pgTable("activites", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  type: activiteTypeEnum("type").default("autre").notNull(),
  titre: varchar("titre", { length: 500 }).notNull(),
  echeance: date("echeance").notNull(),
  entiteType: activiteEntiteTypeEnum("entiteType").default("aucun"),
  entiteId: integer("entiteId"),
  responsableUserId: integer("responsableUserId"),
  fait: boolean("fait").default(false).notNull(),
  faitAt: timestamp("faitAt"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Activite = typeof activites.$inferSelect;
export type InsertActivite = typeof activites.$inferInsert;

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  type: notificationTypeEnum("type").default("info"),
  titre: varchar("titre", { length: 255 }).notNull(),
  message: text("message"),
  lien: varchar("lien", { length: 500 }),
  lu: boolean("lu").default(false),
  archived: boolean("archived").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export const avisClients = pgTable("avis_clients", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId").notNull(),
  interventionId: integer("interventionId"),
  note: integer("note").notNull(),
  commentaire: text("commentaire"),
  tokenAvis: varchar("tokenAvis", { length: 64 }).unique(),
  reponseArtisan: text("reponseArtisan"),
  reponseAt: timestamp("reponseAt"),
  statut: avisStatutEnum("statut").default("en_attente"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type AvisClient = typeof avisClients.$inferSelect;
export type InsertAvisClient = typeof avisClients.$inferInsert;

export const demandesContact = pgTable("demandes_contact", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  nom: varchar("nom", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }),
  telephone: varchar("telephone", { length: 30 }),
  message: text("message"),
  source: varchar("source", { length: 50 }).default("vitrine"),
  statut: demandeContactStatutEnum("statut").default("nouveau"),
  clientId: integer("clientId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type DemandeContact = typeof demandesContact.$inferSelect;
export type InsertDemandeContact = typeof demandesContact.$inferInsert;

export const demandesAvis = pgTable("demandes_avis", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId").notNull(),
  interventionId: integer("interventionId").notNull().references(() => interventions.id, { onDelete: "cascade" }),
  tokenDemande: varchar("tokenDemande", { length: 64 }).notNull().unique(),
  emailEnvoyeAt: timestamp("emailEnvoyeAt"),
  avisRecuAt: timestamp("avisRecuAt"),
  statut: demandeAvisStatutEnum("statut").default("envoyee"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DemandeAvis = typeof demandesAvis.$inferSelect;
export type InsertDemandeAvis = typeof demandesAvis.$inferInsert;

export const badges = pgTable("badges", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  nom: varchar("nom", { length: 100 }).notNull(),
  description: text("description"),
  icone: varchar("icone", { length: 50 }),
  couleur: varchar("couleur", { length: 20 }),
  categorie: badgeCategorieEnum("categorie").default("interventions"),
  condition: text("condition"),
  seuil: integer("seuil"),
  points: integer("points").default(10),
  actif: boolean("actif").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Badge = typeof badges.$inferSelect;
export type InsertBadge = typeof badges.$inferInsert;

export const badgesTechniciens = pgTable("badges_techniciens", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  badgeId: integer("badgeId").notNull(),
  dateObtention: timestamp("dateObtention").defaultNow().notNull(),
  valeurAtteinte: integer("valeurAtteinte"),
  notifie: boolean("notifie").default(false),
});
export type BadgeTechnicien = typeof badgesTechniciens.$inferSelect;
export type InsertBadgeTechnicien = typeof badgesTechniciens.$inferInsert;

export const configAlertesPrevisions = pgTable("config_alertes_previsions", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull().unique(),
  seuilAlertePositif: numeric("seuilAlertePositif", { precision: 5, scale: 2 }).default("10.00"),
  seuilAlerteNegatif: numeric("seuilAlerteNegatif", { precision: 5, scale: 2 }).default("10.00"),
  alerteEmail: boolean("alerteEmail").default(true),
  alerteSms: boolean("alerteSms").default(false),
  emailDestination: varchar("emailDestination", { length: 320 }),
  telephoneDestination: varchar("telephoneDestination", { length: 20 }),
  frequenceVerification: alerteFrequenceEnum("frequenceVerification").default("hebdomadaire"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ConfigAlertePrevision = typeof configAlertesPrevisions.$inferSelect;
export type InsertConfigAlertePrevision = typeof configAlertesPrevisions.$inferInsert;

export const historiqueAlertesPrevisions = pgTable("historique_alertes_previsions", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  mois: integer("mois").notNull(),
  annee: integer("annee").notNull(),
  typeAlerte: alerteTypeEnum("typeAlerte").notNull(),
  caPrevisionnel: numeric("caPrevisionnel", { precision: 12, scale: 2 }),
  caRealise: numeric("caRealise", { precision: 12, scale: 2 }),
  ecartPourcentage: numeric("ecartPourcentage", { precision: 5, scale: 2 }),
  canalEnvoi: alerteCanalEnum("canalEnvoi").notNull(),
  dateEnvoi: timestamp("dateEnvoi").defaultNow().notNull(),
  statut: alerteEnvoiStatutEnum("statut").default("envoye"),
  message: text("message"),
});
export type HistoriqueAlertePrevision = typeof historiqueAlertesPrevisions.$inferSelect;
export type InsertHistoriqueAlertePrevision = typeof historiqueAlertesPrevisions.$inferInsert;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId").notNull(),
  sujet: varchar("sujet", { length: 255 }),
  statut: conversationStatutEnum("statut").default("ouverte"),
  devisId: integer("devisId"),
  factureId: integer("factureId"),
  interventionId: integer("interventionId"),
  dernierMessage: text("dernierMessage"),
  dernierMessageDate: timestamp("dernierMessageDate"),
  nonLuArtisan: integer("nonLuArtisan").default(0),
  nonLuClient: integer("nonLuClient").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  auteur: messageAuteurEnum("auteur").notNull(),
  contenu: text("contenu").notNull(),
  lu: boolean("lu").default(false),
  pieceJointe: text("pieceJointe"),
  pieceJointeUrl: text("pieceJointeUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

export const rapportsPersonnalises = pgTable("rapports_personnalises", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  nom: varchar("nom", { length: 100 }).notNull(),
  description: text("description"),
  type: rapportTypeEnum("type").notNull(),
  filtres: jsonb("filtres"),
  colonnes: jsonb("colonnes"),
  groupement: varchar("groupement", { length: 50 }),
  tri: varchar("tri", { length: 50 }),
  format: rapportFormatEnum("format").default("tableau"),
  graphiqueType: rapportGraphiqueTypeEnum("graphiqueType"),
  favori: boolean("favori").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type RapportPersonnalise = typeof rapportsPersonnalises.$inferSelect;
export type InsertRapportPersonnalise = typeof rapportsPersonnalises.$inferInsert;

export const executionsRapports = pgTable("executions_rapports", {
  id: serial("id").primaryKey(),
  rapportId: integer("rapportId").notNull(),
  artisanId: integer("artisanId").notNull(),
  dateExecution: timestamp("dateExecution").defaultNow().notNull(),
  parametres: jsonb("parametres"),
  resultats: jsonb("resultats"),
  nombreLignes: integer("nombreLignes").default(0),
  tempsExecution: integer("tempsExecution"),
});
export type ExecutionRapport = typeof executionsRapports.$inferSelect;
export type InsertExecutionRapport = typeof executionsRapports.$inferInsert;

export const photosAnalyse = pgTable("photos_analyse", {
  id: serial("id").primaryKey(),
  analyseId: integer("analyseId").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  ordre: integer("ordre").default(1),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type PhotoAnalyse = typeof photosAnalyse.$inferSelect;
export type InsertPhotoAnalyse = typeof photosAnalyse.$inferInsert;

export const resultatsAnalyseIA = pgTable("resultats_analyse_ia", {
  id: serial("id").primaryKey(),
  analyseId: integer("analyseId").notNull(),
  typeTravauxDetecte: varchar("typeTravauxDetecte", { length: 255 }),
  descriptionTravaux: text("descriptionTravaux"),
  urgence: analyseUrgenceEnum("urgence").default("moyenne"),
  confiance: numeric("confiance", { precision: 5, scale: 2 }),
  rawResponse: jsonb("rawResponse"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ResultatAnalyseIA = typeof resultatsAnalyseIA.$inferSelect;
export type InsertResultatAnalyseIA = typeof resultatsAnalyseIA.$inferInsert;

export const suggestionsArticlesIA = pgTable("suggestions_articles_ia", {
  id: serial("id").primaryKey(),
  resultatId: integer("resultatId").notNull(),
  articleId: integer("articleId"),
  nomArticle: varchar("nomArticle", { length: 255 }).notNull(),
  description: text("description"),
  quantiteSuggeree: numeric("quantiteSuggeree", { precision: 10, scale: 2 }).default("1.00"),
  unite: varchar("unite", { length: 20 }).default("unité"),
  prixEstime: numeric("prixEstime", { precision: 10, scale: 2 }),
  confiance: numeric("confiance", { precision: 5, scale: 2 }),
  selectionne: boolean("selectionne").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SuggestionArticleIA = typeof suggestionsArticlesIA.$inferSelect;
export type InsertSuggestionArticleIA = typeof suggestionsArticlesIA.$inferInsert;

export const devisGenereIA = pgTable("devis_genere_ia", {
  id: serial("id").primaryKey(),
  analyseId: integer("analyseId").notNull(),
  devisId: integer("devisId"),
  montantEstime: numeric("montantEstime", { precision: 12, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DevisGenereIA = typeof devisGenereIA.$inferSelect;
export type InsertDevisGenereIA = typeof devisGenereIA.$inferInsert;

export const preferencesCouleursCalendrier = pgTable("preferences_couleurs_calendrier", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  interventionId: integer("interventionId").notNull(),
  couleur: varchar("couleur", { length: 50 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type PreferenceCouleurCalendrier = typeof preferencesCouleursCalendrier.$inferSelect;
export type InsertPreferenceCouleurCalendrier = typeof preferencesCouleursCalendrier.$inferInsert;

export const couleursInterventions = pgTable("couleurs_interventions", {
  artisanId: integer("artisanId").notNull(),
  interventionId: integer("interventionId").notNull(),
  couleur: varchar("couleur", { length: 20 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  pk: primaryKey({ columns: [t.artisanId, t.interventionId] }),
}));
export type CouleurIntervention = typeof couleursInterventions.$inferSelect;
export type InsertCouleurIntervention = typeof couleursInterventions.$inferInsert;

export const aiThreads = pgTable("ai_threads", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  mode: varchar("mode", { length: 50 }).notNull().default("general"),
  parcoursId: varchar("parcoursId", { length: 255 }),
  title: text("title").notNull(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type AiThread = typeof aiThreads.$inferSelect;
export type InsertAiThread = typeof aiThreads.$inferInsert;

export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("threadId").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  transcript: text("transcript").notNull(),
  attachments: jsonb("attachments"),
  metadata: jsonb("metadata"),
  pricingMetadata: jsonb("pricingMetadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = typeof aiMessages.$inferInsert;

/** Une ligne par appel LLM. Insertée en fire-and-forget après que la réponse est envoyée au client. */
export const llmUsage = pgTable("llm_usage", {
  id:                 serial("id").primaryKey(),
  artisanId:          integer("artisan_id").notNull().references(() => artisans.id),
  userId:             integer("user_id").references(() => users.id),
  useCase:            varchar("use_case", { length: 80 }).notNull(),
  model:              varchar("model", { length: 80 }).notNull(),
  promptTokens:       integer("prompt_tokens").notNull().default(0),
  textInputTokens:    integer("text_input_tokens").notNull().default(0),
  audioInputTokens:   integer("audio_input_tokens").notNull().default(0),
  imageInputTokens:   integer("image_input_tokens").notNull().default(0),
  videoInputTokens:   integer("video_input_tokens").notNull().default(0),
  cachedTokens:       integer("cached_tokens").notNull().default(0),
  toolUseTokens:      integer("tool_use_tokens").notNull().default(0),
  responseTokens:     integer("response_tokens").notNull().default(0),
  textOutputTokens:   integer("text_output_tokens").notNull().default(0),
  audioOutputTokens:  integer("audio_output_tokens").notNull().default(0),
  thinkingTokens:     integer("thinking_tokens").notNull().default(0),
  totalTokens:        integer("total_tokens").notNull().default(0),
  trafficType:        varchar("traffic_type", { length: 30 }),
  durationMs:         integer("duration_ms").notNull(),
  finishReason:       varchar("finish_reason", { length: 20 }).notNull(),
  inputPayload:       text("input_payload"),
  outputPayload:      text("output_payload"),
  messageId:          integer("message_id").references(() => aiMessages.id),
  createdAt:          timestamp("created_at").defaultNow().notNull(),
});
export type LlmUsageRow = typeof llmUsage.$inferSelect;
export type InsertLlmUsage = typeof llmUsage.$inferInsert;

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: serial("id").primaryKey(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    fromName: text("from_name"),
    replyTo: text("reply_to"),
    attachments: jsonb("attachments"),
    tentatives: integer("tentatives").notNull().default(0),
    statut: text("statut").notNull().default("pending"),
    derniereErreur: text("derniere_erreur"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    traiteeAt: timestamp("traitee_at", { withTimezone: true }),
  },
  (t) => [index("email_outbox_pending_idx").on(t.statut, t.createdAt).where(sql`${t.statut} = 'pending'`)],
);
export type EmailOutboxRow = typeof emailOutbox.$inferSelect;
export type InsertEmailOutbox = typeof emailOutbox.$inferInsert;
