import { describe, it, expect } from "vitest";
import { FakeBudgetCategorieRepository } from "../infra/budget-categorie-repository-fake";
import { creerBudget, modifierBudget, supprimerBudget, copierBudgetsMois } from "./write-use-cases";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("budgets-categories — write use-cases", () => {
  it("creerBudget valide : artisanId scopé + défauts montants", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07" });
    expect(b.artisanId).toBe(1);
    expect(b.budget).toBe("0.00");
    expect(b.depenseReelle).toBe("0.00");
  });

  it("validation : categorie vide / mois mal formé / montant non décimal → ValidationError", async () => {
    const repo = new FakeBudgetCategorieRepository();
    await expect(creerBudget(repo, A, { categorie: " ", mois: "2026-07" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerBudget(repo, A, { categorie: "x", mois: "2026-7" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerBudget(repo, A, { categorie: "x", mois: "2026-13" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerBudget(repo, A, { categorie: "x", mois: "2026-07", budget: "abc" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerBudget(repo, A, { categorie: "x", mois: "2026-07", depenseReelle: "-5" })).rejects.toBeInstanceOf(ValidationError);
    const ok = await creerBudget(repo, A, { categorie: "y", mois: "2026-07", budget: "500.00" });
    expect(ok.budget).toBe("500.00");
  });

  it("INVARIANT unicité : creerBudget sur (categorie, mois) déjà pris → ConflictError (remonte du repo)", async () => {
    const repo = new FakeBudgetCategorieRepository();
    await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07" });
    await expect(creerBudget(repo, A, { categorie: "carburant", mois: "2026-07" })).rejects.toBeInstanceOf(ConflictError);
    // même catégorie, autre mois → OK (clé d'unicité = (categorie, mois))
    expect((await creerBudget(repo, A, { categorie: "carburant", mois: "2026-08" })).mois).toBe("2026-08");
  });

  it("modifierBudget : NotFound si inexistant ; montant invalide → ValidationError ; montants seuls", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07", budget: "500.00" });
    await expect(modifierBudget(repo, A, 999999, { budget: "10.00" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierBudget(repo, A, b.id, { depenseReelle: "abc" })).rejects.toBeInstanceOf(ValidationError);
    const maj = await modifierBudget(repo, A, b.id, { depenseReelle: "120.00" });
    expect(maj.depenseReelle).toBe("120.00");
    expect(maj.budget).toBe("500.00"); // préservé
    expect(maj.categorie).toBe("carburant"); // immuable
    expect(maj.mois).toBe("2026-07"); // immuable
  });

  it("supprimerBudget : NotFound si inexistant", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07" });
    await supprimerBudget(repo, A, b.id);
    await expect(supprimerBudget(repo, A, b.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("copierBudgetsMois : copie source→cible (upsert par catégorie), scopé tenant", async () => {
    const repo = new FakeBudgetCategorieRepository();
    await creerBudget(repo, A, { categorie: "carburant", mois: "2026-06", budget: "300.00" });
    await creerBudget(repo, A, { categorie: "materiaux", mois: "2026-06", budget: "500.00" });
    // cible a déjà "carburant" (sera mis à jour, pas dupliqué)
    await creerBudget(repo, A, { categorie: "carburant", mois: "2026-07", budget: "100.00" });
    // budget d'un autre tenant (ne doit pas être copié)
    await creerBudget(repo, B, { categorie: "carburant", mois: "2026-06", budget: "999.00" });

    const res = await copierBudgetsMois(repo, A, "2026-06", "2026-07");
    expect(res).toEqual({ success: true, copies: 2 });
    const cible = (await repo.listByMois(A, "2026-07")).sort((x, y) => x.categorie.localeCompare(y.categorie));
    expect(cible.map((b) => [b.categorie, b.budget])).toEqual([
      ["carburant", "300.00"], // mis à jour (pas 100 ni dupliqué)
      ["materiaux", "500.00"], // créé
    ]);
    // isolation : B inchangé
    expect(await repo.listByMois(B, "2026-07")).toEqual([]);
  });

  it("copierBudgetsMois : format de mois invalide → ValidationError", async () => {
    const repo = new FakeBudgetCategorieRepository();
    await expect(copierBudgetsMois(repo, A, "2026-6", "2026-07")).rejects.toBeInstanceOf(ValidationError);
  });
});
