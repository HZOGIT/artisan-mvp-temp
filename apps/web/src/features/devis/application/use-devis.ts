import { trpc } from "@/shared/trpc";
import type { Devis, DevisClient } from "../domain/devis";

/*
 * Couche APPLICATION de la feature `devis` (clean-archi) : SEULE couche important tRPC.
 * Encapsule les queries (liste devis + clients) et les mutations (delete / convertToFacture) avec
 * invalidation, expose des données TYPÉES + des actions. L'UI ne connaît plus le transport ; elle
 * attache ses effets (toast/navigation/confirm) via le `onSuccess` par appel de `.mutate()`.
 */
export function useDevis() {
  const utils = trpc.useUtils();
  const devisQ = trpc.devis.list.useQuery();
  const clientsQ = trpc.clients.list.useQuery();

  const remove = trpc.devis.delete.useMutation({
    onSuccess: () => utils.devis.list.invalidate(),
  });
  const convertToFacture = trpc.devis.convertToFacture.useMutation({
    onSuccess: () => {
      utils.devis.list.invalidate();
      utils.factures.list.invalidate();
    },
  });

  const devis: Devis[] = devisQ.data ?? [];
  const clients: DevisClient[] = clientsQ.data ?? [];

  return { devis, clients, isLoading: devisQ.isLoading, remove, convertToFacture };
}
