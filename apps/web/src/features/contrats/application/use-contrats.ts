import { trpc } from "@/shared/trpc";
import type { Contrat, Client } from "../domain/contrat";

// Couche APPLICATION de la feature `contrats` (clean-archi) : SEULE couche important tRPC.
// Charge les contrats + la liste clients (pour résoudre les noms, le new-stack ne joint pas le
// client) et expose les mutations CRUD + génération de facture, avec invalidation de la liste.
// Les effets de présentation (toasts, fermeture de dialog, reset) sont attachés par l'UI au cas par
// cas via `mutate(vars, { onSuccess, onError })`.
export function useContrats() {
  const utils = trpc.useUtils();
  const listQ = trpc.contrats.list.useQuery();
  const clientsQ = trpc.clients.list.useQuery();

  const invalidate = () => utils.contrats.list.invalidate();

  const create = trpc.contrats.create.useMutation({ onSuccess: invalidate });
  const update = trpc.contrats.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.contrats.delete.useMutation({ onSuccess: invalidate });
  const generateFacture = trpc.contrats.generateFacture.useMutation({ onSuccess: invalidate });

  const contrats: Contrat[] = listQ.data ?? [];
  const clients: Client[] = clientsQ.data ?? [];

  return { contrats, clients, isLoading: listQ.isLoading, create, update, remove, generateFacture };
}
