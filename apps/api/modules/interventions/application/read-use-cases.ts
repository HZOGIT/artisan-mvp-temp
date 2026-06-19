import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IInterventionRepository } from "./intervention-repository";
import type { Intervention } from "../domain/intervention";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
 * `TenantContext` (le repo l'applique). `getIntervention` sur une ressource d'un autre tenant
 * → le repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).
 */

export function listInterventions(repo: IInterventionRepository, ctx: TenantContext): Promise<Intervention[]> {
  return repo.list(ctx);
}

export async function getIntervention(
  repo: IInterventionRepository,
  ctx: TenantContext,
  id: number,
): Promise<Intervention> {
  const intervention = await repo.getById(ctx, id);
  if (!intervention) throw new NotFoundError("Intervention introuvable");
  return intervention;
}

/*
 * Interventions visibles par l'utilisateur courant. Minimisation RGPD (parité legacy
 * getTodayInterventions) : un utilisateur de rôle « technicien » LIÉ à une fiche ne voit que
 * SES interventions assignées ; sinon (owner/secrétaire, ou technicien non lié) → vue tenant
 * complète (behavior-preserving). Toujours scopé au tenant par le repo.
 */
export async function listMesInterventions(
  repo: IInterventionRepository,
  ctx: TenantContext,
): Promise<Intervention[]> {
  if (ctx.role === "technicien") {
    const technicienId = await repo.findTechnicienIdForUser(ctx);
    if (technicienId != null) return repo.listByTechnicien(ctx, technicienId);
  }
  return repo.list(ctx);
}
