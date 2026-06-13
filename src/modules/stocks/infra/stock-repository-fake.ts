import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository } from "../application/stock-repository";
import type { Stock, CreateStockInput, UpdateStockInput } from "../domain/stock";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
// scoping tenant. ⚠️ `update` ne touche pas `quantiteEnStock` (invariant d'audit).
export class FakeStockRepository implements IStockRepository {
  private store: Stock[] = [];
  private seq = 0;

  async list(ctx: TenantContext): Promise<Stock[]> {
    return this.store.filter((s) => s.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Stock | null> {
    return this.store.find((s) => s.id === id && s.artisanId === ctx.artisanId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateStockInput): Promise<Stock> {
    const now = new Date();
    const s: Stock = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      articleId: input.articleId ?? null,
      articleType: input.articleType ?? "bibliotheque",
      reference: input.reference,
      designation: input.designation,
      quantiteEnStock: input.quantiteEnStock ?? "0.00",
      seuilAlerte: input.seuilAlerte ?? "5.00",
      unite: input.unite ?? "unité",
      prixAchat: input.prixAchat ?? null,
      emplacement: input.emplacement ?? null,
      fournisseur: input.fournisseur ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(s);
    return s;
  }

  async update(ctx: TenantContext, id: number, input: UpdateStockInput): Promise<Stock | null> {
    const s = await this.getById(ctx, id);
    if (!s) return null;
    // `input` n'a pas `quantiteEnStock` → la quantité reste intacte.
    const updated: Stock = { ...s, ...input, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === id ? updated : x));
    return updated;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const s = await this.getById(ctx, id);
    if (!s) return false;
    this.store = this.store.filter((x) => x.id !== id);
    return true;
  }
}
