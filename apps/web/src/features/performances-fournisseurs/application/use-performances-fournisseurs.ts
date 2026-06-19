import { trpc } from "@/shared/trpc";
import type { Performance, Commande, Fournisseur } from "../domain/performances-fournisseurs";

/*
 * Couche APPLICATION — performances fournisseurs : perfs + commandes + fournisseurs + création/transition.
 * SEULE couche important tRPC ; effets (toast, fermeture dialog) en UI via options.
 */
export function usePerformancesFournisseurs() {
  const perfQ = trpc.commandesFournisseurs.getPerformances.useQuery();
  const commandesQ = trpc.commandesFournisseurs.list.useQuery();
  const fournisseursQ = trpc.fournisseurs.list.useQuery();
  const refetch = () => commandesQ.refetch();

  const create = trpc.commandesFournisseurs.create.useMutation({ onSuccess: () => refetch() });
  const updateStatut = trpc.commandesFournisseurs.updateStatut.useMutation({ onSuccess: () => refetch() });

  const performances: Performance[] = perfQ.data ?? [];
  const commandes: Commande[] = commandesQ.data ?? [];
  const fournisseurs: Fournisseur[] = fournisseursQ.data ?? [];

  return { performances, commandes, fournisseurs, isLoading: perfQ.isLoading, create, updateStatut };
}
