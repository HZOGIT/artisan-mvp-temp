import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IBadgeRepository } from "./badge-repository";
import type { Badge, BadgeTechnicien, ObjectifTechnicien } from "../domain/badge";
import type { ClassementEntry, PeriodeClassement } from "../domain/classement";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté
 * par le `TenantContext` (le repo l'applique). `getBadge` sur une ressource d'un autre
 * tenant → le repo renvoie null → on lève NotFoundError (ne révèle pas l'existence).
 */

export function listBadges(repo: IBadgeRepository, ctx: TenantContext): Promise<Badge[]> {
  return repo.list(ctx);
}

export async function getBadge(repo: IBadgeRepository, ctx: TenantContext, id: number): Promise<Badge> {
  const badge = await repo.getById(ctx, id);
  if (!badge) throw new NotFoundError("Badge introuvable");
  return badge;
}

/*
 * Badges attribués à un technicien — [] si le technicien n'appartient pas au tenant
 * (la lecture ne révèle pas l'existence d'un technicien d'un autre artisan : anti-IDOR).
 */
export function listBadgesDuTechnicien(
  repo: IBadgeRepository,
  ctx: TenantContext,
  technicienId: number,
): Promise<BadgeTechnicien[]> {
  return repo.listBadgesTechnicien(ctx, technicienId);
}

/*
 * Objectifs mensuels d'un technicien pour une année — [] si le technicien n'appartient pas au
 * tenant (anti-IDOR, données salarié). Parité legacy `getObjectifsTechnicien`.
 */
export function listObjectifsDuTechnicien(
  repo: IBadgeRepository,
  ctx: TenantContext,
  technicienId: number,
  annee: number,
): Promise<ObjectifTechnicien[]> {
  return repo.listObjectifsTechnicien(ctx, technicienId, annee);
}

// Classement des techniciens du tenant pour une période (lecture scopée tenant).
export function getClassementTechniciens(
  repo: IBadgeRepository,
  ctx: TenantContext,
  periode: PeriodeClassement,
): Promise<ClassementEntry[]> {
  return repo.getClassement(ctx, periode);
}
