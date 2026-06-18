import { trpc } from "@/shared/trpc";
import type { Modele } from "../domain/modeles-email-transactionnels";

// Couche APPLICATION — modèles d'emails transactionnels (source `modelesEmail`) : liste + CRUD.
// SEULE couche important tRPC ; effets (toast, fermeture modal, reset) en UI via options de `mutate`.
export function useModelesTransactionnels() {
  const listQ = trpc.modelesEmail.list.useQuery();
  const refetch = () => listQ.refetch();

  const create = trpc.modelesEmail.create.useMutation({ onSuccess: () => refetch() });
  const update = trpc.modelesEmail.update.useMutation({ onSuccess: () => refetch() });
  const remove = trpc.modelesEmail.delete.useMutation({ onSuccess: () => refetch() });

  const modeles: Modele[] = listQ.data ?? [];

  return { modeles, create, update, remove };
}
