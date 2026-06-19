import type { TenantContext } from "../../../shared/tenant";
import type { Article, CreateArticleInput, UpdateArticleInput } from "../domain/article";

/*
 * Port du repository articles (catalogue artisan). Chaque méthode exige le TenantContext (scope
 * tenant + RLS). `articles_artisan` possède un `artisanId` → double cloisonnement RLS + filtre.
 */
export interface IArticleRepository {
  list(ctx: TenantContext): Promise<Article[]>;
  /** Articles du tenant filtrés par catégorie (scopé tenant ; [] si aucune correspondance). */
  listByCategorie(ctx: TenantContext, categorie: string): Promise<Article[]>;
  /** null si l'article n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<Article | null>;
  create(ctx: TenantContext, input: CreateArticleInput): Promise<Article>;
  /** null si l'article n'appartient pas au tenant. */
  update(ctx: TenantContext, id: number, input: UpdateArticleInput): Promise<Article | null>;
  /** false si l'article n'appartient pas au tenant. */
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
