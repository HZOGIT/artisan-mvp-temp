import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IArticleRepository } from "./article-repository";
import type { Article } from "../domain/article";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). `getArticle` sur une ressource d'un autre tenant → le
// repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).

export function listArticles(repo: IArticleRepository, ctx: TenantContext): Promise<Article[]> {
  return repo.list(ctx);
}

// Catalogue filtré par catégorie (scopé tenant). Une catégorie inconnue renvoie [] (pas une
// erreur métier).
export function articlesParCategorie(repo: IArticleRepository, ctx: TenantContext, categorie: string): Promise<Article[]> {
  return repo.listByCategorie(ctx, categorie);
}

export async function getArticle(repo: IArticleRepository, ctx: TenantContext, id: number): Promise<Article> {
  const article = await repo.getById(ctx, id);
  if (!article) throw new NotFoundError("Article introuvable");
  return article;
}
