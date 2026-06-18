import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRegleCategorisationRepository } from "./regle-categorisation-repository";
import type { RegleCategorisation, CreateRegleInput, UpdateRegleInput } from "../domain/regle-categorisation";

// Use-cases d'écriture — purs, repository injecté. Validation métier. Pas de contrainte d'unicité sur
// ce domaine (plusieurs règles peuvent partager motif/catégorie). Le scoping tenant est porté par le repo.

export async function creerRegle(
  repo: IRegleCategorisationRepository,
  ctx: TenantContext,
  input: CreateRegleInput,
): Promise<RegleCategorisation> {
  if (!input.motifLibelle?.trim()) throw new ValidationError("Le libellé du motif est requis");
  if (!input.categorie?.trim()) throw new ValidationError("La catégorie est requise");
  return repo.create(ctx, input); // actif défaut true par l'infra
}

export async function modifierRegle(
  repo: IRegleCategorisationRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateRegleInput,
): Promise<RegleCategorisation> {
  if (input.motifLibelle !== undefined && !input.motifLibelle.trim()) throw new ValidationError("Le libellé du motif est requis");
  if (input.categorie !== undefined && !input.categorie.trim()) throw new ValidationError("La catégorie est requise");
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Règle de catégorisation introuvable");
  return updated;
}

export async function supprimerRegle(repo: IRegleCategorisationRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Règle de catégorisation introuvable");
}
