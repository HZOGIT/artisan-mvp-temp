import type { TenantContext } from "../../../shared/tenant";
import type { Chantier, CreateChantierInput, UpdateChantierInput, ChantierPointage, CreatePointageInput } from "../domain/chantier";

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
}
