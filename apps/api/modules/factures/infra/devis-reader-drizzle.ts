import { and, asc, eq } from "drizzle-orm";
import { devis, devisLignes } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisReader, DevisReadModel, DevisLigneReadModel } from "../application/devis-reader";
import { ValidationError } from "../../../shared/errors";

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

  updateMontantDejaFactureTx(tx: DbClient, ctx: TenantContext, devisId: number, montant: string): Promise<void> {
    if (!Number.isFinite(Number(montant)) || Number(montant) < 0) {
      return Promise.reject(new ValidationError("Montant invalide"));
    }
    return tx
      .update(devis)
      .set({ montantDejaFacture: montant })
      .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)))
      .then(() => undefined);
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
