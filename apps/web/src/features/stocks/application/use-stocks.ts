import { trpc } from "@/shared/trpc";
import type { Stock, StockEntrant } from "../domain/stock";

/*
 * Couche APPLICATION de la feature `stocks` (clean-archi) : SEULE couche important tRPC.
 * `useStocks` couvre la liste + stock bas + entrant + le CRUD + ajustement + génération d'alertes ;
 * `useMouvements` isole l'historique d'UNE fiche (query dépendante de l'état UI).
 * L'UI attache ses effets (toast / fermeture de dialogue / reset) via le `onSuccess` par appel.
 */
export function useStocks() {
  const utils = trpc.useUtils();
  const stocksQ = trpc.stocks.list.useQuery();
  const lowStockQ = trpc.stocks.getLowStock.useQuery();
  const entrantQ = trpc.stocks.getEntrant.useQuery();

  const invalidateLists = () => {
    utils.stocks.list.invalidate();
    utils.stocks.getLowStock.invalidate();
  };
  const create = trpc.stocks.create.useMutation({ onSuccess: invalidateLists });
  const update = trpc.stocks.update.useMutation({ onSuccess: invalidateLists });
  const remove = trpc.stocks.delete.useMutation({ onSuccess: invalidateLists });
  const adjust = trpc.stocks.adjustQuantity.useMutation({
    onSuccess: () => {
      invalidateLists();
      utils.stocks.getMouvements.invalidate();
    },
  });
  const generateAlerts = trpc.stocks.generateAlerts.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const stocks: Stock[] = stocksQ.data ?? [];
  const lowStockItems: Stock[] = lowStockQ.data ?? [];
  const stockEntrant: StockEntrant[] = entrantQ.data ?? [];

  return {
    stocks,
    lowStockItems,
    stockEntrant,
    isLoading: stocksQ.isLoading,
    create,
    update,
    remove,
    adjust,
    generateAlerts,
  };
}

/** Historique des mouvements d'UNE fiche stock (query dépendante : seulement quand le dialogue est ouvert). */
export function useMouvements(stockId: number, enabled: boolean) {
  const q = trpc.stocks.getMouvements.useQuery({ stockId }, { enabled: enabled && stockId > 0 });
  return { mouvements: q.data ?? [], isLoading: q.isLoading };
}

/** Inventaire physique : liste + détail + mutations. */
export function useInventaire() {
  const utils = trpc.useUtils();
  const listQ = trpc.stocks.inventaire.list.useQuery();

  const invalidate = () => {
    utils.stocks.inventaire.list.invalidate();
    utils.stocks.list.invalidate();
    utils.stocks.getLowStock.invalidate();
  };

  const demarrer = trpc.stocks.inventaire.demarrer.useMutation({ onSuccess: invalidate });
  const saisirComptage = trpc.stocks.inventaire.saisirComptage.useMutation({ onSuccess: invalidate });
  const valider = trpc.stocks.inventaire.valider.useMutation({ onSuccess: invalidate });

  return {
    inventaires: listQ.data ?? [],
    isLoading: listQ.isLoading,
    demarrer,
    saisirComptage,
    valider,
  };
}

/** Détail d'un inventaire (query conditionnelle). */
export function useInventaireDetail(id: number | null) {
  const q = trpc.stocks.inventaire.getById.useQuery({ id: id ?? 0 }, { enabled: id !== null });
  return { detail: q.data ?? null, isLoading: q.isLoading };
}
