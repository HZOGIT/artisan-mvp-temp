import type { TenantContext } from "../../../shared/tenant";
import type { IDepenseRepository } from "./depense-repository";
import type { ICategorieDepenseRepository } from "../../categories-depenses/application/categorie-depense-repository";
import type { IBudgetCategorieRepository } from "../../budgets-categories/application/budget-categorie-repository";
import { listCategories } from "../../categories-depenses/application/read-use-cases";
import { budgetsParMois } from "../../budgets-categories/application/read-use-cases";

/*
 * Vue « budgets réalisés » d'un mois (parité legacy `trpc.depenses.getBudgets`). Montants en NUMBER
 * comme le legacy (consommés par le dashboard front).
 */
export interface BudgetRealise {
  readonly categorie: string;
  readonly couleur: string;
  readonly icone: string;
  readonly budget: number;
  readonly reel: number;
  readonly ecart: number;
  readonly pct: number;
}

/*
 * Read DÉRIVÉ : pour CHAQUE catégorie de l'artisan, croise le budget du mois (budgets-categories) avec
 * le réalisé (SUM des dépenses TTC du mois agrégé par catégorie) → écart + pourcentage. Le réalisé
 * n'est PAS le champ stocké `depenseReelle` : il est recalculé depuis les dépenses (cf.
 * `calculerBudgetsRealises`). Les 3 sources sont croisées par le NOM de catégorie.
 */
export async function budgetsRealises(
  categorieRepo: ICategorieDepenseRepository,
  budgetRepo: IBudgetCategorieRepository,
  depenseRepo: IDepenseRepository,
  ctx: TenantContext,
  mois: string,
): Promise<BudgetRealise[]> {
  const cats = await listCategories(categorieRepo, ctx);
  const budgets = await budgetsParMois(budgetRepo, ctx, mois);
  const realises = await depenseRepo.realisesParCategorie(ctx, mois);
  const budgetMap = new Map(budgets.map((b) => [b.categorie, Number(b.budget)]));
  const reelMap = new Map(realises.map((r) => [r.categorie, Number(r.reel)]));
  return cats.map((c) => {
    const budget = budgetMap.get(c.nom) ?? 0;
    const reel = reelMap.get(c.nom) ?? 0;
    return {
      categorie: c.nom,
      couleur: c.couleur,
      icone: c.icone,
      budget,
      reel,
      ecart: budget - reel,
      pct: budget > 0 ? Math.round((reel / budget) * 100) : 0,
    };
  });
}
