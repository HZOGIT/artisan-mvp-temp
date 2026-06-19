import type { TenantContext } from "../../../shared/tenant";
import type { IFactureRepository } from "../../factures/application/facture-repository";
import type { IDevisReader } from "../../factures/application/devis-reader";
import { convertirDevisEnFacture } from "../../factures/application/write-use-cases";
import type { DevisToFactureConverter, FactureCreeeRef } from "../application/devis-to-facture-converter";

/*
 * Adapter du port `DevisToFactureConverter` branché sur le **domaine factures** : délègue à
 * `convertirDevisEnFacture` (devis accepté → facture brouillon, lignes copiées, numéro serveur,
 * anti-doublon). Réutilise `IFactureRepository` + le `IDevisReader` (lecture devis vue factures).
 */
export class FacturesDevisToFactureConverter implements DevisToFactureConverter {
  constructor(
    private readonly factureRepo: IFactureRepository,
    private readonly devisReader: IDevisReader,
  ) {}

  async convertir(ctx: TenantContext, devisId: number): Promise<FactureCreeeRef> {
    const facture = await convertirDevisEnFacture(this.factureRepo, this.devisReader, ctx, devisId);
    return { id: facture.id, numero: facture.numero };
  }
}
