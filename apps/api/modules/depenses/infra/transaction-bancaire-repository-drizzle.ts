import { and, desc, eq } from "drizzle-orm";
import { transactionsBancaires, relevesBancaires } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ITransactionBancaireRepository } from "../application/transaction-bancaire-repository";
import type { TransactionBancaire, TransactionType, ReleveItem, ImportReleveResult } from "../domain/transaction-bancaire";

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

/** Double cloisonnement RLS + filtre `artisan_id`. Lecture des transactions non ignorées (≤500). */
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

  getById(ctx: TenantContext, id: number): Promise<TransactionBancaire | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(transactionsBancaires)
        .where(and(eq(transactionsBancaires.id, id), eq(transactionsBancaires.artisan_id, ctx.artisanId)))
        .limit(1);
      return row ? toTransaction(row) : null;
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

  createReleve(ctx: TenantContext, nomFichier: string, items: ReleveItem[]): Promise<ImportReleveResult> {
    return withTenant(this.db, ctx, async (tx) => {
      const [releve] = await tx
        .insert(relevesBancaires)
        .values({ artisan_id: ctx.artisanId, nom_fichier: nomFichier, nb_transactions: items.length, statut: "en_cours" })
        .returning({ id: relevesBancaires.id });
      const releveId = releve?.id;
      if (!releveId) return { releveId: 0, nbImportees: 0 };
      let nbImportees = 0;
      for (const t of items) {
        try {
          await tx.insert(transactionsBancaires).values({
            artisan_id: ctx.artisanId,
            releve_id: releveId,
            date_transaction: t.dateTransaction,
            libelle: t.libelle,
            /** stocké en valeur absolue (parité legacy) */
            montant: String(Math.abs(t.montant)),
            type_transaction: t.typeTransaction,
            categorie_suggeree: t.categorieSuggeree,
          });
          nbImportees++;
        } catch {
          /* ligne en erreur ignorée (parité) */
        }
      }
      await tx.update(relevesBancaires).set({ nb_importees: nbImportees, statut: "termine" }).where(eq(relevesBancaires.id, releveId));
      return { releveId, nbImportees };
    });
  }

  lierDepense(ctx: TenantContext, transactionId: number, depenseId: number): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(transactionsBancaires)
        .set({ depense_id: depenseId })
        .where(and(eq(transactionsBancaires.id, transactionId), eq(transactionsBancaires.artisan_id, ctx.artisanId)));
    });
  }
}
