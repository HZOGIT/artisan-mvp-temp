import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeAvisRepository } from "./demande-avis-repository";
import type { CreateDemandeAvisInput, DemandeAvis } from "../domain/demande-avis";

// Use-cases d'écriture — purs, repository injecté. ⚠️ Anti-IDOR sur 2 FK : clientId ET interventionId
// doivent appartenir au tenant (sinon NotFound — on ne révèle pas l'existence cross-tenant). Le token
// et le statut initial ("envoyee") sont posés par l'infra (jamais fournis). Les transitions de statut
// sont des use-cases dédiés (7/9), PAS ici. Le scoping tenant est porté par le repo.

export async function creerDemandeAvis(
  repo: IDemandeAvisRepository,
  ctx: TenantContext,
  input: CreateDemandeAvisInput,
): Promise<DemandeAvis> {
  if (input.expiresAt !== undefined && input.expiresAt.getTime() <= Date.now()) {
    throw new ValidationError("La date d'expiration doit être dans le futur");
  }
  // Anti-IDOR-FK : les 2 références doivent relever du tenant courant.
  if (!(await repo.ownsClient(ctx, input.clientId))) throw new NotFoundError("Client introuvable");
  if (!(await repo.ownsIntervention(ctx, input.interventionId))) throw new NotFoundError("Intervention introuvable");
  return repo.create(ctx, input); // token + statut "envoyee" forcés par l'infra
}

export async function supprimerDemandeAvis(repo: IDemandeAvisRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Demande d'avis introuvable");
}
