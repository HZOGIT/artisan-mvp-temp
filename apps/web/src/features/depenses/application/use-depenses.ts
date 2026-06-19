import { trpc } from "@/shared/trpc";
import type { Budget, Categorie, Depense, KmClient } from "../domain/depense";

/*
 * Couche APPLICATION de la feature `depenses` (clean-archi) : SEULE couche important tRPC.
 * `useDepenses` couvre la liste + stats + catégories + budgets du mois + delete/exportFEC ;
 * `useIndemniteKm` isole le dialogue d'indemnité km (clients + mutation). L'UI attache ses effets
 * (toast / téléchargement / fermeture de dialogue / reset) via le `onSuccess` par appel de `.mutate()`.
 * 
 * NB (finding legacy) : `depenses.list` n'a PAS d'`.input()` → les filtres (catégorie/statut/mois/
 * recherche) sont ignorés côté serveur. On appelle donc `useQuery()` sans argument (contrat respecté).
 */
export function useDepenses(mois: string) {
  const utils = trpc.useUtils();
  const depensesQ = trpc.depenses.list.useQuery();
  const statsQ = trpc.depenses.stats.useQuery({ mois });
  const categoriesQ = trpc.depenses.getCategories.useQuery();
  const budgetsQ = trpc.depenses.getBudgets.useQuery({ mois });

  const remove = trpc.depenses.delete.useMutation({ onSuccess: () => utils.depenses.list.invalidate() });
  const exportFec = trpc.depenses.exportFecAchats.useMutation();

  const depenses: Depense[] = depensesQ.data ?? [];
  const categories: Categorie[] = categoriesQ.data ?? [];
  const budgets: Budget[] = budgetsQ.data ?? [];

  return { depenses, stats: statsQ.data, categories, budgets, remove, exportFec };
}

/** Dialogue Indemnités kilométriques : référentiel clients + mutation de création. */
export function useIndemniteKm() {
  const utils = trpc.useUtils();
  const clientsQ = trpc.clients.list.useQuery();
  const creer = trpc.depenses.creerIndemniteKm.useMutation({
    onSuccess: () => utils.depenses.list.invalidate(),
  });
  const clients: KmClient[] = clientsQ.data ?? [];
  return { clients, creer };
}
