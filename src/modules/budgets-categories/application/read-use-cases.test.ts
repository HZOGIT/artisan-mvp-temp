import { describe, it, expect } from "vitest";
import { FakeBudgetCategorieRepository } from "../infra/budget-categorie-repository-fake";
import { listBudgets, budgetsParMois, getBudget } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("budgets-categories — read use-cases", () => {
  it("listBudgets renvoie les budgets du tenant", async () => {
    const repo = new FakeBudgetCategorieRepository();
    await repo.create(A, { categorie: "carburant", mois: "2026-07" });
    expect(await listBudgets(repo, A)).toHaveLength(1);
    expect(await listBudgets(repo, B)).toEqual([]);
  });

  it("budgetsParMois filtre sur le mois ; [] si aucun", async () => {
    const repo = new FakeBudgetCategorieRepository();
    await repo.create(A, { categorie: "carburant", mois: "2026-07" });
    await repo.create(A, { categorie: "fournitures", mois: "2026-08" });
    expect((await budgetsParMois(repo, A, "2026-07")).map((b) => b.categorie)).toEqual(["carburant"]);
    expect(await budgetsParMois(repo, A, "2026-12")).toEqual([]);
  });

  it("getBudget → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await repo.create(A, { categorie: "carburant", mois: "2026-07" });
    expect((await getBudget(repo, A, b.id)).categorie).toBe("carburant");
    await expect(getBudget(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getBudget(repo, B, b.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
