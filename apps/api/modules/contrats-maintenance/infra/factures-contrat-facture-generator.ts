import type { TenantContext } from "../../../shared/tenant";
import type { IFactureRepository } from "../../factures/application/facture-repository";
import { creerFacture, ajouterLigneFacture } from "../../factures/application/write-use-cases";
import type {
  ContratFactureGenerator,
  GenererFactureContratInput,
  FactureGenereeRef,
} from "../application/contrat-facture-generator";

/*
 * Adapter du port `ContratFactureGenerator` branché sur le **domaine factures** : réutilise les
 * use-cases factures (`creerFacture` → numéro serveur + anti-IDOR client ; `ajouterLigneFacture` →
 * totaux dérivés) puis passe la facture en `envoyee` via `setStatut` **sans** déclencher le
 * ComptaPort (≠ `changerStatutFacture`) → aucune écriture FEC générée (parité legacy).
 */
export class FacturesContratFactureGenerator implements ContratFactureGenerator {
  constructor(private readonly factureRepo: IFactureRepository) {}

  async genererFactureEmise(ctx: TenantContext, input: GenererFactureContratInput): Promise<FactureGenereeRef> {
    const facture = await creerFacture(this.factureRepo, ctx, { clientId: input.clientId, objet: input.objet });
    await ajouterLigneFacture(this.factureRepo, ctx, facture.id, {
      designation: input.designation,
      description: input.description,
      quantite: "1",
      prixUnitaireHT: input.montantHT,
      tauxTVA: input.tauxTVA,
      tvaCategorieId: input.tvaCategorieId,
    });
    /** Émission directe (pas d'écritures FEC ici — parité legacy `updateFacture(statut:"envoyee")`). */
    await this.factureRepo.setStatut(ctx, facture.id, "envoyee");
    return { id: facture.id, numero: facture.numero };
  }
}
