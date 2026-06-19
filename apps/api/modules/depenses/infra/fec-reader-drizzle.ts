import { and, asc, between, eq } from "drizzle-orm";
import { depenses, configurationsComptables } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { FecReader } from "../application/fec-reader";
import type { FecDepense, ConfigComptable } from "../domain/fec";

/** Défauts PCG (plan comptable général) si aucune config comptable enregistrée — parité legacy. */
const DEFAULT_CONFIG: ConfigComptable = {
  compteAchats: "607000",
  compteTVADeductible: "445660",
  compteFournisseurs: "401000",
  journalAchats: "AC",
};

export class FecReaderDrizzle implements FecReader {
  constructor(private readonly db: DbClient) {}

  listDepensesDeductibles(ctx: TenantContext, dateDebut: string, dateFin: string): Promise<FecDepense[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({
          id: depenses.id,
          numero: depenses.numero,
          dateDepense: depenses.date_depense,
          fournisseur: depenses.fournisseur,
          montantHt: depenses.montant_ht,
          montantTva: depenses.montant_tva,
          montantTtc: depenses.montant_ttc,
          description: depenses.description,
        })
        .from(depenses)
        .where(and(eq(depenses.artisan_id, ctx.artisanId), between(depenses.date_depense, dateDebut, dateFin), eq(depenses.tva_deductible, true)))
        .orderBy(asc(depenses.date_depense), asc(depenses.id));
      return rows.map((r) => ({
        id: r.id,
        numero: r.numero,
        dateDepense: r.dateDepense,
        fournisseur: r.fournisseur ?? null,
        montantHt: r.montantHt ?? "0",
        montantTva: r.montantTva ?? "0",
        montantTtc: r.montantTtc ?? "0",
        description: r.description ?? null,
      }));
    });
  }

  getConfigComptable(ctx: TenantContext): Promise<ConfigComptable> {
    return withTenant(this.db, ctx, async (tx) => {
      const [c] = await tx.select().from(configurationsComptables).where(eq(configurationsComptables.artisanId, ctx.artisanId)).limit(1);
      if (!c) return DEFAULT_CONFIG;
      return {
        compteAchats: c.compteAchats ?? DEFAULT_CONFIG.compteAchats,
        compteTVADeductible: c.compteTVADeductible ?? DEFAULT_CONFIG.compteTVADeductible,
        compteFournisseurs: c.compteFournisseurs ?? DEFAULT_CONFIG.compteFournisseurs,
        journalAchats: c.journalAchats ?? DEFAULT_CONFIG.journalAchats,
      };
    });
  }
}
