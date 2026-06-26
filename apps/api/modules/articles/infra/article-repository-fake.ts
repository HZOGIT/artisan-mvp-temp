import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IArticleRepository } from "../application/article-repository";
import type { Article, CreateArticleInput, UpdateArticleInput } from "../domain/article";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le scoping
 * tenant (artisanId forcé) et les défauts PG (unite "unité", tauxTVA "20.00").
 */
export class FakeArticleRepository implements IArticleRepository {
  private store: Article[] = [];
  private seq = 0;

  async list(ctx: TenantContext): Promise<Article[]> {
    return this.store.filter((a) => a.artisanId === ctx.artisanId);
  }

  async listByCategorie(ctx: TenantContext, categorie: string): Promise<Article[]> {
    return this.store.filter((a) => a.artisanId === ctx.artisanId && a.categorie === categorie);
  }

  async getById(ctx: TenantContext, id: number): Promise<Article | null> {
    return this.store.find((a) => a.id === id && a.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateArticleInput): Promise<Article> {
    const now = new Date();
    const a: Article = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      reference: input.reference,
      designation: input.designation,
      description: input.description ?? null,
      unite: input.unite ?? "unité",
      prixUnitaireHT: input.prixUnitaireHT,
      tauxTVA: input.tauxTVA ?? "20.00",
      categorie: input.categorie ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(a);
    return a;
  }

  async update(ctx: TenantContext, id: number, input: UpdateArticleInput): Promise<Article | null> {
    const a = await this.getById(ctx, id);
    if (!a) return null;
    const updated: Article = { ...a, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const a = await this.getById(ctx, id);
    if (!a) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }

  /* ponytail: withDb no-op sur le fake — la DB n'est pas utilisée en mémoire */
  withDb(_db: DbClient): this {
    return this;
  }
}
