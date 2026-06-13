import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IBadgeRepository } from "./badge-repository";
import type { Badge, BadgeTechnicien, CreateBadgeInput, UpdateBadgeInput } from "../domain/badge";

// Use-cases d'écriture — purs, repository injecté. Le tenant est porté par le ctx ;
// une opération sur une ressource hors tenant (repo → null/false) lève NotFoundError.

export async function creerBadge(repo: IBadgeRepository, ctx: TenantContext, input: CreateBadgeInput): Promise<Badge> {
  if (!input.code?.trim()) throw new ValidationError("Code du badge requis");
  if (!input.nom?.trim()) throw new ValidationError("Nom du badge requis");
  return repo.create(ctx, input);
}

export async function modifierBadge(
  repo: IBadgeRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateBadgeInput,
): Promise<Badge> {
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Badge introuvable");
  return updated;
}

export async function supprimerBadge(repo: IBadgeRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Badge introuvable");
}

// Attribue un badge à un technicien. Anti-IDOR : le repo renvoie null si le technicien
// OU le badge n'appartient pas au tenant → NotFoundError (uniforme, pas d'oracle).
// Idempotent (le repo renvoie l'attribution existante le cas échéant).
export async function attribuerBadge(
  repo: IBadgeRepository,
  ctx: TenantContext,
  technicienId: number,
  badgeId: number,
  valeurAtteinte?: number | null,
): Promise<BadgeTechnicien> {
  const attribution = await repo.attribuer(ctx, technicienId, badgeId, valeurAtteinte);
  if (!attribution) throw new NotFoundError("Technicien ou badge introuvable");
  return attribution;
}
