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
  index,
} from "drizzle-orm/pg-core";

export const technicienStatutEnum = pgEnum("technicien_statut", ["actif", "inactif", "conge"]);
export const typeContratEnum = pgEnum("type_contrat", ["cdi", "cdd", "interimaire", "sous_traitant"]);
export const vehiculeCarburantEnum = pgEnum("vehicule_carburant", ["essence", "diesel", "electrique", "hybride", "gpl"]);
export const vehiculeStatutEnum = pgEnum("vehicule_statut", ["actif", "en_maintenance", "hors_service", "vendu"]);
export const entretienTypeEnum = pgEnum("entretien_type", ["vidange", "pneus", "freins", "controle_technique", "revision", "reparation", "autre"]);
export const assuranceTypeEnum = pgEnum("assurance_type", ["tiers", "tiers_plus", "tous_risques"]);
export const classementPeriodeEnum = pgEnum("classement_periode", ["semaine", "mois", "trimestre", "annee"]);
export const congeTypeEnum = pgEnum("conge_type", ["conge_paye", "rtt", "maladie", "sans_solde", "formation", "autre"]);
export const congeStatutEnum = pgEnum("conge_statut", ["en_attente", "approuve", "refuse", "annule"]);
export const soldeCongeTypeEnum = pgEnum("solde_conge_type", ["conge_paye", "rtt"]);
export const notifPushTypeEnum = pgEnum("notif_push_type", ["assignation", "modification", "annulation", "rappel", "message", "avis"]);
export const alerteEnvoiStatutEnum = pgEnum("alerte_envoi_statut", ["envoye", "echec", "lu"]);

export const techniciens = pgTable("techniciens", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  prenom: varchar("prenom", { length: 255 }),
  email: varchar("email", { length: 320 }),
  telephone: varchar("telephone", { length: 20 }),
  specialite: varchar("specialite", { length: 100 }),
  couleur: varchar("couleur", { length: 7 }).default("#3b82f6"),
  statut: technicienStatutEnum("statut").default("actif"),
  coutHoraire: numeric("coutHoraire", { precision: 8, scale: 2 }),
  userId: integer("userId"),
  notes: text("notes"),
  /** CNIL géoloc — le technicien peut désactiver son suivi GPS hors temps de travail. */
  suiviActif: boolean("suiviActif").default(true).notNull(),
  typeContrat: typeContratEnum("typeContrat"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Technicien = typeof techniciens.$inferSelect;
export type InsertTechnicien = typeof techniciens.$inferInsert;

export const disponibilitesTechniciens = pgTable("disponibilites_techniciens", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  jourSemaine: integer("jourSemaine").notNull(),
  heureDebut: varchar("heureDebut", { length: 5 }).notNull(),
  heureFin: varchar("heureFin", { length: 5 }).notNull(),
  disponible: boolean("disponible").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DisponibiliteTechnicien = typeof disponibilitesTechniciens.$inferSelect;
export type InsertDisponibiliteTechnicien = typeof disponibilitesTechniciens.$inferInsert;

export const positionsTechniciens = pgTable(
  "positions_techniciens",
  {
    id: serial("id").primaryKey(),
    technicienId: integer("technicienId").notNull(),
    latitude: numeric("latitude", { precision: 10, scale: 8 }).notNull(),
    longitude: numeric("longitude", { precision: 11, scale: 8 }).notNull(),
    precision: integer("precision"),
    vitesse: numeric("vitesse", { precision: 5, scale: 2 }),
    cap: integer("cap"),
    batterie: integer("batterie"),
    enDeplacement: boolean("enDeplacement").default(false),
    interventionEnCoursId: integer("interventionEnCoursId"),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    /** CNIL — date d'expiration de la position (8 h après l'enregistrement, purgée par le cron). */
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_positions_techniciens_expires_at").on(t.expiresAt)],
);
export type PositionTechnicien = typeof positionsTechniciens.$inferSelect;
export type InsertPositionTechnicien = typeof positionsTechniciens.$inferInsert;

export const vehicules = pgTable("vehicules", {
  id: serial("id").primaryKey(),
  artisanId: integer("artisanId").notNull(),
  immatriculation: varchar("immatriculation", { length: 20 }).notNull(),
  marque: varchar("marque", { length: 100 }),
  modele: varchar("modele", { length: 100 }),
  annee: integer("annee"),
  typeCarburant: vehiculeCarburantEnum("typeCarburant").default("diesel"),
  puissanceFiscale: integer("puissanceFiscale"),
  kilometrageActuel: integer("kilometrageActuel").default(0),
  dateAchat: date("dateAchat"),
  prixAchat: numeric("prixAchat", { precision: 10, scale: 2 }),
  technicienId: integer("technicienId"),
  statut: vehiculeStatutEnum("statut").default("actif"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type Vehicule = typeof vehicules.$inferSelect;
export type InsertVehicule = typeof vehicules.$inferInsert;

export const historiqueKilometrage = pgTable("historique_kilometrage", {
  id: serial("id").primaryKey(),
  vehiculeId: integer("vehiculeId").notNull(),
  technicienId: integer("technicienId"),
  kilometrage: integer("kilometrage").notNull(),
  dateReleve: date("dateReleve").notNull(),
  motif: varchar("motif", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type HistoriqueKilometrage = typeof historiqueKilometrage.$inferSelect;
export type InsertHistoriqueKilometrage = typeof historiqueKilometrage.$inferInsert;

export const entretiensVehicules = pgTable("entretiens_vehicules", {
  id: serial("id").primaryKey(),
  vehiculeId: integer("vehiculeId").notNull(),
  type: entretienTypeEnum("type").notNull(),
  dateEntretien: date("dateEntretien").notNull(),
  kilometrageEntretien: integer("kilometrageEntretien"),
  cout: numeric("cout", { precision: 10, scale: 2 }),
  prestataire: varchar("prestataire", { length: 255 }),
  description: text("description"),
  prochainEntretienKm: integer("prochainEntretienKm"),
  prochainEntretienDate: date("prochainEntretienDate"),
  facture: text("facture"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EntretienVehicule = typeof entretiensVehicules.$inferSelect;
export type InsertEntretienVehicule = typeof entretiensVehicules.$inferInsert;

export const assurancesVehicules = pgTable("assurances_vehicules", {
  id: serial("id").primaryKey(),
  vehiculeId: integer("vehiculeId").notNull(),
  compagnie: varchar("compagnie", { length: 255 }).notNull(),
  numeroContrat: varchar("numeroContrat", { length: 100 }),
  typeAssurance: assuranceTypeEnum("typeAssurance").default("tiers"),
  dateDebut: date("dateDebut").notNull(),
  dateFin: date("dateFin").notNull(),
  primeAnnuelle: numeric("primeAnnuelle", { precision: 10, scale: 2 }),
  franchise: numeric("franchise", { precision: 10, scale: 2 }),
  document: text("document"),
  alerteEnvoyee: boolean("alerteEnvoyee").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type AssuranceVehicule = typeof assurancesVehicules.$inferSelect;
export type InsertAssuranceVehicule = typeof assurancesVehicules.$inferInsert;

export const objectifsTechniciens = pgTable("objectifs_techniciens", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  artisanId: integer("artisanId").notNull(),
  mois: integer("mois").notNull(),
  annee: integer("annee").notNull(),
  objectifInterventions: integer("objectifInterventions").default(0),
  objectifCA: numeric("objectifCA", { precision: 10, scale: 2 }).default("0.00"),
  objectifAvisPositifs: integer("objectifAvisPositifs").default(0),
  interventionsRealisees: integer("interventionsRealisees").default(0),
  caRealise: numeric("caRealise", { precision: 10, scale: 2 }).default("0.00"),
  avisPositifsObtenus: integer("avisPositifsObtenus").default(0),
  pointsGagnes: integer("pointsGagnes").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ObjectifTechnicien = typeof objectifsTechniciens.$inferSelect;
export type InsertObjectifTechnicien = typeof objectifsTechniciens.$inferInsert;

export const classementTechniciens = pgTable("classement_techniciens", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  artisanId: integer("artisanId").notNull(),
  periode: classementPeriodeEnum("periode").notNull(),
  dateDebut: date("dateDebut").notNull(),
  dateFin: date("dateFin").notNull(),
  rang: integer("rang").notNull(),
  pointsTotal: integer("pointsTotal").default(0),
  interventions: integer("interventions").default(0),
  ca: numeric("ca", { precision: 10, scale: 2 }).default("0.00"),
  noteMoyenne: numeric("noteMoyenne", { precision: 3, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ClassementTechnicien = typeof classementTechniciens.$inferSelect;
export type InsertClassementTechnicien = typeof classementTechniciens.$inferInsert;

export const habilitationsTechniciens = pgTable("habilitations_techniciens", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  artisanId: integer("artisanId").notNull(),
  type: varchar("type", { length: 255 }).notNull(),
  numero: varchar("numero", { length: 100 }),
  organisme: varchar("organisme", { length: 255 }),
  dateObtention: date("dateObtention"),
  dateExpiration: date("dateExpiration"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type HabilitationTechnicien = typeof habilitationsTechniciens.$inferSelect;
export type InsertHabilitationTechnicien = typeof habilitationsTechniciens.$inferInsert;

export const historiqueDeplacements = pgTable("historique_deplacements", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  interventionId: integer("interventionId"),
  dateDebut: timestamp("dateDebut").notNull(),
  dateFin: timestamp("dateFin"),
  distanceKm: numeric("distanceKm", { precision: 8, scale: 2 }),
  dureeMinutes: integer("dureeMinutes"),
  latitudeDepart: numeric("latitudeDepart", { precision: 10, scale: 8 }),
  longitudeDepart: numeric("longitudeDepart", { precision: 11, scale: 8 }),
  latitudeArrivee: numeric("latitudeArrivee", { precision: 10, scale: 8 }),
  longitudeArrivee: numeric("longitudeArrivee", { precision: 11, scale: 8 }),
  adresseDepart: text("adresseDepart"),
  adresseArrivee: text("adresseArrivee"),
  depenseId: integer("depenseId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type HistoriqueDeplacement = typeof historiqueDeplacements.$inferSelect;
export type InsertHistoriqueDeplacement = typeof historiqueDeplacements.$inferInsert;

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: varchar("userAgent", { length: 255 }),
  actif: boolean("actif").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

export const preferencesNotifications = pgTable("preferences_notifications", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  nouvelleAssignation: boolean("nouvelleAssignation").default(true),
  modificationIntervention: boolean("modificationIntervention").default(true),
  annulationIntervention: boolean("annulationIntervention").default(true),
  rappelIntervention: boolean("rappelIntervention").default(true),
  nouveauMessage: boolean("nouveauMessage").default(true),
  demandeAvis: boolean("demandeAvis").default(false),
  heureDebutNotif: varchar("heureDebutNotif", { length: 5 }).default("08:00"),
  heureFinNotif: varchar("heureFinNotif", { length: 5 }).default("20:00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type PreferenceNotification = typeof preferencesNotifications.$inferSelect;
export type InsertPreferenceNotification = typeof preferencesNotifications.$inferInsert;

export const historiqueNotificationsPush = pgTable("historique_notifications_push", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  type: notifPushTypeEnum("type").notNull(),
  titre: varchar("titre", { length: 100 }).notNull(),
  corps: text("corps"),
  referenceId: integer("referenceId"),
  referenceType: varchar("referenceType", { length: 50 }),
  statut: alerteEnvoiStatutEnum("statut").default("envoye"),
  dateEnvoi: timestamp("dateEnvoi").defaultNow().notNull(),
  dateLecture: timestamp("dateLecture"),
});
export type HistoriqueNotificationPush = typeof historiqueNotificationsPush.$inferSelect;
export type InsertHistoriqueNotificationPush = typeof historiqueNotificationsPush.$inferInsert;

export const conges = pgTable("conges", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  artisanId: integer("artisanId").notNull(),
  type: congeTypeEnum("type").notNull(),
  dateDebut: date("dateDebut").notNull(),
  dateFin: date("dateFin").notNull(),
  demiJourneeDebut: boolean("demiJourneeDebut").default(false),
  demiJourneeFin: boolean("demiJourneeFin").default(false),
  motif: text("motif"),
  statut: congeStatutEnum("statut").default("en_attente"),
  commentaireValidation: text("commentaireValidation"),
  dateValidation: timestamp("dateValidation"),
  validePar: integer("validePar"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type Conge = typeof conges.$inferSelect;
export type InsertConge = typeof conges.$inferInsert;

export const soldesConges = pgTable("soldes_conges", {
  id: serial("id").primaryKey(),
  technicienId: integer("technicienId").notNull(),
  artisanId: integer("artisanId").notNull(),
  type: soldeCongeTypeEnum("type").notNull(),
  annee: integer("annee").notNull(),
  soldeInitial: numeric("soldeInitial", { precision: 5, scale: 2 }).default("0.00"),
  soldeRestant: numeric("soldeRestant", { precision: 5, scale: 2 }).default("0.00"),
  joursAcquis: numeric("joursAcquis", { precision: 5, scale: 2 }).default("0.00"),
  joursPris: numeric("joursPris", { precision: 5, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type SoldeConge = typeof soldesConges.$inferSelect;
export type InsertSoldeConge = typeof soldesConges.$inferInsert;
