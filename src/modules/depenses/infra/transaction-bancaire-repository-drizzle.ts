import { and, desc, eq } from "drizzle-orm";
import { transactionsBancaires } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ITransactionBancaireRepository } from "../application/transaction-bancaire-repository";
import type { TransactionBancaire, TransactionType } from "../domain/transaction-bancaire";

type Row = typeof transactionsBancaires.$inferSelect;

function toTransaction(r: Row): TransactionBancaire {
  return {
    id: r.id,
    artisanId: r.artisan_id,
    releveId: r.releve_id ?? null,
    dateTransaction: r.date_transaction,
    libelle: r.libelle,
    montant: r.montant,
    typeTransaction: r.type_transaction as TransactionType,
    categorieSuggeree: r.categorie_suggeree ?? null,
    depenseId: r.depense_id ?? null,
    ignoree: r.ignoree ?? false,
    createdAt: r.created_at ?? new Date(),
  };
}

// Double cloisonnement RLS + filtre `artisan_id`. Lecture des transactions non ignorées (≤500).
export class TransactionBancaireRepositoryDrizzle implements ITransactionBancaireRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext, releveId?: number): Promise<TransactionBancaire[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const conds = [eq(transactionsBancaires.artisan_id, ctx.artisanId), eq(transactionsBancaires.ignoree, false)];
      if (releveId) conds.push(eq(transactionsBancaires.releve_id, releveId));
      const rows = await tx
        .select()
        .from(transactionsBancaires)
        .where(and(...conds))
        .orderBy(desc(transactionsBancaires.date_transaction), desc(transactionsBancaires.id))
        .limit(500);
      return rows.map(toTransaction);
    });
  }

  ignorer(ctx: TenantContext, id: number): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(transactionsBancaires)
        .set({ ignoree: true })
        .where(and(eq(transactionsBancaires.id, id), eq(transactionsBancaires.artisan_id, ctx.artisanId)));
    });
  }
}
