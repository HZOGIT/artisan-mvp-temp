import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IArticleRepository } from "./article-repository";
import type { Article, CreateArticleInput, UpdateArticleInput } from "../domain/article";

/*
 * Use-cases d'écriture — purs, repository injecté. Validation métier (reference/designation non
 * vides, prixUnitaireHT ≥ 0, tauxTVA ∈ [0,100]). Le scoping tenant est porté par le repo.
 */

function assertPrixValide(prixUnitaireHT: string): void {
  const p = Number(prixUnitaireHT);
  if (!Number.isFinite(p) || p < 0) throw new ValidationError("Le prix unitaire HT doit être un nombre positif");
}

function assertTauxValide(tauxTVA: string): void {
  const t = Number(tauxTVA);
  if (!Number.isFinite(t) || t < 0 || t > 100) throw new ValidationError("Le taux de TVA doit être compris entre 0 et 100");
}

export async function creerArticle(
  repo: IArticleRepository,
  ctx: TenantContext,
  input: CreateArticleInput,
): Promise<Article> {
  if (!input.reference?.trim()) throw new ValidationError("La référence est requise");
  if (!input.designation?.trim()) throw new ValidationError("La désignation est requise");
  assertPrixValide(input.prixUnitaireHT);
  if (input.tauxTVA != null) assertTauxValide(input.tauxTVA);
  return repo.create(ctx, input);
}

export async function modifierArticle(
  repo: IArticleRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateArticleInput,
): Promise<Article> {
  if (input.reference !== undefined && !input.reference.trim()) throw new ValidationError("La référence est requise");
  if (input.designation !== undefined && !input.designation.trim()) throw new ValidationError("La désignation est requise");
  if (input.prixUnitaireHT !== undefined) assertPrixValide(input.prixUnitaireHT);
  if (input.tauxTVA != null) assertTauxValide(input.tauxTVA);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Article introuvable");
  return updated;
}

export async function supprimerArticle(repo: IArticleRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Article introuvable");
}
