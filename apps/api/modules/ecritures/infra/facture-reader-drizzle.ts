import { and, asc, eq } from "drizzle-orm";
import { factures, facturesLignes } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IFactureReader, FactureReadModel, FactureLigneReadModel } from "../application/facture-reader";

// Lecture du domaine factures pour la génération FEC. Scopé tenant (RLS + filtre
// `factures.artisanId`). Les `factures_lignes` (SANS artisanId) sont scopées via la facture
// parente. Modèles de lecture propres (pas de couplage au module factures).
export class FactureReaderDrizzle implements IFactureReader {
  constructor(private readonly db: DbClient) {}

  getFacture(ctx: TenantContext, factureId: number): Promise<FactureReadModel | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx
        .select()
        .from(factures)
        .where(and(eq(factures.id, factureId), eq(factures.artisanId, ctx.artisanId)))
        .limit(1);
      if (!r) return null;
      return {
        id: r.id,
        artisanId: r.artisanId,
        numero: r.numero,
        dateFacture: r.dateFacture,
        typeDocument: r.typeDocument ?? "facture",
        statut: r.statut ?? "brouillon",
        datePaiement: r.datePaiement ?? null,
        totalHT: r.totalHT ?? "0.00",
        totalTVA: r.totalTVA ?? "0.00",
        totalTTC: r.totalTTC ?? "0.00",
      };
    });
  }

  getLignes(ctx: TenantContext, factureId: number): Promise<FactureLigneReadModel[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const [owned] = await tx
        .select({ id: factures.id })
        .from(factures)
        .where(and(eq(factures.id, factureId), eq(factures.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return [];
      const rows = await tx
        .select({ tauxTVA: facturesLignes.tauxTVA, montantTVA: facturesLignes.montantTVA })
        .from(facturesLignes)
        .where(eq(facturesLignes.factureId, factureId))
        .orderBy(asc(facturesLignes.id));
      return rows.map((l) => ({ tauxTVA: l.tauxTVA ?? "20.00", montantTVA: l.montantTVA ?? "0.00" }));
    });
  }
}
