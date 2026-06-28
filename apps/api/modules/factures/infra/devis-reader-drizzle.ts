import { and, asc, eq, sql } from "drizzle-orm";
import { devis, devisLignes } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisReader, DevisReadModel, DevisLigneReadModel } from "../application/devis-reader";
import { ValidationError } from "../../../shared/errors";
import { round2 } from "../../../shared/money";

/*
 * Lecture du domaine devis pour la conversion devis→facture. Scopé tenant (RLS + filtre
 * `devis.artisanId`). Les `devis_lignes` (SANS artisanId) sont scopées via le devis parent.
 */
export class DevisReaderDrizzle implements IDevisReader {
  constructor(private readonly db: DbClient) {}

  getDevis(ctx: TenantContext, devisId: number): Promise<DevisReadModel | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx
        .select()
        .from(devis)
        .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)))
        .limit(1);
      if (!r) return null;
      return {
        id: r.id,
        artisanId: r.artisanId,
        clientId: r.clientId,
        numero: r.numero,
        statut: r.statut ?? "brouillon",
        objet: r.objet ?? null,
        referenceClient: r.referenceClient ?? null,
        conditionsPaiement: r.conditionsPaiement ?? null,
        notes: r.notes ?? null,
        totalHT: r.totalHT ?? "0.00",
        totalTVA: r.totalTVA ?? "0.00",
        totalTTC: r.totalTTC ?? "0.00",
        montantDejaFacture: r.montantDejaFacture ?? "0.00",
      };
    });
  }

  updateMontantDejaFacture(ctx: TenantContext, devisId: number, montant: string): Promise<void> {
    if (!Number.isFinite(Number(montant)) || Number(montant) < 0) {
      return Promise.reject(new ValidationError("Montant invalide"));
    }
    return withTenant(this.db, ctx, (tx) => this.updateMontantDejaFactureTx(tx, ctx, devisId, montant));
  }

  /** delta = montant TTC de la situation à AJOUTER. SELECT FOR UPDATE sérialise les écritures. */
  updateMontantDejaFactureTx(tx: DbClient, ctx: TenantContext, devisId: number, delta: string): Promise<void> {
    if (!Number.isFinite(Number(delta)) || Number(delta) <= 0) {
      return Promise.reject(new ValidationError("Delta invalide"));
    }
    return (async () => {
      await tx.execute(sql`SELECT * FROM "devis" WHERE id = ${devisId} AND "artisanId" = ${ctx.artisanId} FOR UPDATE`);
      const [row] = await tx
        .select()
        .from(devis)
        .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)))
        .limit(1);
      if (!row) throw new ValidationError("Devis introuvable");
      const EPS = 0.005;
      const newCumul = round2(Number(row.montantDejaFacture ?? "0") + Number(delta));
      if (newCumul > Number(row.totalTTC ?? "0") + EPS) {
        throw new ValidationError("Le cumul des situations dépasse le total TTC du devis");
      }
      await tx
        .update(devis)
        .set({ montantDejaFacture: newCumul.toFixed(2) })
        .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)));
    })();
  }

  getLignes(ctx: TenantContext, devisId: number): Promise<DevisLigneReadModel[]> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Scope via le devis parent : si le devis n'est pas du tenant → []. */
      const [owned] = await tx
        .select({ id: devis.id })
        .from(devis)
        .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return [];
      const rows = await tx
        .select()
        .from(devisLignes)
        .where(eq(devisLignes.devisId, devisId))
        .orderBy(asc(devisLignes.ordre), asc(devisLignes.id));
      return rows.map((l) => ({
        ordre: l.ordre ?? 0,
        reference: l.reference ?? null,
        designation: l.designation,
        description: l.description ?? null,
        quantite: l.quantite ?? "0.00",
        unite: l.unite ?? "unité",
        prixUnitaireHT: l.prixUnitaireHT,
        tauxTVA: l.tauxTVA ?? "20.00",
        tvaCategorieId: l.tvaCategorieId ?? null,
        montantHT: l.montantHT ?? "0.00",
        montantTVA: l.montantTVA ?? "0.00",
        montantTTC: l.montantTTC ?? "0.00",
        type: l.type ?? "produit",
      }));
    });
  }
}
