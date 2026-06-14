import { and, asc, eq } from "drizzle-orm";
import { articlesArtisan } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IArticleRepository } from "../application/article-repository";
import type { Article, CreateArticleInput, UpdateArticleInput } from "../domain/article";

type ArticleRow = typeof articlesArtisan.$inferSelect;

function toArticle(r: ArticleRow): Article {
  return {
    id: r.id,
    artisanId: r.artisanId,
    reference: r.reference,
    designation: r.designation,
    description: r.description ?? null,
    unite: r.unite ?? "unité",
    prixUnitaireHT: r.prixUnitaireHT ?? "0.00",
    tauxTVA: r.tauxTVA ?? "20.00",
    categorie: r.categorie ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle du repository articles (catalogue artisan). Double cloisonnement RLS +
// filtre `artisanId` sur `articles_artisan`. `artisanId` est forcé au tenant à la création.
export class ArticleRepositoryDrizzle implements IArticleRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Article[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(articlesArtisan)
        .where(eq(articlesArtisan.artisanId, ctx.artisanId))
        .orderBy(asc(articlesArtisan.designation), asc(articlesArtisan.id));
      return rows.map(toArticle);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Article | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(articlesArtisan)
        .where(and(eq(articlesArtisan.id, id), eq(articlesArtisan.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toArticle(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateArticleInput): Promise<Article> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(articlesArtisan)
        .values({
          artisanId: ctx.artisanId,
          reference: input.reference,
          designation: input.designation,
          prixUnitaireHT: input.prixUnitaireHT,
          description: input.description ?? null,
          unite: input.unite ?? undefined,
          tauxTVA: input.tauxTVA ?? undefined,
          categorie: input.categorie ?? null,
        })
        .returning();
      return toArticle(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateArticleInput): Promise<Article | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // Construit le set des seuls champs fournis (no-op si vide : renvoie l'état courant scopé).
      const set: Partial<typeof articlesArtisan.$inferInsert> = {};
      if (input.reference !== undefined) set.reference = input.reference;
      if (input.designation !== undefined) set.designation = input.designation;
      if (input.prixUnitaireHT !== undefined) set.prixUnitaireHT = input.prixUnitaireHT;
      if (input.description !== undefined) set.description = input.description;
      if (input.unite !== undefined) set.unite = input.unite;
      if (input.tauxTVA !== undefined) set.tauxTVA = input.tauxTVA;
      if (input.categorie !== undefined) set.categorie = input.categorie;
      if (Object.keys(set).length === 0) {
        const [row] = await tx
          .select()
          .from(articlesArtisan)
          .where(and(eq(articlesArtisan.id, id), eq(articlesArtisan.artisanId, ctx.artisanId)))
          .limit(1);
        return row ? toArticle(row) : null;
      }
      const [row] = await tx
        .update(articlesArtisan)
        .set(set)
        .where(and(eq(articlesArtisan.id, id), eq(articlesArtisan.artisanId, ctx.artisanId)))
        .returning();
      return row ? toArticle(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(articlesArtisan)
        .where(and(eq(articlesArtisan.id, id), eq(articlesArtisan.artisanId, ctx.artisanId)))
        .returning({ id: articlesArtisan.id });
      return deleted.length > 0;
    });
  }
}
