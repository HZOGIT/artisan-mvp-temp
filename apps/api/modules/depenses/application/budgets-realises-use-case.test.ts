import { describe, it, expect } from "vitest";
import { budgetsRealises } from "./budgets-realises-use-case";
import { FakeCategorieDepenseRepository } from "../../categories-depenses/infra/categorie-depense-repository-fake";
import { FakeBudgetCategorieRepository } from "../../budgets-categories/infra/budget-categorie-repository-fake";
import { FakeDepenseRepository } from "../infra/depense-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 5510001;
const B = 5510002;
const MOIS = "2026-06";

let numSeq = 0;
async function seedDepense(repo: FakeDepenseRepository, artisanId: number, categorie: string, montantTtc: string, dateDepense: string) {
  return repo.create(ctx(artisanId), {
    userId: 1,
    numero: `DEP-${++numSeq}`,
    dateDepense,
    categorie,
    montantHt: montantTtc,
    montantTtc,
  });
}

const byNom = (rows: Awaited<ReturnType<typeof budgetsRealises>>, nom: string) => rows.find((r) => r.categorie === nom)!;

describe("budgetsRealises (use-case dérivé budgets × réel, fakes)", () => {
  it("croise budget/réel par nom → écart + pct ; passe couleur/icône ; filtre par mois", async () => {
    const catRepo = new FakeCategorieDepenseRepository();
    const budgetRepo = new FakeBudgetCategorieRepository();
    const depenseRepo = new FakeDepenseRepository();
    await catRepo.create(ctx(A), { nom: "Matériel", couleur: "#111", icone: "wrench" });
    await catRepo.create(ctx(A), { nom: "Carburant", couleur: "#222", icone: "fuel" });
    await budgetRepo.create(ctx(A), { categorie: "Matériel", mois: MOIS, budget: "1000" });
    await budgetRepo.create(ctx(A), { categorie: "Carburant", mois: MOIS, budget: "200" });
    await seedDepense(depenseRepo, A, "Matériel", "600", `${MOIS}-10`);
    await seedDepense(depenseRepo, A, "Carburant", "250", `${MOIS}-12`); // dépassement
    await seedDepense(depenseRepo, A, "Matériel", "999", "2026-05-30"); // autre mois → exclu

    const rows = await budgetsRealises(catRepo, budgetRepo, depenseRepo, ctx(A), MOIS);

    const mat = byNom(rows, "Matériel");
    expect(mat).toMatchObject({ budget: 1000, reel: 600, ecart: 400, pct: 60, couleur: "#111", icone: "wrench" });
    const carb = byNom(rows, "Carburant");
    expect(carb).toMatchObject({ budget: 200, reel: 250, ecart: -50, pct: 125 });
  });

  it("budget > 0 sans dépense → reel 0, ecart = budget, pct 0", async () => {
    const catRepo = new FakeCategorieDepenseRepository();
    const budgetRepo = new FakeBudgetCategorieRepository();
    const depenseRepo = new FakeDepenseRepository();
    await catRepo.create(ctx(A), { nom: "Assurance" });
    await budgetRepo.create(ctx(A), { categorie: "Assurance", mois: MOIS, budget: "300" });

    const row = byNom(await budgetsRealises(catRepo, budgetRepo, depenseRepo, ctx(A), MOIS), "Assurance");
    expect(row).toMatchObject({ budget: 300, reel: 0, ecart: 300, pct: 0 });
  });

  it("budget 0 / absent → pct 0 (pas de division par zéro)", async () => {
    const catRepo = new FakeCategorieDepenseRepository();
    const budgetRepo = new FakeBudgetCategorieRepository();
    const depenseRepo = new FakeDepenseRepository();
    await catRepo.create(ctx(A), { nom: "Divers" });
    await seedDepense(depenseRepo, A, "Divers", "80", `${MOIS}-05`); // dépense mais aucun budget

    const row = byNom(await budgetsRealises(catRepo, budgetRepo, depenseRepo, ctx(A), MOIS), "Divers");
    expect(row).toMatchObject({ budget: 0, reel: 80, ecart: -80, pct: 0 });
  });

  it("scope tenant : le résultat de A ne contient QUE les catégories de A", async () => {
    const catRepo = new FakeCategorieDepenseRepository();
    const budgetRepo = new FakeBudgetCategorieRepository();
    const depenseRepo = new FakeDepenseRepository();
    await catRepo.create(ctx(A), { nom: "Matériel" });
    await catRepo.create(ctx(B), { nom: "Secret B" });

    const rows = await budgetsRealises(catRepo, budgetRepo, depenseRepo, ctx(A), MOIS);
    expect(rows.map((r) => r.categorie)).toEqual(["Matériel"]);
  });
});
