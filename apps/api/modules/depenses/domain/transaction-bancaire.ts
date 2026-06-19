/*
 * Transaction bancaire importée d'un relevé (table `transactions_bancaires`, RLS sur artisan_id).
 * `montant` numeric PG en string ; `type_transaction` = debit|credit. Une transaction peut être
 * liée à une dépense (`depenseId`) après conversion, ou marquée `ignoree`.
 */
export type TransactionType = "debit" | "credit";

export interface TransactionBancaire {
  readonly id: number;
  readonly artisanId: number;
  readonly releveId: number | null;
  /** YYYY-MM-DD */
  readonly dateTransaction: string;
  readonly libelle: string;
  readonly montant: string;
  readonly typeTransaction: TransactionType;
  readonly categorieSuggeree: string | null;
  readonly depenseId: number | null;
  readonly ignoree: boolean;
  readonly createdAt: Date;
}

/** Transaction parsée d'un relevé CSV (avant insertion). `montant` signé (debit < 0, credit > 0). */
export interface ImportTransaction {
  readonly dateTransaction: string;
  readonly libelle: string;
  readonly montant: number;
  readonly typeTransaction: TransactionType;
}

/** Item enrichi (catégorie suggérée par les règles) prêt à insérer. */
export interface ReleveItem extends ImportTransaction {
  readonly categorieSuggeree: string | null;
}

export interface ImportReleveResult {
  readonly releveId: number;
  readonly nbImportees: number;
  readonly message?: string;
}
