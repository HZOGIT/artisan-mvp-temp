import { trpc } from "@/shared/trpc";
import type { Avis } from "../domain/avis";

/*
 * Couche APPLICATION de la feature `avis` (clean-archi) : SEULE couche important tRPC.
 * Charge les avis + les stats et expose les mutations (répondre / modérer) avec invalidation de la liste.
 * L'UI attache ses effets (toast / fermeture de dialogue / reset) via le `onSuccess` par appel.
 */
export function useAvis() {
  const utils = trpc.useUtils();
  const avisQ = trpc.avis.getAll.useQuery();
  const statsQ = trpc.avis.getStats.useQuery();

  const invalidate = () => utils.avis.getAll.invalidate();
  const repondre = trpc.avis.repondre.useMutation({ onSuccess: invalidate });
  const moderer = trpc.avis.moderer.useMutation({ onSuccess: invalidate });

  const avis: Avis[] = avisQ.data ?? [];

  return { avis, stats: statsQ.data, repondre, moderer };
}
