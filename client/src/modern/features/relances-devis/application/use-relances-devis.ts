import { trpc } from "@/modern/shared/trpc";
import type { DevisNonSigne } from "../domain/relance-devis";

// Couche APPLICATION de la feature `relances-devis` (clean-archi) : SEULE couche important tRPC.
// Charge les devis non signés (≥ N jours, enrichis client + signature) et expose les mutations de
// relance (individuelle + automatique en lot) avec invalidation de la liste. Les effets de
// présentation (toasts, fermeture de dialog) sont attachés par l'UI via `mutate(vars, { onSuccess })`.
export function useRelancesDevis(joursMinimum: number) {
  const utils = trpc.useUtils();
  const listQ = trpc.devis.getDevisNonSignes.useQuery({ joursMinimum }, { refetchOnWindowFocus: false });

  const invalidate = () => utils.devis.getDevisNonSignes.invalidate();

  const envoyerRelance = trpc.devis.envoyerRelance.useMutation({ onSuccess: invalidate });
  const envoyerRelancesAuto = trpc.devis.envoyerRelancesAutomatiques.useMutation({ onSuccess: invalidate });

  const devisNonSignes: DevisNonSigne[] = listQ.data ?? [];

  return { devisNonSignes, isLoading: listQ.isLoading, envoyerRelance, envoyerRelancesAuto };
}
