import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository, AdjustStockResult } from "../application/stock-repository";
import type {
  Stock,
  CreateStockInput,
  UpdateStockInput,
  AdjustStockInput,
  MouvementStock,
} from "../domain/stock";

// Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
// scoping tenant. ⚠️ `update` ne touche pas `quantiteEnStock` (invariant d'audit) ;
// seul `adjustQuantity` change la quantité (via un mouvement tracé).
export class FakeStockRepository implements IStockRepository {
  private store: Stock[] = [];
  private mouvements: MouvementStock[] = [];
  private seq = 0;
  private mvSeq = 0;

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
    this.mouvements = this.mouvements.filter((m) => m.stockId !== id);
    return true;
  }

  async adjustQuantity(ctx: TenantContext, stockId: number, input: AdjustStockInput): Promise<AdjustStockResult> {
    const s = await this.getById(ctx, stockId);
    if (!s) return { status: "not_found" };
    const avant = Number(s.quantiteEnStock);
    const delta = Number(input.quantite);
    const apresNum = input.type === "sortie" ? avant - delta : avant + delta;
    if (apresNum < 0) return { status: "insufficient_stock", disponible: avant.toFixed(2) };
    const apres = apresNum.toFixed(2);
    const updated: Stock = { ...s, quantiteEnStock: apres, updatedAt: new Date() };
    this.store = this.store.map((x) => (x.id === stockId ? updated : x));
    this.mouvements.push({
      id: ++this.mvSeq,
      stockId,
      type: input.type,
      quantite: delta.toFixed(2),
      quantiteAvant: avant.toFixed(2),
      quantiteApres: apres,
      motif: input.motif ?? null,
      reference: input.reference ?? null,
      createdAt: new Date(),
    });
    return { status: "ok", stock: updated };
  }

  async listMouvements(ctx: TenantContext, stockId: number): Promise<MouvementStock[] | null> {
    const s = await this.getById(ctx, stockId);
    if (!s) return null;
    return this.mouvements
      .filter((m) => m.stockId === stockId)
      .sort((a, b) => b.id - a.id);
  }

  async listLowStock(ctx: TenantContext): Promise<Stock[]> {
    return this.store.filter(
      (s) => s.artisanId === ctx.artisanId && Number(s.quantiteEnStock) <= Number(s.seuilAlerte),
    );
  }

  async listEnRupture(ctx: TenantContext): Promise<Stock[]> {
    return this.store.filter((s) => s.artisanId === ctx.artisanId && Number(s.quantiteEnStock) <= 0);
  }
}
