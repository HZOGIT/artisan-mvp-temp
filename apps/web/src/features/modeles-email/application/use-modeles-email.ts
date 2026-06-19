import { trpc } from "@/shared/trpc";
import type { Modele } from "../domain/modeles-email";

/*
 * Couche APPLICATION — modèles d'emails : liste + CRUD. SEULE couche important tRPC. Les effets (toast,
 * fermeture dialog, reset form) restent en UI (passés via les options de chaque `mutate`).
 */
export function useModelesEmail() {
  const listQ = trpc.modelesEmail.list.useQuery();
  const refetch = () => listQ.refetch();

  const create = trpc.modelesEmail.create.useMutation({ onSuccess: () => refetch() });
  const update = trpc.modelesEmail.update.useMutation({ onSuccess: () => refetch() });
  const remove = trpc.modelesEmail.delete.useMutation({ onSuccess: () => refetch() });

  const modeles: Modele[] = listQ.data ?? [];

  return { modeles, isLoading: listQ.isLoading, create, update, remove };
}
