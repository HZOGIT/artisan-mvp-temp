import { and, asc, eq } from "drizzle-orm";
import { devis, devisLignes, devisOptions, devisOptionsLignes } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisOptionRepository } from "../application/devis-option-repository";
import type { CreateDevisOptionInput, DevisOption } from "../domain/devis-option";

type Row = typeof devisOptions.$inferSelect;

function toOption(r: Row): DevisOption {
  return {
    id: r.id,
    devisId: r.devisId,
    nom: r.nom,
    description: r.description ?? null,
    ordre: r.ordre ?? 1,
    totalHT: r.totalHT ?? "0.00",
    totalTVA: r.totalTVA ?? "0.00",
    totalTTC: r.totalTTC ?? "0.00",
    recommandee: r.recommandee ?? false,
    selectionnee: r.selectionnee ?? false,
    dateSelection: r.dateSelection ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * Implémentation Drizzle des options de devis. Les tables `devis_options`/`devis_options_lignes` n'ont
 * PAS d'artisanId (hors RLS) : chaque opération vérifie d'abord l'appartenance du DEVIS parent (sous
 * RLS + filtre explicite `artisanId`) DANS la même transaction `withTenant`. Pas de propriété du devis
 * ⇒ sentinel null/false (le use-case lève NotFoundError). Anti-IDOR identique au legacy
 * `assertDevisOwner`/`assertOptionOwner`, mais renforcé par la RLS de la transaction.
 */
export class DevisOptionRepositoryDrizzle implements IDevisOptionRepository {
  constructor(private readonly db: DbClient) {}

  async listByDevis(ctx: TenantContext, devisId: number): Promise<DevisOption[] | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await ownsDevis(tx, ctx, devisId))) return null;
      const rows = await tx
        .select()
        .from(devisOptions)
        .where(eq(devisOptions.devisId, devisId))
        .orderBy(asc(devisOptions.ordre), asc(devisOptions.id));
      return rows.map(toOption);
    });
  }

  async create(ctx: TenantContext, input: CreateDevisOptionInput): Promise<DevisOption | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await ownsDevis(tx, ctx, input.devisId))) return null;
      const [row] = await tx
        .insert(devisOptions)
        .values({
          devisId: input.devisId,
          nom: input.nom,
          description: input.description ?? null,
          ordre: input.ordre ?? 1,
          recommandee: input.recommandee ?? false,
        })
        .returning();
      return row ? toOption(row) : null;
    });
  }

  async remove(ctx: TenantContext, optionId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const opt = await ownedOption(tx, ctx, optionId);
      if (!opt) return false;
      await tx.delete(devisOptionsLignes).where(eq(devisOptionsLignes.optionId, optionId));
      await tx.delete(devisOptions).where(eq(devisOptions.id, optionId));
      return true;
    });
  }

  async select(ctx: TenantContext, optionId: number): Promise<DevisOption | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const opt = await ownedOption(tx, ctx, optionId);
      if (!opt) return null;
      // Une seule option sélectionnée par devis : reset des autres puis set celle-ci.
      await tx.update(devisOptions).set({ selectionnee: false }).where(eq(devisOptions.devisId, opt.devisId));
      const [row] = await tx
        .update(devisOptions)
        .set({ selectionnee: true, dateSelection: new Date() })
        .where(eq(devisOptions.id, optionId))
        .returning();
      return row ? toOption(row) : null;
    });
  }

  async convertirEnDevis(ctx: TenantContext, optionId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const opt = await ownedOption(tx, ctx, optionId);
      if (!opt) return false;
      const lignesOpt = await tx
        .select()
        .from(devisOptionsLignes)
        .where(eq(devisOptionsLignes.optionId, optionId))
        .orderBy(asc(devisOptionsLignes.ordre), asc(devisOptionsLignes.id));
      // Remplace les lignes officielles du devis parent par celles de l'option.
      await tx.delete(devisLignes).where(eq(devisLignes.devisId, opt.devisId));
      for (const l of lignesOpt) {
        await tx.insert(devisLignes).values({
          devisId: opt.devisId,
          ordre: l.ordre ?? 0,
          designation: l.designation,
          description: l.description,
          quantite: l.quantite,
          unite: l.unite,
          prixUnitaireHT: l.prixUnitaireHT ?? "0.00",
          tauxTVA: l.tauxTVA,
          montantHT: l.montantHT,
          montantTVA: l.montantTVA,
          montantTTC: l.montantTTC,
        });
      }
      // Totaux du devis = totaux (stockés) de l'option (parité legacy `convertirOptionEnDevis`).
      await tx
        .update(devis)
        .set({ totalHT: opt.totalHT, totalTVA: opt.totalTVA, totalTTC: opt.totalTTC })
        .where(and(eq(devis.id, opt.devisId), eq(devis.artisanId, ctx.artisanId)));
      // Marque l'option sélectionnée (reset des autres du même devis).
      await tx.update(devisOptions).set({ selectionnee: false }).where(eq(devisOptions.devisId, opt.devisId));
      await tx
        .update(devisOptions)
        .set({ selectionnee: true, dateSelection: new Date() })
        .where(eq(devisOptions.id, optionId));
      return true;
    });
  }
}

// Le devis `devisId` appartient-il au tenant ? (RLS + filtre explicite artisanId — défense en profondeur.)
async function ownsDevis(tx: DbClient, ctx: TenantContext, devisId: number): Promise<boolean> {
  const [row] = await tx
    .select({ id: devis.id })
    .from(devis)
    .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)))
    .limit(1);
  return Boolean(row);
}

// Charge l'option `optionId` SI son devis parent appartient au tenant (anti-IDOR via le parent).
async function ownedOption(tx: DbClient, ctx: TenantContext, optionId: number): Promise<Row | null> {
  const [opt] = await tx.select().from(devisOptions).where(eq(devisOptions.id, optionId)).limit(1);
  if (!opt) return null;
  return (await ownsDevis(tx, ctx, opt.devisId)) ? opt : null;
}
