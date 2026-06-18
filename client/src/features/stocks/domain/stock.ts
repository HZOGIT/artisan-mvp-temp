import type { RouterOutputs } from "@/shared/trpc";
import { matchSearch } from "@/shared/lib/normalize";

// Couche DOMAINE de la feature `stocks` (clean-archi) : types dérivés des sorties du routeur tRPC +
// règles PURES testables sans réseau ni i18n (recherche, seuil d'alerte, valeur de stock, stock entrant).

export type Stock = RouterOutputs["stocks"]["list"][number];
export type Mouvement = RouterOutputs["stocks"]["getMouvements"][number];
export type StockEntrant = RouterOutputs["stocks"]["getEntrant"][number];

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

// Recherche PURE (référence / désignation / fournisseur).
export function filterStocks(list: readonly Stock[], query: string): Stock[] {
  return list.filter(
    (s) => matchSearch(s.reference, query) || matchSearch(s.designation, query) || matchSearch(s.fournisseur, query),
  );
}

// Stock bas PUR : quantité <= seuil d'alerte. Mêmes règles que le legacy.
export function isLowStock(stock: Pick<Stock, "quantiteEnStock" | "seuilAlerte">): boolean {
  return toNum(stock.quantiteEnStock) <= toNum(stock.seuilAlerte);
}

// Valeur totale PURE du stock (Σ quantité × prix d'achat).
export function totalStockValue(list: readonly Stock[]): number {
  return list.reduce((sum, s) => sum + toNum(s.quantiteEnStock) * toNum(s.prixAchat), 0);
}

// Index PUR stockId → quantité entrante (commandes fournisseurs en cours).
export function indexEntrantByStock(entrant: readonly StockEntrant[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const e of entrant) map.set(e.stockId, e.entrant);
  return map;
}

// Stock prévisionnel PUR (quantité actuelle + entrant).
export function previsionnel(stock: Pick<Stock, "quantiteEnStock">, entrantQty: number): number {
  return toNum(stock.quantiteEnStock) + entrantQty;
}
