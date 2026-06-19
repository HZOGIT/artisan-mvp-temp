import type { TenantContext } from "../../../shared/tenant";
import type { EcritureComptable, CreateEcritureInput, JournalComptable } from "../domain/ecriture";

/*
 * Port du repository ecritures comptables. Chaque méthode exige le TenantContext (scope tenant +
 * RLS sur `artisanId`). ⚠️ Domaine financier CRITIQUE : l'**équilibre Σdébit=Σcrédit** d'une
 * pièce et la ventilation TVA sont portés par les use-cases (étapes ultérieures), pas par le
 * CRUD ; le repo écrit des lignes déjà calculées et équilibrées.
 */
export interface IEcritureRepository {
  // Toutes les écritures du tenant (tri date desc).
  list(ctx: TenantContext): Promise<EcritureComptable[]>;
  // Écritures liées à une facture (pièce de vente + encaissement), scopées tenant.
  listByFacture(ctx: TenantContext, factureId: number): Promise<EcritureComptable[]>;
  /*
   * Insère une pièce (lot de lignes) en une transaction — artisanId forcé. Renvoie les lignes
   * créées. (L'équilibre est garanti en amont par le use-case.)
   */
  createMany(ctx: TenantContext, lignes: readonly CreateEcritureInput[]): Promise<EcritureComptable[]>;
  // Supprime les écritures d'une facture (idempotence delete-then-insert) — nb de lignes supprimées.
  deleteByFacture(ctx: TenantContext, factureId: number): Promise<number>;
  /*
   * Supprime les écritures d'une facture pour UN journal donné (idempotence sélective : purger
   * l'encaissement [BQ] sans toucher la vente [VE]) — nb de lignes supprimées.
   */
  deleteByFactureJournal(ctx: TenantContext, factureId: number, journal: JournalComptable): Promise<number>;
}
