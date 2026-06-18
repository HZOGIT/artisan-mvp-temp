import { describe, it, expect } from "vitest";
import { FakeBudgetCategorieRepository } from "./budget-categorie-repository-fake";
import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("FakeBudgetCategorieRepository (CRUD + unicité (categorie, mois), sans DB)", () => {
  it("create force artisanId + défauts montants '0'", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await repo.create(A, { categorie: "carburant", mois: "2026-07" });
    expect(b.artisanId).toBe(1);
    expect(b.budget).toBe("0.00");
    expect(b.depenseReelle).toBe("0.00");
  });

  it("getById / list / listByMois scopés au tenant", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await repo.create(A, { categorie: "carburant", mois: "2026-07", budget: "500.00" });
    await repo.create(A, { categorie: "fournitures", mois: "2026-08" });
    expect((await repo.getById(A, b.id))?.budget).toBe("500.00");
    expect(await repo.list(A)).toHaveLength(2);
    expect((await repo.listByMois(A, "2026-07")).map((x) => x.categorie)).toEqual(["carburant"]);
    expect(await repo.list(B)).toEqual([]);
  });

  it("INVARIANT unicité : 2e create même (categorie, mois) même tenant → ConflictError", async () => {
    const repo = new FakeBudgetCategorieRepository();
    await repo.create(A, { categorie: "carburant", mois: "2026-07" });
    await expect(repo.create(A, { categorie: "carburant", mois: "2026-07" })).rejects.toBeInstanceOf(ConflictError);
    // même (categorie, mois) tenant DIFFÉRENT → OK ; même catégorie autre mois → OK
    expect((await repo.create(B, { categorie: "carburant", mois: "2026-07" })).artisanId).toBe(2);
    expect((await repo.create(A, { categorie: "carburant", mois: "2026-08" })).mois).toBe("2026-08");
  });

  it("update ne modifie que les montants (categorie/mois immuables) ; partiel préserve", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await repo.create(A, { categorie: "carburant", mois: "2026-07", budget: "500.00" });
    const maj = await repo.update(A, b.id, { depenseReelle: "120.00" });
    expect(maj?.depenseReelle).toBe("120.00");
    expect(maj?.budget).toBe("500.00"); // préservé
    expect(maj?.categorie).toBe("carburant"); // inchangé
    expect(maj?.mois).toBe("2026-07"); // inchangé
  });

  it("isolation cross-tenant : B → getById null, update/delete inopérants", async () => {
    const repo = new FakeBudgetCategorieRepository();
    const b = await repo.create(A, { categorie: "carburant", mois: "2026-07" });
    expect(await repo.getById(B, b.id)).toBeNull();
    expect(await repo.update(B, b.id, { budget: "1.00" })).toBeNull();
    expect(await repo.delete(B, b.id)).toBe(false);
    expect(await repo.delete(A, b.id)).toBe(true);
  });
});
