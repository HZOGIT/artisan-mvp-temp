// Transaction bancaire importée d'un relevé (table `transactions_bancaires`, RLS sur artisan_id).
// `montant` numeric PG en string ; `type_transaction` = debit|credit. Une transaction peut être
// liée à une dépense (`depenseId`) après conversion, ou marquée `ignoree`.
export type TransactionType = "debit" | "credit";

export interface TransactionBancaire {
  readonly id: number;
  readonly artisanId: number;
  readonly releveId: number | null;
  readonly dateTransaction: string; // YYYY-MM-DD
  readonly libelle: string;
  readonly montant: string;
  readonly typeTransaction: TransactionType;
  readonly categorieSuggeree: string | null;
  readonly depenseId: number | null;
  readonly ignoree: boolean;
  readonly createdAt: Date;
}
