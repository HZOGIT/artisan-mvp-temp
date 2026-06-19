import { and, asc, eq } from "drizzle-orm";
import { reglesCategorisation } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IRegleCategorisationRepository } from "../application/regle-categorisation-repository";
import type { RegleCategorisation, CreateRegleInput, UpdateRegleInput } from "../domain/regle-categorisation";

type RegleRow = typeof reglesCategorisation.$inferSelect;
type RegleInsert = typeof reglesCategorisation.$inferInsert;

// Traduit une ligne PG (colonnes snake_case) → domaine (camelCase). Défaut `actif` true si null.
function toRegle(r: RegleRow): RegleCategorisation {
  return {
    id: r.id,
    artisanId: r.artisan_id,
    motifLibelle: r.motif_libelle,
    categorie: r.categorie,
    actif: r.actif ?? true,
    createdAt: r.created_at ?? new Date(),
  };
}

// Mappe les champs camelCase de l'input vers les colonnes snake_case (seuls les champs fournis).
function toSet(input: UpdateRegleInput): Partial<RegleInsert> {
  const set: Partial<RegleInsert> = {};
  if (input.motifLibelle !== undefined) set.motif_libelle = input.motifLibelle;
  if (input.categorie !== undefined) set.categorie = input.categorie;
  if (input.actif !== undefined) set.actif = input.actif;
  return set;
}

/*
 * Implémentation Drizzle du repository regles-categorisation. Double cloisonnement RLS + filtre
 * `artisan_id` sur `regles_categorisation`. `artisan_id` forcé à la création. Pas de contrainte
 * d'unicité sur ce domaine (plusieurs règles peuvent partager motif/catégorie).
 */
export class RegleCategorisationRepositoryDrizzle implements IRegleCategorisationRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<RegleCategorisation[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(reglesCategorisation)
        .where(eq(reglesCategorisation.artisan_id, ctx.artisanId))
        .orderBy(asc(reglesCategorisation.id));
      return rows.map(toRegle);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<RegleCategorisation | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(reglesCategorisation)
        .where(and(eq(reglesCategorisation.id, id), eq(reglesCategorisation.artisan_id, ctx.artisanId)))
        .limit(1);
      return row ? toRegle(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateRegleInput): Promise<RegleCategorisation> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(reglesCategorisation)
        .values({
          artisan_id: ctx.artisanId,
          motif_libelle: input.motifLibelle,
          categorie: input.categorie,
          actif: input.actif ?? undefined,
        })
        .returning();
      return toRegle(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateRegleInput): Promise<RegleCategorisation | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set = toSet(input);
      if (Object.keys(set).length === 0) {
        const [row] = await tx
          .select()
          .from(reglesCategorisation)
          .where(and(eq(reglesCategorisation.id, id), eq(reglesCategorisation.artisan_id, ctx.artisanId)))
          .limit(1);
        return row ? toRegle(row) : null;
      }
      const [row] = await tx
        .update(reglesCategorisation)
        .set(set)
        .where(and(eq(reglesCategorisation.id, id), eq(reglesCategorisation.artisan_id, ctx.artisanId)))
        .returning();
      return row ? toRegle(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(reglesCategorisation)
        .where(and(eq(reglesCategorisation.id, id), eq(reglesCategorisation.artisan_id, ctx.artisanId)))
        .returning({ id: reglesCategorisation.id });
      return deleted.length > 0;
    });
  }
}
