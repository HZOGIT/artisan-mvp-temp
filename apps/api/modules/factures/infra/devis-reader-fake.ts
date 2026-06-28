import type { DbClient } from "../../../shared/db/client";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisReader, DevisReadModel, DevisLigneReadModel } from "../application/devis-reader";
import { ValidationError } from "../../../shared/errors";
import { round2 } from "../../../shared/money";

/*
 * Double in-memory du lecteur de devis (pour tester la conversion devis→facture sans DB).
 * Scopé tenant : un devis/des lignes d'un autre tenant → null/[].
 */
export class FakeDevisReader implements IDevisReader {
  private store = new Map<number, DevisReadModel>();
  private lignes = new Map<number, DevisLigneReadModel[]>();

  /** Aide de test : enregistre un devis (et éventuellement ses lignes) du tenant. */
  register(devis: DevisReadModel, lignes: DevisLigneReadModel[] = []): void {
    this.store.set(devis.id, devis);
    this.lignes.set(devis.id, lignes);
  }

  async getDevis(ctx: TenantContext, devisId: number): Promise<DevisReadModel | null> {
    const d = this.store.get(devisId);
    return d && d.artisanId === ctx.artisanId ? d : null;
  }

  async getLignes(ctx: TenantContext, devisId: number): Promise<DevisLigneReadModel[]> {
    const d = this.store.get(devisId);
    if (!d || d.artisanId !== ctx.artisanId) return [];
    return this.lignes.get(devisId) ?? [];
  }

  async updateMontantDejaFacture(ctx: TenantContext, devisId: number, montant: string): Promise<void> {
    const d = this.store.get(devisId);
    if (d && d.artisanId === ctx.artisanId) {
      this.store.set(devisId, { ...d, montantDejaFacture: montant });
    }
  }

  /** delta = montant TTC à ajouter. Simule la sérialisation SELECT FOR UPDATE. */
  async updateMontantDejaFactureTx(_tx: DbClient, ctx: TenantContext, devisId: number, delta: string): Promise<void> {
    const d = this.store.get(devisId);
    if (!d || d.artisanId !== ctx.artisanId) return;
    const EPS = 0.005;
    const newCumul = round2(Number(d.montantDejaFacture) + Number(delta));
    if (newCumul > Number(d.totalTTC) + EPS) {
      throw new ValidationError("Le cumul des situations dépasse le total TTC du devis");
    }
    this.store.set(devisId, { ...d, montantDejaFacture: newCumul.toFixed(2) });
  }
}
