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
  index,
} from "drizzle-orm/pg-core";

export const interventionStatutEnum = pgEnum("intervention_statut", ["planifiee", "en_cours", "terminee", "annulee"]);
export const contratTypeEnum = pgEnum("contrat_type", ["maintenance_preventive", "entretien", "depannage", "contrat_service"]);
export const contratPeriodiciteEnum = pgEnum("contrat_periodicite", ["mensuel", "trimestriel", "semestriel", "annuel"]);
export const contratStatutEnum = pgEnum("contrat_statut", ["actif", "suspendu", "termine", "annule"]);
export const interventionContratStatutEnum = pgEnum("intervention_contrat_statut", ["planifiee", "en_cours", "effectuee", "annulee"]);
export const mobileSyncStatusEnum = pgEnum("mobile_sync_status", ["synced", "pending", "error"]);
export const photoInterventionTypeEnum = pgEnum("photo_intervention_type", ["avant", "pendant", "apres"]);
export const rdvStatutEnum = pgEnum("rdv_statut", ["en_attente", "confirme", "refuse", "annule"]);
export const rdvUrgenceEnum = pgEnum("rdv_urgence", ["normale", "urgente", "tres_urgente"]);

export const interventions = pgTable("interventions", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  dateDebut: timestamp("dateDebut").notNull(),
  dateFin: timestamp("dateFin"),
  statut: interventionStatutEnum("statut").default("planifiee"),
  adresse: text("adresse"),
  notes: text("notes"),
  devisId: integer("devisId"),
  factureId: integer("factureId"),
  technicienId: integer("technicienId"),
  rappelClientEnvoye: boolean("rappelClientEnvoye").default(false).notNull(),
  dateRappelClient: timestamp("dateRappelClient"),
  avisDemandeEnvoye: boolean("avisDemandeEnvoye").default(false).notNull(),
  avisDemandeEnvoyeAt: timestamp("avisDemandeEnvoyeAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("idx_interventions_artisan").on(t.artisanId),
  index("idx_interventions_client").on(t.clientId),
]);
export type Intervention = typeof interventions.$inferSelect;
export type InsertIntervention = typeof interventions.$inferInsert;

export const interventionsTechniciens = pgTable("interventions_techniciens", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  interventionId: integer("interventionId").notNull(),
  technicienId: integer("technicienId").notNull(),
  role: varchar("role", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InterventionTechnicien = typeof interventionsTechniciens.$inferSelect;
export type InsertInterventionTechnicien = typeof interventionsTechniciens.$inferInsert;

export const contratsMaintenance = pgTable("contrats_maintenance", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId").notNull(),
  reference: varchar("reference", { length: 50 }).notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  type: contratTypeEnum("type").default("entretien"),
  montantHT: numeric("montantHT", { precision: 10, scale: 2 }).notNull(),
  tauxTVA: numeric("tauxTVA", { precision: 5, scale: 2 }).default("20.00"),
  periodicite: contratPeriodiciteEnum("periodicite").notNull(),
  dateDebut: timestamp("dateDebut").notNull(),
  dateFin: timestamp("dateFin"),
  reconduction: boolean("reconduction").default(true),
  preavisResiliation: integer("preavisResiliation").default(1),
  alerteReconductionEnvoyeeLe: timestamp("alerteReconductionEnvoyeeLe"),
  prochainFacturation: timestamp("prochainFacturation"),
  prochainPassage: timestamp("prochainPassage"),
  conditionsParticulieres: text("conditionsParticulieres"),
  statut: contratStatutEnum("statut").default("actif"),
  notes: text("notes"),
  tauxIndexationAnnuel: numeric("tauxIndexationAnnuel", { precision: 5, scale: 2 }),
  dateDerniereRevision: timestamp("dateDerniereRevision"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ContratMaintenance = typeof contratsMaintenance.$inferSelect;
export type InsertContratMaintenance = typeof contratsMaintenance.$inferInsert;

export const facturesRecurrentes = pgTable("factures_recurrentes", {
  id: serial("id").primaryKey(),
  contratId: integer("contratId").notNull().references(() => contratsMaintenance.id, { onDelete: "cascade" }),
  factureId: integer("factureId").notNull(),
  periodeDebut: timestamp("periodeDebut").notNull(),
  periodeFin: timestamp("periodeFin").notNull(),
  genereeAutomatiquement: boolean("genereeAutomatiquement").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FactureRecurrente = typeof facturesRecurrentes.$inferSelect;
export type InsertFactureRecurrente = typeof facturesRecurrentes.$inferInsert;

export const interventionsContrat = pgTable("interventions_contrat", {
  id: serial("id").primaryKey(),
  contratId: integer("contratId").notNull().references(() => contratsMaintenance.id, { onDelete: "cascade" }),
  artisanId: integer("artisanId").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  dateIntervention: timestamp("dateIntervention").notNull(),
  duree: varchar("duree", { length: 50 }),
  technicienNom: varchar("technicienNom", { length: 255 }),
  statut: interventionContratStatutEnum("statut").default("planifiee"),
  rapport: text("rapport"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type InterventionContrat = typeof interventionsContrat.$inferSelect;
export type InsertInterventionContrat = typeof interventionsContrat.$inferInsert;

export const interventionsChantier = pgTable("interventions_chantier", {
  id: serial("id").primaryKey(),
  chantierId: integer("chantierId").notNull(),
  interventionId: integer("interventionId").notNull(),
  phaseId: integer("phaseId"),
  ordre: integer("ordre").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InterventionChantier = typeof interventionsChantier.$inferSelect;
export type InsertInterventionChantier = typeof interventionsChantier.$inferInsert;

export const interventionsMobile = pgTable("interventions_mobile", {
  id: serial("id").primaryKey(),
  interventionId: integer("interventionId").notNull().references(() => interventions.id, { onDelete: "cascade" }),
  artisanId: integer("artisanId").notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  heureArrivee: timestamp("heureArrivee"),
  heureDepart: timestamp("heureDepart"),
  notesIntervention: text("notesIntervention"),
  signatureClient: text("signatureClient"),
  signatureDate: timestamp("signatureDate"),
  syncStatus: mobileSyncStatusEnum("syncStatus").default("synced"),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type InterventionMobile = typeof interventionsMobile.$inferSelect;
export type InsertInterventionMobile = typeof interventionsMobile.$inferInsert;

export const photosInterventions = pgTable("photos_interventions", {
  id: serial("id").primaryKey(),
  interventionMobileId: integer("interventionMobileId").notNull().references(() => interventionsMobile.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 500 }).notNull(),
  description: varchar("description", { length: 255 }),
  type: photoInterventionTypeEnum("type").default("pendant"),
  takenAt: timestamp("takenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PhotoIntervention = typeof photosInterventions.$inferSelect;
export type InsertPhotoIntervention = typeof photosInterventions.$inferInsert;

export const rdvEnLigne = pgTable("rdv_en_ligne", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  clientId: integer("clientId").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  dateProposee: timestamp("dateProposee").notNull(),
  dureeEstimee: integer("dureeEstimee").default(60),
  statut: rdvStatutEnum("statut").default("en_attente"),
  motifRefus: text("motifRefus"),
  urgence: rdvUrgenceEnum("urgence").default("normale"),
  interventionId: integer("interventionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type RdvEnLigne = typeof rdvEnLigne.$inferSelect;
export type InsertRdvEnLigne = typeof rdvEnLigne.$inferInsert;
