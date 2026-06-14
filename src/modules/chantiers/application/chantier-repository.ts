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
} from "../domain/chantier";

// Port du repository chantiers. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `chantiers` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ La FK `clientId`
// devra être vérifiée comme appartenant au tenant lors des écritures (anti-IDOR-FK) — traité
// aux use-cases d'écriture (étape ultérieure).
export interface IChantierRepository {
  list(ctx: TenantContext): Promise<Chantier[]>;
  // null si le chantier n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Chantier | null>;
  create(ctx: TenantContext, input: CreateChantierInput): Promise<Chantier>;
  // null si le chantier n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateChantierInput): Promise<Chantier | null>;
  // false si le chantier n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // true si le client (FK) appartient au tenant. Garde anti-IDOR-FK : interdit de rattacher un
  // chantier à un client d'un autre tenant.
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
  // true si le technicien (FK) appartient au tenant (anti-IDOR-FK sur le pointage).
  ownsTechnicien(ctx: TenantContext, technicienId: number): Promise<boolean>;

  // ── Pointages (sous-ressource `pointages_chantier`, scopée via le chantier parent) ───────────
  // Pointages d'un chantier — [] si le chantier n'appartient pas au tenant.
  listPointages(ctx: TenantContext, chantierId: number): Promise<ChantierPointage[]>;
  // Ajoute un pointage (artisanId forcé) — null si le chantier n'appartient pas au tenant.
  addPointage(ctx: TenantContext, input: CreatePointageInput): Promise<ChantierPointage | null>;
  // Supprime un pointage (scopé chantier+tenant) — false si absent/hors tenant. Idempotent.
  deletePointage(ctx: TenantContext, chantierId: number, id: number): Promise<boolean>;

  // ── Suivi (`suivi_chantier`, SANS artisanId → scopé via le chantier parent par le use-case) ──
  // Étapes de suivi d'un chantier (triées par ordre). ⚠️ Le use-case vérifie l'ownership du chantier
  // AVANT d'appeler (la table n'a pas d'artisanId/RLS).
  listSuivi(ctx: TenantContext, chantierId: number): Promise<ChantierSuivi[]>;
  // Lit un suivi par id (NON scopé tenant — la table n'a pas d'artisanId). Le use-case s'en sert
  // pour récupérer `chantierId` puis vérifier l'ownership du chantier (anti-IDOR). null si absent.
  getSuiviById(ctx: TenantContext, id: number): Promise<ChantierSuivi | null>;
  // Crée une étape de suivi (ownership du chantier vérifiée par le use-case).
  addSuivi(ctx: TenantContext, input: CreateSuiviInput): Promise<ChantierSuivi>;
  // Met à jour une étape de suivi par id (ownership vérifiée en amont) — null si absente.
  updateSuivi(ctx: TenantContext, id: number, input: UpdateSuiviInput): Promise<ChantierSuivi | null>;
  // Supprime une étape de suivi par id (ownership vérifiée en amont) — false si absente.
  deleteSuivi(ctx: TenantContext, id: number): Promise<boolean>;
}
