import { trpc } from "@/modern/shared/trpc";
import type { RdvItem, RdvStats } from "../domain/rdv-en-ligne";

// Couche APPLICATION — RDV en ligne : liste (filtrée par statut) + stats + transitions (confirm/refuse/
// proposeAutreCreneau, avec invalidations). SEULE couche important tRPC ; effets (toast, reset) en UI.
export function useRdvEnLigne() {
  const utils = trpc.useUtils();
  const listQ = trpc.rdv.list.useQuery();
  const statsQ = trpc.rdv.getStats.useQuery();

  const invalidate = () => {
    utils.rdv.list.invalidate();
    utils.rdv.getStats.invalidate();
    utils.rdv.getPendingCount.invalidate();
  };

  const confirm = trpc.rdv.confirm.useMutation({ onSuccess: invalidate });
  const refuse = trpc.rdv.refuse.useMutation({ onSuccess: invalidate });
  const proposeAutreCreneau = trpc.rdv.proposeAutreCreneau.useMutation({ onSuccess: invalidate });

  const rdvList: RdvItem[] = listQ.data ?? [];
  const stats: RdvStats | undefined = statsQ.data;

  return { rdvList, stats, isLoading: listQ.isLoading, confirm, refuse, proposeAutreCreneau };
}
