import { trpc } from "@/shared/trpc";
import type { Budget } from "../domain/budget";

/*
 * Couche APPLICATION de la feature `budgets-depenses` (clean-archi) : SEULE couche important tRPC.
 * Charge les budgets du mois et expose les mutations (édition d'un budget catégorie + copie du mois
 * précédent) avec invalidation. L'UI attache ses effets (toast) via le `onSuccess` par appel.
 */
export function useBudgets(mois: string) {
  const utils = trpc.useUtils();
  const budgetsQ = trpc.depenses.getBudgets.useQuery({ mois });

  const invalidate = () => utils.depenses.getBudgets.invalidate({ mois });
  const setBudget = trpc.depenses.setBudget.useMutation({ onSuccess: invalidate });
  const copyBudgets = trpc.depenses.copierBudgetsMois.useMutation({ onSuccess: invalidate });

  const budgets: Budget[] = budgetsQ.data ?? [];

  return { budgets, setBudget, copyBudgets };
}
