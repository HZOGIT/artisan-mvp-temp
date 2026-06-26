import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type {
  Chantier,
  CreateChantierInput,
  UpdateChantierInput,
  ChantierPointage,
  CreatePointageInput,
  ChantierSuivi,
  CreateSuiviInput,
  UpdateSuiviInput,
  ChantierPhase,
  CreatePhaseInput,
  UpdatePhaseInput,
  ChantierInterventionLien,
  AssocierInterventionInput,
  ChantierDocument,
  AddDocumentInput,
} from "../domain/chantier";

/*
 * Port du repository chantiers. Chaque méthode exige le TenantContext (scope tenant + RLS).
 * `chantiers` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ La FK `clientId`
 * devra être vérifiée comme appartenant au tenant lors des écritures (anti-IDOR-FK) — traité
 * aux use-cases d'écriture (étape ultérieure).
 */
export interface IChantierRepository {
  list(ctx: TenantContext): Promise<Chantier[]>;
  /** null si le chantier n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<Chantier | null>;
  create(ctx: TenantContext, input: CreateChantierInput): Promise<Chantier>;
  /** null si le chantier n'appartient pas au tenant. */
  update(ctx: TenantContext, id: number, input: UpdateChantierInput): Promise<Chantier | null>;
  /** false si le chantier n'appartient pas au tenant. */
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  /*
   * true si le client (FK) appartient au tenant. Garde anti-IDOR-FK : interdit de rattacher un
   * chantier à un client d'un autre tenant.
   */
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
  /** true si le technicien (FK) appartient au tenant (anti-IDOR-FK sur le pointage). */
  ownsTechnicien(ctx: TenantContext, technicienId: number): Promise<boolean>;

  /*
   * ── Pointages (sous-ressource `pointages_chantier`, scopée via le chantier parent) ───────────
   * Pointages d'un chantier — [] si le chantier n'appartient pas au tenant.
   */
  listPointages(ctx: TenantContext, chantierId: number): Promise<ChantierPointage[]>;
  /** Ajoute un pointage (artisanId forcé) — null si le chantier n'appartient pas au tenant. */
  addPointage(ctx: TenantContext, input: CreatePointageInput): Promise<ChantierPointage | null>;
  /** Supprime un pointage (scopé chantier+tenant) — false si absent/hors tenant. Idempotent. */
  deletePointage(ctx: TenantContext, chantierId: number, id: number): Promise<boolean>;

  /*
   * ── Suivi (`suivi_chantier`, SANS artisanId → scopé via le chantier parent par le use-case) ──
   * Étapes de suivi d'un chantier (triées par ordre). ⚠️ Le use-case vérifie l'ownership du chantier
   * AVANT d'appeler (la table n'a pas d'artisanId/RLS).
   */
  listSuivi(ctx: TenantContext, chantierId: number): Promise<ChantierSuivi[]>;
  /*
   * Lit un suivi par id (NON scopé tenant — la table n'a pas d'artisanId). Le use-case s'en sert
   * pour récupérer `chantierId` puis vérifier l'ownership du chantier (anti-IDOR). null si absent.
   */
  getSuiviById(ctx: TenantContext, id: number): Promise<ChantierSuivi | null>;
  /** Crée une étape de suivi (ownership du chantier vérifiée par le use-case). */
  addSuivi(ctx: TenantContext, input: CreateSuiviInput): Promise<ChantierSuivi>;
  /** Met à jour une étape de suivi par id (ownership vérifiée en amont) — null si absente. */
  updateSuivi(ctx: TenantContext, id: number, input: UpdateSuiviInput): Promise<ChantierSuivi | null>;
  /** Supprime une étape de suivi par id (ownership vérifiée en amont) — false si absente. */
  deleteSuivi(ctx: TenantContext, id: number): Promise<boolean>;

  /*
   * ── Phases (`phases_chantier`, SANS artisanId → scopé via le chantier parent par le use-case) ─
   * Phases d'un chantier (triées par ordre). ⚠️ Le use-case vérifie l'ownership du chantier AVANT.
   */
  listPhases(ctx: TenantContext, chantierId: number): Promise<ChantierPhase[]>;
  /*
   * Lit une phase par id (NON scopé tenant). Le use-case s'en sert pour récupérer `chantierId`
   * puis vérifier l'ownership du chantier (anti-IDOR). null si absente.
   */
  getPhaseById(ctx: TenantContext, id: number): Promise<ChantierPhase | null>;
  /** Crée une phase (ownership du chantier vérifiée par le use-case). */
  addPhase(ctx: TenantContext, input: CreatePhaseInput): Promise<ChantierPhase>;
  /** Met à jour une phase par id (ownership vérifiée en amont) — null si absente. */
  updatePhase(ctx: TenantContext, id: number, input: UpdatePhaseInput): Promise<ChantierPhase | null>;
  /** Supprime une phase par id (ownership vérifiée en amont) — false si absente. */
  deletePhase(ctx: TenantContext, id: number): Promise<boolean>;

  /*
   * ── Interventions liées (`interventions_chantier`, SANS artisanId → scopé via le chantier) ────
   * true si l'intervention (FK) appartient au tenant (anti-IDOR-FK sur l'association).
   */
  ownsIntervention(ctx: TenantContext, interventionId: number): Promise<boolean>;
  /** Liens d'un chantier (triés par ordre). Ownership chantier vérifiée en amont par le use-case. */
  listInterventionsLiens(ctx: TenantContext, chantierId: number): Promise<ChantierInterventionLien[]>;
  /** Tous les liens des chantiers du tenant (scopé tenant via jointure chantiers, anti-N+1). */
  listAllInterventionsLiens(ctx: TenantContext): Promise<ChantierInterventionLien[]>;
  /*
   * Associe une intervention à un chantier (idempotent sur (chantier,intervention)). Ownership des
   * DEUX ressources (chantier + intervention) vérifiée en amont par le use-case.
   */
  associerIntervention(ctx: TenantContext, input: AssocierInterventionInput): Promise<ChantierInterventionLien>;
  /** Dissocie une intervention d'un chantier — false si le lien n'existait pas. Idempotent. */
  dissocierIntervention(ctx: TenantContext, chantierId: number, interventionId: number): Promise<boolean>;

  /*
   * ── Documents (`documents_chantier`, SANS artisanId → scopé via le chantier parent) ───────────
   * Documents d'un chantier (récents d'abord). Ownership chantier vérifiée en amont par le use-case.
   */
  listDocuments(ctx: TenantContext, chantierId: number): Promise<ChantierDocument[]>;
  /*
   * Lit un document par id (NON scopé tenant). Le use-case s'en sert pour récupérer `chantierId`
   * puis vérifier l'ownership du chantier (anti-IDOR). null si absent.
   */
  getDocumentById(ctx: TenantContext, id: number): Promise<ChantierDocument | null>;
  /** Ajoute un document (ownership du chantier vérifiée par le use-case). */
  addDocument(ctx: TenantContext, input: AddDocumentInput): Promise<ChantierDocument>;
  /** Supprime un document par id (ownership vérifiée en amont) — false si absent. */
  deleteDocument(ctx: TenantContext, id: number): Promise<boolean>;

  /*
   * ── Statistiques ──────────────────────────────────────────────────────────────────────────────
   * Somme des `montant_ttc` des dépenses rattachées au chantier (`depenses.chantier_id`), scopée
   * tenant (`depenses.artisan_id`). Renvoie un décimal string ("0" si aucune dépense). Ownership du
   * chantier vérifiée en amont par le use-case.
   */
  sumDepensesChantier(ctx: TenantContext, chantierId: number): Promise<string>;
  /** Met à jour l'avancement (0..100) d'un chantier possédé (scopé tenant). Ownership vérifiée en amont. */
  setAvancement(ctx: TenantContext, chantierId: number, avancement: number): Promise<void>;
  /** Retourne une instance utilisant `db` comme pool (requis par withOutbox). */
  withDb(db: DbClient): IChantierRepository;
}
