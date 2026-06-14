import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IBudgetCategorieRepository } from "./budget-categorie-repository";
import type { BudgetCategorie, CreateBudgetInput, UpdateBudgetInput } from "../domain/budget-categorie";

// Use-cases d'écriture — purs, repository injecté. Validation métier. ⚠️ L'unicité
// (artisan_id, categorie, mois) est garantie par la contrainte DB et remonte du repo sous forme de
// `ConflictError` (on la laisse propager — formatter TRPC → 409). `categorie`/`mois` sont la clé
// d'unicité immuable : l'update ne touche que les montants. Le scoping tenant est porté par le repo.

const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/; // "YYYY-MM"
const DECIMAL_2 = /^\d+(\.\d{1,2})?$/; // montant ≥ 0, 2 décimales max

function assertMontant(valeur: string | undefined, label: string): void {
  if (valeur === undefined) return;
  if (!DECIMAL_2.test(valeur)) throw new ValidationError(`Le ${label} doit être un montant positif (2 décimales max)`);
}

export async function creerBudget(
  repo: IBudgetCategorieRepository,
  ctx: TenantContext,
  input: CreateBudgetInput,
): Promise<BudgetCategorie> {
  if (!input.categorie?.trim()) throw new ValidationError("La catégorie est requise");
  if (!MOIS.test(input.mois)) throw new ValidationError("Le mois doit être au format YYYY-MM");
  assertMontant(input.budget, "budget");
  assertMontant(input.depenseReelle, "montant de dépense réelle");
  return repo.create(ctx, input); // ConflictError (budget déjà présent pour (categorie, mois)) remonte du repo
}

export async function modifierBudget(
  repo: IBudgetCategorieRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateBudgetInput,
): Promise<BudgetCategorie> {
  assertMontant(input.budget, "budget");
  assertMontant(input.depenseReelle, "montant de dépense réelle");
  const updated = await repo.update(ctx, id, input); // montants seuls (categorie/mois immuables)
  if (!updated) throw new NotFoundError("Budget introuvable");
  return updated;
}

export async function supprimerBudget(repo: IBudgetCategorieRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Budget introuvable");
}

// Copie les budgets d'un mois source vers un mois cible (upsert par catégorie). Parité legacy
// `copierBudgetsMois`. Idempotent : une catégorie déjà budgétée dans le mois cible est mise à jour
// (pas dupliquée — contrainte d'unicité (artisan,categorie,mois)). Scopé tenant par le repo.
export async function copierBudgetsMois(
  repo: IBudgetCategorieRepository,
  ctx: TenantContext,
  moisSource: string,
  moisCible: string,
): Promise<{ success: true; copies: number }> {
  if (!MOIS.test(moisSource) || !MOIS.test(moisCible)) throw new ValidationError("Format de mois attendu : AAAA-MM");
  const sources = await repo.listByMois(ctx, moisSource);
  const cible = await repo.listByMois(ctx, moisCible);
  const parCategorie = new Map(cible.map((b) => [b.categorie, b]));
  let copies = 0;
  for (const s of sources) {
    const existant = parCategorie.get(s.categorie);
    if (existant) await repo.update(ctx, existant.id, { budget: s.budget });
    else await repo.create(ctx, { categorie: s.categorie, mois: moisCible, budget: s.budget });
    copies++;
  }
  return { success: true, copies };
}
