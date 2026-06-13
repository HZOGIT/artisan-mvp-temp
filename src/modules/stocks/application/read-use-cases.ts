import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository } from "./stock-repository";
import type { Stock, MouvementStock } from "../domain/stock";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par
// le `TenantContext` (le repo l'applique). `getStock` sur une ressource d'un autre tenant
// → le repo renvoie null → NotFoundError (ne révèle pas l'existence).

export function listStocks(repo: IStockRepository, ctx: TenantContext): Promise<Stock[]> {
  return repo.list(ctx);
}

export async function getStock(repo: IStockRepository, ctx: TenantContext, id: number): Promise<Stock> {
  const stock = await repo.getById(ctx, id);
  if (!stock) throw new NotFoundError("Stock introuvable");
  return stock;
}

// Historique des mouvements d'un stock (récents d'abord). Le repo renvoie null si le stock
// n'appartient pas au tenant → NotFoundError (même réponse que pour un id inexistant :
// ne révèle pas l'existence d'un stock cross-tenant).
export async function getMouvementsStock(
  repo: IStockRepository,
  ctx: TenantContext,
  stockId: number,
): Promise<MouvementStock[]> {
  const mouvements = await repo.listMouvements(ctx, stockId);
  if (mouvements === null) throw new NotFoundError("Stock introuvable");
  return mouvements;
}
