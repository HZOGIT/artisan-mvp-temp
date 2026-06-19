import { trpc, type RouterOutputs } from "@/shared/trpc";

/*
 * Couche APPLICATION du widget « À faire » (CRM next-action). SEULE couche important tRPC : liste + mutations
 * (create/toggle/delete) avec invalidation. Toasts + i18n gérés en UI.
 */
export type Activite = RouterOutputs["activites"]["list"][number];
export function useActivitesAFaire() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.activites.list.useQuery();
  const invalidate = () => utils.activites.list.invalidate();
  return {
    activites: (data ?? []) as Activite[],
    isLoading,
    createMut: trpc.activites.create.useMutation({ onSuccess: invalidate }),
    toggleMut: trpc.activites.toggleFait.useMutation({ onSuccess: invalidate }),
    deleteMut: trpc.activites.delete.useMutation({ onSuccess: invalidate }),
  };
}
