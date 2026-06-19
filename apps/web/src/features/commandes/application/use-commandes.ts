import { trpc } from "@/shared/trpc";
import type { Commande, CommandeFournisseur } from "../domain/commande";

/*
 * Couche APPLICATION de la feature `commandes` (clean-archi) : SEULE couche important tRPC.
 * Encapsule les queries (commandes + fournisseurs pour le filtre) et les mutations (delete / sendEmail)
 * avec invalidation, expose des données TYPÉES + des actions. L'UI attache ses effets (toast) via le
 * `onSuccess` par appel de `.mutate()`.
 */
export function useCommandes() {
  const utils = trpc.useUtils();
  const commandesQ = trpc.commandesFournisseurs.list.useQuery();
  const fournisseursQ = trpc.fournisseurs.list.useQuery();

  const invalidate = () => utils.commandesFournisseurs.list.invalidate();
  const remove = trpc.commandesFournisseurs.delete.useMutation({ onSuccess: invalidate });
  const sendEmail = trpc.commandesFournisseurs.sendEmail.useMutation({ onSuccess: invalidate });

  const commandes: Commande[] = commandesQ.data ?? [];
  const fournisseurs: CommandeFournisseur[] = fournisseursQ.data ?? [];

  return { commandes, fournisseurs, isLoading: commandesQ.isLoading, remove, sendEmail };
}
