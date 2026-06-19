import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IFournisseurRepository } from "./fournisseur-repository";
import type { ArticleFournisseur, AjouterAssociationInput } from "../domain/article-fournisseur";

/*
 * Use-cases des associations article↔fournisseur (prix d'achat) — purs, repo injecté.
 * Anti-IDOR : lectures sans oracle ([] si ressource hors tenant), écritures → NotFound.
 */

export function listerFournisseursDeArticle(
  repo: IFournisseurRepository,
  ctx: TenantContext,
  articleId: number,
): Promise<ArticleFournisseur[]> {
  return repo.listAssociationsArticle(ctx, articleId);
}

export function listerArticlesDeFournisseur(
  repo: IFournisseurRepository,
  ctx: TenantContext,
  fournisseurId: number,
): Promise<ArticleFournisseur[]> {
  return repo.listAssociationsFournisseur(ctx, fournisseurId);
}

// Associe un article à un fournisseur (→ NotFound si article OU fournisseur hors tenant).
export async function associerArticleFournisseur(
  repo: IFournisseurRepository,
  ctx: TenantContext,
  input: AjouterAssociationInput,
): Promise<ArticleFournisseur> {
  const assoc = await repo.ajouterAssociation(ctx, input);
  if (!assoc) throw new NotFoundError("Article ou fournisseur introuvable");
  return assoc;
}

// Dissocie (supprime l'association) — → NotFound si elle ne relève pas du tenant.
export async function dissocierArticleFournisseur(
  repo: IFournisseurRepository,
  ctx: TenantContext,
  id: number,
): Promise<void> {
  const ok = await repo.supprimerAssociation(ctx, id);
  if (!ok) throw new NotFoundError("Association introuvable");
}
