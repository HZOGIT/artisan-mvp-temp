import { trpc } from "@/shared/trpc";
import type { Facture, FactureClient } from "../domain/facture";

/*
 * Couche APPLICATION de la feature `factures` (clean-archi) : SEULE couche important tRPC.
 * Encapsule les queries (liste factures + clients) et les mutations (create/delete) avec
 * invalidation, et expose des données TYPÉES + des actions. L'UI ne connaît plus le transport ;
 * elle attache ses effets (toast/navigation/fermeture de dialogue) via le `onSuccess` par appel.
 */
export function useFactures() {
  const utils = trpc.useUtils();
  const facturesQ = trpc.factures.list.useQuery();
  const clientsQ = trpc.clients.list.useQuery();

  const create = trpc.factures.create.useMutation({
    onSuccess: () => utils.factures.list.invalidate(),
  });
  const remove = trpc.factures.delete.useMutation({
    onSuccess: () => utils.factures.list.invalidate(),
  });

  const factures: Facture[] = facturesQ.data ?? [];
  const clients: FactureClient[] = clientsQ.data ?? [];

  return { factures, clients, isLoading: facturesQ.isLoading, create, remove };
}

/*
 * Encours impayé d'un client (alerte non bloquante du dialogue de création) — query dépendante de
 * l'état UI (client sélectionné), isolée dans la couche application.
 */
export function useClientEncours(clientId: number | null) {
  const enabled = clientId != null && !Number.isNaN(clientId);
  const q = trpc.clients.getEncours.useQuery({ clientId: clientId ?? 0 }, { enabled });
  return q.data;
}
