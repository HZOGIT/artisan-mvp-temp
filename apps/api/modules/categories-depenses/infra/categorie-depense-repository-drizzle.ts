import { and, asc, eq } from "drizzle-orm";
import { categoriesDepenses } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICategorieDepenseRepository } from "../application/categorie-depense-repository";
import type { CategorieDepense, CreateCategorieInput, UpdateCategorieInput } from "../domain/categorie-depense";

type CategorieRow = typeof categoriesDepenses.$inferSelect;
type CategorieInsert = typeof categoriesDepenses.$inferInsert;

/** Traduit une ligne PG (colonnes snake_case) → domaine (camelCase). Défauts du domaine si null. */
function toCategorie(r: CategorieRow): CategorieDepense {
  return {
    id: r.id,
    artisanId: r.artisan_id,
    nom: r.nom,
    couleur: r.couleur ?? "#6366f1",
    icone: r.icone ?? "Receipt",
    compteComptable: r.compte_comptable ?? null,
    deductibleTva: r.deductible_tva ?? true,
    deductibleIr: r.deductible_ir ?? true,
    plafondMensuel: r.plafond_mensuel ?? null,
    actif: r.actif ?? true,
    ordre: r.ordre ?? 0,
    createdAt: r.created_at ?? new Date(),
  };
}

/*
 * Violation de contrainte unique PostgreSQL (uq_cat_artisan_nom) → ConflictError métier.
 * ⚠️ Drizzle enveloppe l'erreur pg (« Failed query: … ») : le code `23505` est porté par la chaîne
 * de `cause`. On remonte les causes pour le détecter.
 */
function estViolationUnique(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; e != null && i < 5; i++) {
    if (typeof e === "object" && (e as { code?: string }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

function relancerSiDoublon(err: unknown): never {
  if (estViolationUnique(err)) throw new ConflictError("Une catégorie portant ce nom existe déjà");
  throw err;
}

/** Mappe les champs camelCase de l'input vers les colonnes snake_case (seuls les champs fournis). */
function toSet(input: UpdateCategorieInput): Partial<CategorieInsert> {
  const set: Partial<CategorieInsert> = {};
  if (input.nom !== undefined) set.nom = input.nom;
  if (input.couleur !== undefined) set.couleur = input.couleur;
  if (input.icone !== undefined) set.icone = input.icone;
  if (input.compteComptable !== undefined) set.compte_comptable = input.compteComptable;
  if (input.deductibleTva !== undefined) set.deductible_tva = input.deductibleTva;
  if (input.deductibleIr !== undefined) set.deductible_ir = input.deductibleIr;
  if (input.plafondMensuel !== undefined) set.plafond_mensuel = input.plafondMensuel;
  if (input.actif !== undefined) set.actif = input.actif;
  if (input.ordre !== undefined) set.ordre = input.ordre;
  return set;
}

/*
 * Implémentation Drizzle du repository categories-depenses. Double cloisonnement RLS + filtre
 * `artisan_id` sur `categories_depenses`. `artisan_id` forcé à la création. ⚠️ Contrainte DB UNIQUE
 * (artisan_id, nom) → les violations (PG 23505) sont traduites en ConflictError.
 */
export class CategorieDepenseRepositoryDrizzle implements ICategorieDepenseRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<CategorieDepense[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(categoriesDepenses)
        .where(eq(categoriesDepenses.artisan_id, ctx.artisanId))
        .orderBy(asc(categoriesDepenses.ordre), asc(categoriesDepenses.id));
      return rows.map(toCategorie);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<CategorieDepense | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(categoriesDepenses)
        .where(and(eq(categoriesDepenses.id, id), eq(categoriesDepenses.artisan_id, ctx.artisanId)))
        .limit(1);
      return row ? toCategorie(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateCategorieInput): Promise<CategorieDepense> {
    return withTenant(this.db, ctx, async (tx) => {
      try {
        const [row] = await tx
          .insert(categoriesDepenses)
          .values({
            artisan_id: ctx.artisanId,
            nom: input.nom,
            couleur: input.couleur ?? undefined,
            icone: input.icone ?? undefined,
            compte_comptable: input.compteComptable ?? null,
            deductible_tva: input.deductibleTva ?? undefined,
            deductible_ir: input.deductibleIr ?? undefined,
            plafond_mensuel: input.plafondMensuel ?? null,
            actif: input.actif ?? undefined,
            ordre: input.ordre ?? undefined,
          })
          .returning();
        return toCategorie(row);
      } catch (err) {
        /* ponytail: best-effort — relancerSiDoublon rethrow si doublon, sinon erreur propagée */
        return relancerSiDoublon(err);
      }
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateCategorieInput): Promise<CategorieDepense | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set = toSet(input);
      if (Object.keys(set).length === 0) {
        const [row] = await tx
          .select()
          .from(categoriesDepenses)
          .where(and(eq(categoriesDepenses.id, id), eq(categoriesDepenses.artisan_id, ctx.artisanId)))
          .limit(1);
        return row ? toCategorie(row) : null;
      }
      try {
        const [row] = await tx
          .update(categoriesDepenses)
          .set(set)
          .where(and(eq(categoriesDepenses.id, id), eq(categoriesDepenses.artisan_id, ctx.artisanId)))
          .returning();
        return row ? toCategorie(row) : null;
      } catch (err) {
        /* ponytail: best-effort — relancerSiDoublon rethrow si doublon, sinon erreur propagée */
        return relancerSiDoublon(err);
      }
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(categoriesDepenses)
        .where(and(eq(categoriesDepenses.id, id), eq(categoriesDepenses.artisan_id, ctx.artisanId)))
        .returning({ id: categoriesDepenses.id });
      return deleted.length > 0;
    });
  }

  withDb(db: DbClient): CategorieDepenseRepositoryDrizzle {
    return new CategorieDepenseRepositoryDrizzle(db);
  }
}
