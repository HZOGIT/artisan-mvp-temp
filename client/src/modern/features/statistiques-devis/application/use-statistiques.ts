import { trpc } from "@/modern/shared/trpc";
import type { Devis } from "../domain/statistiques";

// Couche APPLICATION de la feature `statistiques-devis` (clean-archi) : SEULE couche important tRPC.
// Page de consultation (lecture seule) : charge la liste des devis (le calcul des stats vit dans le
// domaine, l'UI passe la période). Aucune mutation.
export function useStatistiquesDevis() {
  const q = trpc.devis.list.useQuery();
  const devis: Devis[] = q.data ?? [];
  return { devis, isLoading: q.isLoading };
}
