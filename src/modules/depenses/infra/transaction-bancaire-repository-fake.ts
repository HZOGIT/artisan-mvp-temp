import type { TenantContext } from "../../../shared/tenant";
import type { ITransactionBancaireRepository } from "../application/transaction-bancaire-repository";
import type { TransactionBancaire } from "../domain/transaction-bancaire";

// Double in-memory du repository des transactions bancaires (tests sans DB). Reproduit le scoping
// tenant + filtre `ignoree=false` + tri récent d'abord.
export class FakeTransactionBancaireRepository implements ITransactionBancaireRepository {
  private store: TransactionBancaire[] = [];
  private seq = 0;

  // Aide de test : insère une transaction (artisanId forcé via l'appelant).
  seed(t: Omit<TransactionBancaire, "id" | "createdAt"> & { id?: number; createdAt?: Date }): TransactionBancaire {
    const created: TransactionBancaire = { ...t, id: t.id ?? ++this.seq, createdAt: t.createdAt ?? new Date() };
    this.store.push(created);
    return created;
  }

  async list(ctx: TenantContext, releveId?: number): Promise<TransactionBancaire[]> {
    return this.store
      .filter((t) => t.artisanId === ctx.artisanId && !t.ignoree && (releveId ? t.releveId === releveId : true))
      .sort((a, b) => (a.dateTransaction < b.dateTransaction ? 1 : a.dateTransaction > b.dateTransaction ? -1 : b.id - a.id))
      .slice(0, 500);
  }

  async ignorer(ctx: TenantContext, id: number): Promise<void> {
    this.store = this.store.map((t) => (t.id === id && t.artisanId === ctx.artisanId ? { ...t, ignoree: true } : t));
  }
}
