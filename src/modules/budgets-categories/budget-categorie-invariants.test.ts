import { describe, it, expect } from "vitest";
import { FakeBudgetCategorieRepository } from "./infra/budget-categorie-repository-fake";
import { creerBudget, modifierBudget, supprimerBudget } from "./application/write-use-cases";
import { getBudget, listBudgets, budgetsParMois } from "./application/read-use-cases";
import { ConflictError, NotFoundError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine budgets-categories (budget mensuel par catégorie ;
// CRUD catalogue + unicité (categorie, mois) ; categorie/mois immuables = clé d'unicité).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("budgets-categories — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD d'un autre tenant → NotFound/[]", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07" });
    await expect(getBudget(repo, B, b.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierBudget(repo, B, b.id, { budget: "10.00" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerBudget(repo, B, b.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listBudgets(repo, B)).toEqual([]);
    expect(await budgetsParMois(repo, B, "2026-07")).toEqual([]);
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07" });
    expect(b.artisanId).toBe(1);
  });

  it("INV-3 : défauts montants '0.00' quand absents", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07" });
    expect(b.budget).toBe("0.00");
    expect(b.depenseReelle).toBe("0.00");
  });

  it("INV-4 : unicité (categorie, mois) par artisan — doublon → ConflictError ; autre mois / autre tenant → OK", async () => {
    const repo = new FakeBudgetCategorieRepository();
    await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07" });
    await expect(creerBudget(repo, A, { categorie: "carburant", mois: "2026-07" })).rejects.toBeInstanceOf(ConflictError);
    // même catégorie, autre mois → OK
    expect((await creerBudget(repo, A, { categorie: "carburant", mois: "2026-08" })).mois).toBe("2026-08");
    // même (categorie, mois), tenant DIFFÉRENT → OK (unicité par artisan)
    const bB = await creerBudget(repo, B, { categorie: "carburant", mois: "2026-07" });
    expect(bB.artisanId).toBe(2);
  });

  it("INV-5 : categorie/mois immuables — modifierBudget ne change QUE les montants", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07", budget: "500.00" });
    const maj = await modifierBudget(repo, A, b.id, { depenseReelle: "120.00" });
    expect(maj.depenseReelle).toBe("120.00");
    expect(maj.budget).toBe("500.00"); // préservé
    expect(maj.categorie).toBe("carburant"); // immuable
    expect(maj.mois).toBe("2026-07"); // immuable
  });
});
