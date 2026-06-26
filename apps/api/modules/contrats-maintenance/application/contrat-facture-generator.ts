import type { TenantContext } from "../../../shared/tenant";

/** Entrée de génération d'une facture pour un contrat (données dérivées du contrat par le use-case). */
export interface GenererFactureContratInput {
  readonly clientId: number;
  readonly objet: string;
  readonly designation: string;
  readonly description: string | null;
  readonly montantHT: string;
  readonly tauxTVA: string;
  readonly tvaCategorieId?: string;
}

/** Référence de la facture créée (le client n'exploite pas le détail — toast + refetch). */
export interface FactureGenereeRef {
  readonly id: number;
  readonly numero: string | null;
}

/** Port cross-domaine : génère une facture **émise** (`envoyee`) pour un contrat — 1 ligne (designation */
/** / PU = montant HT / taux TVA), totaux dérivés, **numéro généré serveur**. ⚠️ **PAS d'écritures FEC */
/** ici** : parité legacy `contrats.generateFacture` (la facture récurrente n'est pas comptabilisée à la */
/** génération — le booking est un acte séparé). L'adapter (infra) compose le repository factures. */
export interface ContratFactureGenerator {
  genererFactureEmise(ctx: TenantContext, input: GenererFactureContratInput): Promise<FactureGenereeRef>;
}
