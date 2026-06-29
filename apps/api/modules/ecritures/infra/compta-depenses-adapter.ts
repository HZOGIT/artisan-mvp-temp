import type { TenantContext } from "../../../shared/tenant";
import type { IDepenseComptaPort } from "../../depenses/application/depense-compta-port";
import type { IEcritureRepository } from "../application/ecriture-repository";
import type { DepenseAchatInput } from "../application/generation-use-cases";
import { genererEcrituresAchat } from "../application/generation-use-cases";

/**
 * Adapter branchant le seam `IDepenseComptaPort` des dépenses sur le domaine ecritures (génération
 * réelle des écritures AC dans ecritures_comptables). Symétrique à ComptaEcrituresAdapter pour les
 * factures.
 */
export class ComptaDepensesAdapter implements IDepenseComptaPort {
  constructor(private readonly ecritureRepo: IEcritureRepository) {}

  async genererEcrituresAchat(ctx: TenantContext, depense: DepenseAchatInput): Promise<void> {
    await genererEcrituresAchat(this.ecritureRepo, ctx, depense);
  }

  async supprimerEcrituresAchat(ctx: TenantContext, depenseNumero: string): Promise<void> {
    await this.ecritureRepo.deleteByJournalPieceRef(ctx, "AC", depenseNumero);
  }
}
