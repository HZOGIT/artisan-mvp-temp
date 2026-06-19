/*
 * Types de domaine du module ecritures (comptabilité — FEC légal) — découplés du schéma Drizzle.
 * ⚠️ Domaine financier CRITIQUE. Invariant fondamental (porté par les use-cases) : pour chaque
 * **pièce** comptable, **Σ débit = Σ crédit** ; aucun montant débit/crédit négatif (valeur
 * absolue ; un avoir inverse le SENS, pas le signe). TVA collectée ventilée par taux. Génération
 * **idempotente** par `factureId` (delete-then-insert).
 * 
 * NB : `ecritures_comptables` est en camelCase (artisanId, numeroCompte…) et porte une RLS sur
 * `artisanId`.
 */

export type JournalComptable = "VE" | "AC" | "BQ" | "OD"; // Ventes / Achats / Banque / Opérations diverses

export interface EcritureComptable {
  readonly id: number;
  readonly artisanId: number;
  readonly dateEcriture: Date;
  readonly journal: JournalComptable;
  readonly numeroCompte: string;
  readonly libelleCompte: string | null;
  readonly libelle: string;
  readonly pieceRef: string | null;
  readonly debit: string; // numeric PG en string (≥ 0)
  readonly credit: string; // numeric PG en string (≥ 0)
  readonly factureId: number | null;
  readonly lettrage: string | null;
  readonly pointage: boolean;
  readonly createdAt: Date;
}

/*
 * Entrée de création d'une LIGNE d'écriture (une pièce = plusieurs lignes équilibrées).
 * `artisanId` est forcé par le repo (TenantContext). `debit`/`credit` ≥ 0 (l'un des deux à 0).
 */
export interface CreateEcritureInput {
  readonly dateEcriture: Date;
  readonly journal: JournalComptable;
  readonly numeroCompte: string;
  readonly libelle: string;
  readonly libelleCompte?: string | null;
  readonly pieceRef?: string | null;
  readonly debit?: string;
  readonly credit?: string;
  readonly factureId?: number | null;
  readonly lettrage?: string | null;
  readonly pointage?: boolean;
}
