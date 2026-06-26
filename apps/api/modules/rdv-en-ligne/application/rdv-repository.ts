import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateRdvInput, Rdv, RdvStatut, UpdateRdvInput } from "../domain/rdv";

/*
 * Options d'une transition de statut : `motifRefus` (refus) et `interventionId` (confirmation, lien
 * vers l'intervention planifiée créée). Champ absent = inchangé.
 */
export interface SetStatutOptions {
  readonly motifRefus?: string | null;
  readonly interventionId?: number | null;
}

/*
 * Port du repository rdv-en-ligne. Chaque méthode exige le TenantContext (scope tenant + RLS).
 * `rdv_en_ligne` possède un `artisanId` → double cloisonnement RLS + filtre. `clientId` est validé
 * via `ownsClient` (anti-IDOR-FK, cf. devis). Les transitions de statut passent par `setStatut`
 * (piloté par les use-cases confirmer/refuser/annuler), pas par `update`.
 */
export interface IRdvRepository {
  list(ctx: TenantContext): Promise<Rdv[]>;
  /** null si le RDV n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<Rdv | null>;
  create(ctx: TenantContext, input: CreateRdvInput): Promise<Rdv>;
  /** Met à jour les métadonnées (jamais le statut). null si le RDV n'appartient pas au tenant. */
  update(ctx: TenantContext, id: number, input: UpdateRdvInput): Promise<Rdv | null>;
  /** Applique une transition de statut (+ motifRefus / interventionId optionnels). null si hors tenant. */
  setStatut(ctx: TenantContext, id: number, statut: RdvStatut, options?: SetStatutOptions): Promise<Rdv | null>;
  /** false si le RDV n'appartient pas au tenant. */
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  /** Le client appartient-il au tenant ? (anti-IDOR-FK) */
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
  withDb(db: DbClient): IRdvRepository;
}
