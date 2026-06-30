import type { TenantContext } from "../../../shared/tenant";
import { round2 } from "../../../shared/money";
import type { IStockRepository, AdjustStockResult } from "../application/stock-repository";
import type {
  Stock,
  CreateStockInput,
  UpdateStockInput,
  AdjustStockInput,
  MouvementStock,
  StockEntrant,
  Inventaire,
  InventaireLigne,
  InventaireAvecLignes,
  DemarrerInventaireInput,
} from "../domain/stock";

/*
 * Double in-memory du repository pour les tests de use-cases (sans DB). Reproduit le
 * scoping tenant. ⚠️ `update` ne touche pas `quantiteEnStock` (invariant d'audit) ;
 * seul `adjustQuantity` change la quantité (via un mouvement tracé).
 */
export class FakeStockRepository implements IStockRepository {
  private store: Stock[] = [];
  private mouvements: MouvementStock[] = [];
  /*
   * Entrant simulé par tenant (les commandes fournisseurs ne sont pas modélisées dans ce fake) :
   * clé `${artisanId}` → liste {stockId, entrant}. Alimenté par seedEntrant (aide de test).
   */
  private entrants = new Map<number, StockEntrant[]>();
  private seq = 0;
  private mvSeq = 0;

  /** Aide de test (hors port) : déclare l'entrant (commandes non reçues) d'un tenant. */
  seedEntrant(artisanId: number, entrant: StockEntrant[]): void {
    this.entrants.set(artisanId, entrant);
  }

  async list(ctx: TenantContext): Promise<Stock[]> {
    return this.store.filter((s) => s.artisanId === ctx.artisanId);
  }

  async getById(ctx: TenantContext, id: number): Promise<Stock | null> {
    return this.store.find((s) => s.id === id && s.artisanId === ctx.artisanId) ?? null;
  }

  async findByArticleId(ctx: TenantContext, articleId: number): Promise<Stock | null> {
    return this.store.find((s) => s.artisanId === ctx.artisanId && s.articleId === articleId) ?? null;
  }

  async create(ctx: TenantContext, input: CreateStockInput): Promise<Stock> {
    const now = new Date();
    /** Mirroir du formatage PG numeric(_,2) (ex. "3" stocké → "3.00") pour fidélité au repo réel. */
    const num = (v: string | undefined, fallback: string) => (v != null ? Number(v).toFixed(2) : fallback);
    const s: Stock = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      articleId: input.articleId ?? null,
      articleType: input.articleType ?? "bibliotheque",
      reference: input.reference,
      designation: input.designation,
      quantiteEnStock: num(input.quantiteEnStock, "0.00"),
      seuilAlerte: num(input.seuilAlerte, "5.00"),
      unite: input.unite ?? "unité",
      prixAchat: input.prixAchat ?? null,
      emplacement: input.emplacement ?? null,
      fournisseur: input.fournisseur ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.push(s);
    const qty = Number(s.quantiteEnStock);
    if (qty > 0) {
      this.mouvements.push({
        id: ++this.mvSeq,
        stockId: s.id,
        type: "entree",
        quantite: qty.toFixed(2),
        quantiteAvant: "0.00",
        quantiteApres: qty.toFixed(2),
        motif: "Stock initial",
        reference: null,
        createdAt: now,
      });
    }
    return s;
  }

  async update(ctx: TenantContext, id: number, input: UpdateStockInput): Promise<Stock | null> {
    const s = await this.getById(ctx, id);
    if (!s) return null;
    /** `input` n'a pas `quantiteEnStock` → la quantité reste intacte. */
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
    const apres = round2(apresNum).toFixed(2);
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

  async listEntrant(ctx: TenantContext): Promise<StockEntrant[]> {
    return (this.entrants.get(ctx.artisanId) ?? []).filter((e) => e.entrant > 0);
  }

  withDb(_db: unknown): this {
    return this;
  }

  /* ─── Inventaire physique (fake in-memory) ─── */

  private invStore: Inventaire[] = [];
  private lignesStore: (InventaireLigne & { _mvs: MouvementStock[] })[] = [];
  private invSeq = 0;
  private invLigneSeq = 0;

  async demarrerInventaire(ctx: TenantContext, input: DemarrerInventaireInput): Promise<InventaireAvecLignes> {
    const stockRows = await this.list(ctx);
    const now = new Date();
    const inv: Inventaire = {
      id: ++this.invSeq,
      artisanId: ctx.artisanId,
      date: input.date ?? now.toISOString().slice(0, 10),
      statut: "brouillon",
      note: input.note ?? null,
      valeurEcart: null,
      createdAt: now,
      updatedAt: now,
    };
    this.invStore.push(inv);
    const lignes: InventaireLigne[] = stockRows.map((s) => {
      const l: InventaireLigne = {
        id: ++this.invLigneSeq,
        inventaireId: inv.id,
        stockId: s.id,
        reference: s.reference,
        designation: s.designation,
        unite: s.unite,
        quantiteTheorique: s.quantiteEnStock,
        quantiteReelle: null,
        ecart: null,
      };
      this.lignesStore.push({ ...l, _mvs: [] as MouvementStock[] });
      return l;
    });
    return { inventaire: inv, lignes };
  }

  async getInventaire(ctx: TenantContext, id: number): Promise<InventaireAvecLignes | null> {
    const inv = this.invStore.find((i) => i.id === id && i.artisanId === ctx.artisanId);
    if (!inv) return null;
    const lignes: InventaireLigne[] = this.lignesStore
      .filter((l) => l.inventaireId === id)
      .map(({ _mvs: _m, ...l }) => l);
    return { inventaire: inv, lignes };
  }

  async listInventaires(ctx: TenantContext): Promise<Inventaire[]> {
    return [...this.invStore].filter((i) => i.artisanId === ctx.artisanId).reverse();
  }

  async saisirComptage(ctx: TenantContext, ligneId: number, quantiteReelle: string): Promise<InventaireAvecLignes | null> {
    const idx = this.lignesStore.findIndex((x) => x.id === ligneId);
    if (idx === -1) return null;
    const l = this.lignesStore[idx];
    const inv = this.invStore.find((i) => i.id === l.inventaireId && i.artisanId === ctx.artisanId);
    if (!inv || inv.statut === "valide") return null;
    this.lignesStore[idx] = {
      ...l,
      quantiteReelle,
      ecart: (Number(quantiteReelle) - Number(l.quantiteTheorique)).toFixed(2),
    };
    return this.getInventaire(ctx, inv.id);
  }

  async validerInventaire(ctx: TenantContext, id: number): Promise<InventaireAvecLignes | null> {
    const inv = this.invStore.find((i) => i.id === id && i.artisanId === ctx.artisanId);
    if (!inv) return null;
    const lignes = this.lignesStore.filter((l) => l.inventaireId === id);
    let valeurEcartTotal = 0;
    for (const l of lignes) {
      const ecartNum = Number(l.ecart ?? "0");
      if (ecartNum === 0) continue;
      const s = this.store.find((x) => x.id === l.stockId);
      if (!s) continue;
      const avant = Number(s.quantiteEnStock);
      const apres = round2(avant + ecartNum).toFixed(2);
      const updated: Stock = { ...s, quantiteEnStock: apres, updatedAt: new Date() };
      this.store = this.store.map((x) => (x.id === s.id ? updated : x));
      this.mouvements.push({
        id: ++this.mvSeq,
        stockId: s.id,
        type: "ajustement",
        quantite: Math.abs(ecartNum).toFixed(2),
        quantiteAvant: avant.toFixed(2),
        quantiteApres: apres,
        motif: `Régularisation inventaire #${id}`,
        reference: `INV-${id}`,
        createdAt: new Date(),
      });
      valeurEcartTotal += Math.abs(ecartNum) * Number(s.prixAchat ?? "0");
    }
    const idx = this.invStore.findIndex((i) => i.id === id);
    this.invStore[idx] = { ...inv, statut: "valide", valeurEcart: round2(valeurEcartTotal).toFixed(2), updatedAt: new Date() };
    return this.getInventaire(ctx, id);
  }
}
