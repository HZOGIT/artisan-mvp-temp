import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IBadgeRepository } from "./badge-repository";
import type { Badge, BadgeTechnicien } from "../domain/badge";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté
// par le `TenantContext` (le repo l'applique). `getBadge` sur une ressource d'un autre
// tenant → le repo renvoie null → on lève NotFoundError (ne révèle pas l'existence).

export function listBadges(repo: IBadgeRepository, ctx: TenantContext): Promise<Badge[]> {
  return repo.list(ctx);
}

export async function getBadge(repo: IBadgeRepository, ctx: TenantContext, id: number): Promise<Badge> {
  const badge = await repo.getById(ctx, id);
  if (!badge) throw new NotFoundError("Badge introuvable");
  return badge;
}

// Badges attribués à un technicien — [] si le technicien n'appartient pas au tenant
// (la lecture ne révèle pas l'existence d'un technicien d'un autre artisan : anti-IDOR).
export function listBadgesDuTechnicien(
  repo: IBadgeRepository,
  ctx: TenantContext,
  technicienId: number,
): Promise<BadgeTechnicien[]> {
  return repo.listBadgesTechnicien(ctx, technicienId);
}
