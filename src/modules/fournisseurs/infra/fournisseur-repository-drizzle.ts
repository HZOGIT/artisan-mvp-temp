import { and, asc, eq } from "drizzle-orm";
import { fournisseurs, articlesFournisseurs } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IFournisseurRepository } from "../application/fournisseur-repository";
import type { Fournisseur, CreateFournisseurInput, UpdateFournisseurInput } from "../domain/fournisseur";

type FournisseurRow = typeof fournisseurs.$inferSelect;

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

// Implémentation Drizzle du repository fournisseurs. Double cloisonnement : RLS (rôle app
// + app.tenant via withTenant) ET filtre explicite `artisanId`. La suppression purge les
// associations article-fournisseur (table SANS artisanId : prix d'achat/références
// tenant-privés) après vérification d'ownership — anti-IDOR.
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
      // Vérifie l'appartenance AVANT de toucher les associations (articles_fournisseurs
      // n'a pas d'artisanId → on ne doit pas supprimer celles d'un autre tenant). Atomique.
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
}
