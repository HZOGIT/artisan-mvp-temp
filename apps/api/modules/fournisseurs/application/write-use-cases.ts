import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IFournisseurRepository } from "./fournisseur-repository";
import type { Fournisseur, CreateFournisseurInput, UpdateFournisseurInput } from "../domain/fournisseur";

// Use-cases d'écriture — purs, repository injecté. Le tenant est porté par le ctx ;
// une opération sur une ressource hors tenant (repo → null/false) lève NotFoundError.

export async function creerFournisseur(
  repo: IFournisseurRepository,
  ctx: TenantContext,
  input: CreateFournisseurInput,
): Promise<Fournisseur> {
  if (!input.nom?.trim()) throw new ValidationError("Nom du fournisseur requis");
  return repo.create(ctx, input);
}

export async function modifierFournisseur(
  repo: IFournisseurRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateFournisseurInput,
): Promise<Fournisseur> {
  if (input.nom !== undefined && !input.nom.trim()) throw new ValidationError("Nom du fournisseur requis");
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Fournisseur introuvable");
  return updated;
}

export async function supprimerFournisseur(repo: IFournisseurRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Fournisseur introuvable");
}
