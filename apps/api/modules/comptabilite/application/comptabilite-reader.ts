import type { TenantContext } from "../../../shared/tenant";
import type { Ecriture } from "../domain/comptabilite";
import type { FecConfig, FecInput } from "../domain/fec";

/** Bornes de période (résolues : par défaut le mois courant, parité legacy). */
export interface Periode {
  readonly dateDebut: Date;
  readonly dateFin: Date;
}

/** Détail TVA brut renvoyé par le reader (avant arrondi/assemblage par le domaine). */
export interface DeclarationTVABrut {
  readonly parTaux: { taux: number; baseHT: number; tvaCollectee: number }[];
  readonly tvaDeductible: number;
}

/*
 * Port de lecture comptable : écritures scopées tenant (RLS) + agrégat TVA détaillé (SQL group-by).
 * Lecture seule — aucune écriture comptable (la génération d'écritures reste hors de ce reader).
 */
export interface IComptabiliteReader {
  /** Toutes les écritures de la période, triées (numeroCompte, dateEcriture) — grand livre/balance/TVA. */
  listEcritures(ctx: TenantContext, p: Periode): Promise<Ecriture[]>;
  /** Écritures du journal des ventes (`VE`) de la période, triées par date. */
  listJournalVentes(ctx: TenantContext, p: Periode): Promise<Ecriture[]>;
  /** Base HT + TVA collectée par taux (factures émises) + TVA déductible (dépenses déductibles). */
  declarationTVADetail(ctx: TenantContext, p: Periode): Promise<DeclarationTVABrut>;
  /** Données brutes du FEC (factures+lignes TVA, dépenses, encaissements) scopées tenant pour la période. */
  fecInput(ctx: TenantContext, p: Periode): Promise<FecInput>;
  /** Configuration comptable du tenant (comptes/journaux) ; valeurs par défaut PCG si absente. */
  fecConfig(ctx: TenantContext): Promise<FecConfig>;
  /** SIRET du tenant (entête de l'aperçu FEC). */
  siret(ctx: TenantContext): Promise<string | null>;
}
