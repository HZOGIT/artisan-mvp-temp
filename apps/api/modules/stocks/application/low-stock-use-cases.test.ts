import { describe, it, expect } from "vitest";
import { FakeStockRepository } from "../infra/stock-repository-fake";
import { listStocksEnAlerte, listStocksEnRupture } from "./read-use-cases";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("alertes de seuil (getLowStock / getStocksEnRupture)", () => {
  it("listStocksEnAlerte = stocks sous le seuil (quantité ≤ seuil), inclut les ruptures", async () => {
    const repo = new FakeStockRepository();
    await repo.create(A, { reference: "BAS", designation: "Sous seuil", quantiteEnStock: "2", seuilAlerte: "5" });
    await repo.create(A, { reference: "OK", designation: "Au-dessus", quantiteEnStock: "20", seuilAlerte: "5" });
    await repo.create(A, { reference: "VIDE", designation: "Épuisé", quantiteEnStock: "0", seuilAlerte: "5" });
    const alerte = await listStocksEnAlerte(repo, A);
    expect(alerte.map((s) => s.reference).sort()).toEqual(["BAS", "VIDE"]);
  });

  it("listStocksEnRupture = rupture stricte (quantité ≤ 0), sous-ensemble de l'alerte", async () => {
    const repo = new FakeStockRepository();
    await repo.create(A, { reference: "BAS", designation: "Sous seuil", quantiteEnStock: "2", seuilAlerte: "5" });
    await repo.create(A, { reference: "VIDE", designation: "Épuisé", quantiteEnStock: "0", seuilAlerte: "5" });
    const rupture = await listStocksEnRupture(repo, A);
    expect(rupture.map((s) => s.reference)).toEqual(["VIDE"]);
  });

  it("au seuil exact (quantité = seuil) → en alerte mais pas en rupture", async () => {
    const repo = new FakeStockRepository();
    await repo.create(A, { reference: "LIMITE", designation: "Au seuil", quantiteEnStock: "5", seuilAlerte: "5" });
    expect((await listStocksEnAlerte(repo, A)).map((s) => s.reference)).toEqual(["LIMITE"]);
    expect(await listStocksEnRupture(repo, A)).toEqual([]);
  });

  it("isolation cross-tenant : un stock bas de B n'apparaît pas pour A", async () => {
    const repo = new FakeStockRepository();
    await repo.create(B, { reference: "B-BAS", designation: "Bas chez B", quantiteEnStock: "0", seuilAlerte: "5" });
    expect(await listStocksEnAlerte(repo, A)).toEqual([]);
    expect(await listStocksEnRupture(repo, A)).toEqual([]);
  });
});
