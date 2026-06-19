import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "./chantier-repository";
import type { ChantierInterventionLien, AssocierInterventionInput } from "../domain/chantier";

/*
 * Use-cases « interventions rattachées à un chantier » (table `interventions_chantier`, SANS
 * artisanId → scopée via le chantier parent). ⚠️ `associerIntervention` exige un anti-IDOR DOUBLE :
 * le chantier ET l'intervention doivent appartenir au tenant (sinon on pourrait rattacher
 * l'intervention d'un autre tenant à son propre chantier).
 */

/** Liens d'un chantier possédé (404 sinon), triés par ordre. */
export async function getInterventionsLiees(
  repo: IChantierRepository,
  ctx: TenantContext,
  chantierId: number,
): Promise<ChantierInterventionLien[]> {
  if (!(await repo.getById(ctx, chantierId))) throw new NotFoundError("Chantier introuvable");
  return repo.listInterventionsLiens(ctx, chantierId);
}

/** Tous les liens des chantiers du tenant (scopé tenant, anti-N+1). */
export async function getAllInterventionsLiees(
  repo: IChantierRepository,
  ctx: TenantContext,
): Promise<ChantierInterventionLien[]> {
  return repo.listAllInterventionsLiens(ctx);
}

/*
 * Associe une intervention à un chantier. Anti-IDOR DOUBLE : chantier possédé (404) ET intervention
 * possédée (404). Idempotent (l'adapter renvoie le lien existant le cas échéant).
 */
export async function associerInterventionChantier(
  repo: IChantierRepository,
  ctx: TenantContext,
  input: AssocierInterventionInput,
): Promise<ChantierInterventionLien> {
  if (!(await repo.getById(ctx, input.chantierId))) throw new NotFoundError("Chantier introuvable");
  if (!(await repo.ownsIntervention(ctx, input.interventionId))) throw new NotFoundError("Intervention introuvable");
  return repo.associerIntervention(ctx, input);
}

/** Dissocie une intervention d'un chantier possédé (404 sinon). Idempotent. */
export async function dissocierInterventionChantier(
  repo: IChantierRepository,
  ctx: TenantContext,
  chantierId: number,
  interventionId: number,
): Promise<void> {
  if (!(await repo.getById(ctx, chantierId))) throw new NotFoundError("Chantier introuvable");
  await repo.dissocierIntervention(ctx, chantierId, interventionId);
}
