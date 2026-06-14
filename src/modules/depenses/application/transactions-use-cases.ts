import type { TenantContext } from "../../../shared/tenant";
import type { ITransactionBancaireRepository } from "./transaction-bancaire-repository";
import type { TransactionBancaire } from "../domain/transaction-bancaire";

// Use-cases « transactions bancaires » (lecture + ignorer). Le scoping tenant est porté par le repo.
// Parité legacy `getTransactionsBancaires` / `ignorerTransaction`.

export function getTransactionsBancaires(repo: ITransactionBancaireRepository, ctx: TenantContext, releveId?: number): Promise<TransactionBancaire[]> {
  return repo.list(ctx, releveId);
}

export async function ignorerTransaction(repo: ITransactionBancaireRepository, ctx: TenantContext, id: number): Promise<{ success: true }> {
  await repo.ignorer(ctx, id);
  return { success: true };
}
