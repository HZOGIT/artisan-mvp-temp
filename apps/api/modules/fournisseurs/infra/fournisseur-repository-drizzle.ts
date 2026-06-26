import { and, asc, desc, eq } from "drizzle-orm";
import { fournisseurs, articlesFournisseurs, articlesArtisan } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IFournisseurRepository } from "../application/fournisseur-repository";
import type { Fournisseur, CreateFournisseurInput, UpdateFournisseurInput } from "../domain/fournisseur";
import type { ArticleFournisseur, AjouterAssociationInput } from "../domain/article-fournisseur";

type FournisseurRow = typeof fournisseurs.$inferSelect;
type AssocRow = typeof articlesFournisseurs.$inferSelect;

function toAssoc(r: AssocRow): ArticleFournisseur {
  return {
    id: r.id,
    articleId: r.articleId,
    fournisseurId: r.fournisseurId,
    referenceExterne: r.referenceExterne ?? null,
    prixAchat: r.prixAchat ?? null,
    delaiLivraison: r.delaiLivraison ?? null,
    createdAt: r.createdAt,
  };
}

function toFournisseur(r: FournisseurRow): Fournisseur {
  return {
    id: r.id,
    artisanId: r.artisanId,
    nom: r.nom,
    contact: r.contact ?? null,
    email: r.email ?? null,
    telephone: r.telephone ?? null,
    adresse: r.adresse ?? null,
    codePostal: r.codePostal ?? null,
    ville: r.ville ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * Implémentation Drizzle du repository fournisseurs. Double cloisonnement : RLS (rôle app
 * + app.tenant via withTenant) ET filtre explicite `artisanId`. La suppression purge les
 * associations article-fournisseur (table SANS artisanId : prix d'achat/références
 * tenant-privés) après vérification d'ownership — anti-IDOR.
 */
export class FournisseurRepositoryDrizzle implements IFournisseurRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Fournisseur[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(fournisseurs)
        .where(eq(fournisseurs.artisanId, ctx.artisanId))
        .orderBy(asc(fournisseurs.nom), asc(fournisseurs.id));
      return rows.map(toFournisseur);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Fournisseur | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, id), eq(fournisseurs.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toFournisseur(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateFournisseurInput): Promise<Fournisseur> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(fournisseurs)
        .values({ ...input, artisanId: ctx.artisanId } as typeof fournisseurs.$inferInsert)
        .returning();
      return toFournisseur(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateFournisseurInput): Promise<Fournisseur | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(fournisseurs)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(fournisseurs.id, id), eq(fournisseurs.artisanId, ctx.artisanId)))
        .returning();
      return row ? toFournisseur(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Vérifie l'appartenance AVANT de toucher les associations (articles_fournisseurs
       * n'a pas d'artisanId → on ne doit pas supprimer celles d'un autre tenant). Atomique.
       */
      const [owned] = await tx
        .select({ id: fournisseurs.id })
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, id), eq(fournisseurs.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return false;

      await tx.delete(articlesFournisseurs).where(eq(articlesFournisseurs.fournisseurId, id));
      const deleted = await tx
        .delete(fournisseurs)
        .where(and(eq(fournisseurs.id, id), eq(fournisseurs.artisanId, ctx.artisanId)))
        .returning({ id: fournisseurs.id });
      return deleted.length > 0;
    });
  }

  listAssociationsArticle(ctx: TenantContext, articleId: number): Promise<ArticleFournisseur[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsArticle(tx, ctx, articleId))) return [];
      /** Seules les associations dont le fournisseur appartient au tenant (anti-IDOR prix). */
      const rows = await tx
        .select({ a: articlesFournisseurs })
        .from(articlesFournisseurs)
        .innerJoin(fournisseurs, eq(fournisseurs.id, articlesFournisseurs.fournisseurId))
        .where(and(eq(articlesFournisseurs.articleId, articleId), eq(fournisseurs.artisanId, ctx.artisanId)))
        .orderBy(desc(articlesFournisseurs.id));
      return rows.map((r) => toAssoc(r.a));
    });
  }

  listAssociationsFournisseur(ctx: TenantContext, fournisseurId: number): Promise<ArticleFournisseur[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsFournisseur(tx, ctx, fournisseurId))) return [];
      const rows = await tx
        .select()
        .from(articlesFournisseurs)
        .where(eq(articlesFournisseurs.fournisseurId, fournisseurId))
        .orderBy(desc(articlesFournisseurs.id));
      return rows.map(toAssoc);
    });
  }

  ajouterAssociation(ctx: TenantContext, input: AjouterAssociationInput): Promise<ArticleFournisseur | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** L'article ET le fournisseur doivent appartenir au tenant (anti-IDOR sur les 2 FK). */
      if (!(await this.ownsArticle(tx, ctx, input.articleId))) return null;
      if (!(await this.ownsFournisseur(tx, ctx, input.fournisseurId))) return null;
      const [row] = await tx
        .insert(articlesFournisseurs)
        .values({
          articleId: input.articleId,
          fournisseurId: input.fournisseurId,
          referenceExterne: input.referenceExterne ?? null,
          prixAchat: input.prixAchat ?? null,
          delaiLivraison: input.delaiLivraison ?? null,
        })
        .returning();
      return toAssoc(row);
    });
  }

  supprimerAssociation(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      /** L'association doit cibler un fournisseur du tenant (jointure scopée) avant suppression. */
      const [assoc] = await tx
        .select({ id: articlesFournisseurs.id })
        .from(articlesFournisseurs)
        .innerJoin(fournisseurs, eq(fournisseurs.id, articlesFournisseurs.fournisseurId))
        .where(and(eq(articlesFournisseurs.id, id), eq(fournisseurs.artisanId, ctx.artisanId)))
        .limit(1);
      if (!assoc) return false;
      const deleted = await tx
        .delete(articlesFournisseurs)
        .where(eq(articlesFournisseurs.id, id))
        .returning({ id: articlesFournisseurs.id });
      return deleted.length > 0;
    });
  }

  /** L'article appartient-il au tenant ? (articles_artisan a un artisanId → RLS + filtre) */
  private async ownsArticle(tx: DbClient, ctx: TenantContext, articleId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: articlesArtisan.id })
      .from(articlesArtisan)
      .where(and(eq(articlesArtisan.id, articleId), eq(articlesArtisan.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
  }

  withDb(db: DbClient): FournisseurRepositoryDrizzle {
    return new FournisseurRepositoryDrizzle(db);
  }

  /** Le fournisseur appartient-il au tenant ? (RLS + filtre artisanId) */
  private async ownsFournisseur(tx: DbClient, ctx: TenantContext, fournisseurId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: fournisseurs.id })
      .from(fournisseurs)
      .where(and(eq(fournisseurs.id, fournisseurId), eq(fournisseurs.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
  }
}
