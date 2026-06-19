import type { TenantContext } from "../../../shared/tenant";
import type { ComptaPort } from "../../factures/application/compta-port";
import type { IEcritureRepository } from "../application/ecriture-repository";
import type { IFactureReader } from "../application/facture-reader";
import { genererEcrituresVente, genererEcrituresEncaissement } from "../application/generation-use-cases";

/*
 * Adapter branchant le seam `ComptaPort` des factures sur le domaine ecritures (vraie génération
 * FEC, en remplacement du `NoopComptaPort`). Sens des dépendances respecté : factures expose le
 * **port** ; cet adapter (côté ecritures) l'**implémente** en déléguant aux use-cases de
 * génération. Effet de bord pur (renvoie void) ; l'équilibre Σdébit=Σcrédit est garanti par les
 * use-cases.
 */
export class ComptaEcrituresAdapter implements ComptaPort {
  constructor(
    private readonly ecritureRepo: IEcritureRepository,
    private readonly factureReader: IFactureReader,
  ) {}

  async genererEcrituresVente(ctx: TenantContext, factureId: number): Promise<void> {
    await genererEcrituresVente(this.ecritureRepo, this.factureReader, ctx, factureId);
  }

  async genererEcrituresEncaissement(ctx: TenantContext, factureId: number): Promise<void> {
    await genererEcrituresEncaissement(this.ecritureRepo, this.factureReader, ctx, factureId);
  }
}
