import { trpc } from "@/shared/trpc";
import type { Stats, Budget, Categorie } from "../domain/tableau-bord-depenses";

// Couche APPLICATION — tableau de bord dépenses : stats du mois + budgets + catégories + profil artisan
// (en-tête PDF). SEULE couche important tRPC.
export function useTableauBordDepenses(mois: string) {
  const statsQ = trpc.depenses.stats.useQuery({ mois });
  const budgetsQ = trpc.depenses.getBudgets.useQuery({ mois });
  const categoriesQ = trpc.depenses.getCategories.useQuery();
  const artisanQ = trpc.artisan.getProfile.useQuery();

  const stats: Stats | undefined = statsQ.data;
  const budgets: Budget[] = budgetsQ.data ?? [];
  const categories: Categorie[] = categoriesQ.data ?? [];

  return { stats, budgets, categories, artisan: artisanQ.data };
}
