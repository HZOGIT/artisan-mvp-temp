import { trpc } from "@/modern/shared/trpc";
import type { Categorie, Regle } from "../domain/regle";

// Couche APPLICATION de la feature `regles-depenses` (clean-archi) : SEULE couche important tRPC.
// Charge les règles + les catégories (pour le sélecteur/couleurs) et expose les mutations (création /
// suppression) avec invalidation. L'UI attache ses effets (toast / reset de formulaire) par appel.
export function useRegles() {
  const utils = trpc.useUtils();
  const reglesQ = trpc.depenses.getRegles.useQuery();
  const categoriesQ = trpc.depenses.getCategories.useQuery();

  const invalidate = () => utils.depenses.getRegles.invalidate();
  const createRegle = trpc.depenses.createRegle.useMutation({ onSuccess: invalidate });
  const deleteRegle = trpc.depenses.deleteRegle.useMutation({ onSuccess: invalidate });

  const regles: Regle[] = reglesQ.data ?? [];
  const categories: Categorie[] = categoriesQ.data ?? [];

  return { regles, categories, createRegle, deleteRegle };
}
