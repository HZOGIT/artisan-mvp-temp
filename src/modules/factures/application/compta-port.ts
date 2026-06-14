import type { TenantContext } from "../../../shared/tenant";

// Port d'effet de bord vers la **comptabilité** (génération des écritures FEC). Le domaine
// compta (écritures, journaux VE/BQ, balance, grand livre, export FEC, invariant Σdébit=Σcrédit)
// est un **domaine à part entière** non encore migré → factures dépend d'une **abstraction** :
//  - `genererEcrituresVente` : écritures de vente (411 Client / 706 Ventes / 445 TVA) à l'émission ;
//  - `genererEcrituresEncaissement` : écritures de règlement (512 Banque / 411 lettré) au paiement.
// Impl par défaut = no-op (la vraie génération sera fournie par le module compta porté plus tard).
export interface ComptaPort {
  genererEcrituresVente(ctx: TenantContext, factureId: number): Promise<void>;
  genererEcrituresEncaissement(ctx: TenantContext, factureId: number): Promise<void>;
}

// Implémentation neutre par défaut : ne génère aucune écriture (le domaine compta n'est pas
// encore porté). Permet de câbler le seam sans coupler factures à la compta legacy.
export class NoopComptaPort implements ComptaPort {
  async genererEcrituresVente(): Promise<void> {}
  async genererEcrituresEncaissement(): Promise<void> {}
}

// Singleton réutilisable (la valeur par défaut des use-cases).
export const NOOP_COMPTA: ComptaPort = new NoopComptaPort();
