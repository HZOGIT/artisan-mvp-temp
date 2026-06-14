import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICategorieDepenseRepository } from "./categorie-depense-repository";
import type { CategorieDepense } from "../domain/categorie-depense";

// Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
// `getCategorie` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.

export function listCategories(repo: ICategorieDepenseRepository, ctx: TenantContext): Promise<CategorieDepense[]> {
  return repo.list(ctx);
}

export async function getCategorie(repo: ICategorieDepenseRepository, ctx: TenantContext, id: number): Promise<CategorieDepense> {
  const categorie = await repo.getById(ctx, id);
  if (!categorie) throw new NotFoundError("Catégorie de dépense introuvable");
  return categorie;
}
