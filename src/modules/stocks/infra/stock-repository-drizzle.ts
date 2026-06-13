import { and, asc, eq } from "drizzle-orm";
import { stocks, mouvementsStock } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository } from "../application/stock-repository";
import type { Stock, CreateStockInput, UpdateStockInput } from "../domain/stock";

type StockRow = typeof stocks.$inferSelect;

function toStock(r: StockRow): Stock {
  return {
    id: r.id,
    artisanId: r.artisanId,
    articleId: r.articleId ?? null,
    articleType: (r.articleType ?? "bibliotheque") as Stock["articleType"],
    reference: r.reference,
    designation: r.designation,
    quantiteEnStock: r.quantiteEnStock ?? "0.00",
    seuilAlerte: r.seuilAlerte ?? "5.00",
    unite: r.unite ?? "unité",
    prixAchat: r.prixAchat ?? null,
    emplacement: r.emplacement ?? null,
    fournisseur: r.fournisseur ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle du repository stocks. Double cloisonnement RLS + filtre artisanId
// sur `stocks`. ⚠️ `update` ne touche que les métadonnées (jamais `quantiteEnStock` :
// la quantité ne change que via un mouvement tracé). delete = cascade `mouvements_stock`
// (table SANS artisanId, scopée via le stock) après vérification d'ownership.
export class StockRepositoryDrizzle implements IStockRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Stock[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(stocks)
        .where(eq(stocks.artisanId, ctx.artisanId))
        .orderBy(asc(stocks.designation), asc(stocks.id));
      return rows.map(toStock);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Stock | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(stocks)
        .where(and(eq(stocks.id, id), eq(stocks.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toStock(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateStockInput): Promise<Stock> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(stocks)
        .values({ ...input, artisanId: ctx.artisanId } as typeof stocks.$inferInsert)
        .returning();
      return toStock(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateStockInput): Promise<Stock | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // `input` (UpdateStockInput) ne contient pas `quantiteEnStock` → la quantité reste
      // intacte ; seul un mouvement tracé l'ajuste (étape ultérieure).
      const [row] = await tx
        .update(stocks)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(stocks.id, id), eq(stocks.artisanId, ctx.artisanId)))
        .returning();
      return row ? toStock(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      // Vérifie l'appartenance AVANT de purger les mouvements (mouvements_stock n'a pas
      // d'artisanId → on ne doit pas supprimer ceux d'un autre tenant). Atomique.
      const [owned] = await tx
        .select({ id: stocks.id })
        .from(stocks)
        .where(and(eq(stocks.id, id), eq(stocks.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return false;

      await tx.delete(mouvementsStock).where(eq(mouvementsStock.stockId, id));
      const deleted = await tx
        .delete(stocks)
        .where(and(eq(stocks.id, id), eq(stocks.artisanId, ctx.artisanId)))
        .returning({ id: stocks.id });
      return deleted.length > 0;
    });
  }
}
