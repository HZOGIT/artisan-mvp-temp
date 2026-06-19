import type { TenantContext } from "../../../shared/tenant";
import type { CreateModeleEmailInput, ModeleEmail, TypeModeleEmail, UpdateModeleEmailInput } from "../domain/modele-email";

/*
 * Port du repository modeles-email. Chaque méthode exige le TenantContext (scope tenant + RLS).
 * `modeles_email` possède un `artisanId` → double cloisonnement RLS + filtre explicite.
 */
export interface IModeleEmailRepository {
  list(ctx: TenantContext): Promise<ModeleEmail[]>;
  /** Modèles du tenant filtrés par type (scopé tenant ; [] si aucun). */
  listByType(ctx: TenantContext, type: TypeModeleEmail): Promise<ModeleEmail[]>;
  /** null si le modèle n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<ModeleEmail | null>;
  create(ctx: TenantContext, input: CreateModeleEmailInput): Promise<ModeleEmail>;
  /** null si le modèle n'appartient pas au tenant. */
  update(ctx: TenantContext, id: number, input: UpdateModeleEmailInput): Promise<ModeleEmail | null>;
  /** false si le modèle n'appartient pas au tenant. */
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
