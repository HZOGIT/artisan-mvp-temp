import { describe, it, expect } from "vitest";
import { FakeStockRepository } from "../infra/stock-repository-fake";
import { ajusterQuantiteStock } from "./write-use-cases";
import { getMouvementsStock } from "./read-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

async function seedStock(repo: FakeStockRepository, ctx: TenantContext, quantite: string) {
  return repo.create(ctx, { reference: "R", designation: "D", quantiteEnStock: quantite });
}

describe("ajusterQuantiteStock (mouvement tracé = unique voie de modif quantité)", () => {
  it("entree incrémente la quantité et trace un mouvement avant/après", async () => {
    const repo = new FakeStockRepository();
    const s = await seedStock(repo, A, "10.00");
    const maj = await ajusterQuantiteStock(repo, A, s.id, { type: "entree", quantite: "5" });
    expect(maj.quantiteEnStock).toBe("15.00");
    const [mvt] = await getMouvementsStock(repo, A, s.id);
    expect(mvt.type).toBe("entree");
    expect(mvt.quantiteAvant).toBe("10.00");
    expect(mvt.quantiteApres).toBe("15.00");
    expect(mvt.quantite).toBe("5.00");
  });

  it("sortie décrémente la quantité", async () => {
    const repo = new FakeStockRepository();
    const s = await seedStock(repo, A, "10.00");
    const maj = await ajusterQuantiteStock(repo, A, s.id, { type: "sortie", quantite: "4" });
    expect(maj.quantiteEnStock).toBe("6.00");
  });

  it("sortie qui rendrait le stock négatif → ValidationError (quantité inchangée)", async () => {
    const repo = new FakeStockRepository();
    const s = await seedStock(repo, A, "3.00");
    await expect(ajusterQuantiteStock(repo, A, s.id, { type: "sortie", quantite: "5" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await repo.getById(A, s.id))!.quantiteEnStock).toBe("3.00");
    /** 1 mouvement initial existe (création), la sortie échouée n'en ajoute pas. */
    expect((await getMouvementsStock(repo, A, s.id)).length).toBe(1);
  });

  it("deux entrées successives cumulent (anti double-comptage / pas d'écrasement)", async () => {
    const repo = new FakeStockRepository();
    const s = await seedStock(repo, A, "0.00");
    await ajusterQuantiteStock(repo, A, s.id, { type: "entree", quantite: "7" });
    const maj = await ajusterQuantiteStock(repo, A, s.id, { type: "entree", quantite: "3" });
    expect(maj.quantiteEnStock).toBe("10.00");
    expect((await getMouvementsStock(repo, A, s.id)).length).toBe(2);
  });

  it("ajustement ajoute (parité legacy)", async () => {
    const repo = new FakeStockRepository();
    const s = await seedStock(repo, A, "8.00");
    const maj = await ajusterQuantiteStock(repo, A, s.id, { type: "ajustement", quantite: "2" });
    expect(maj.quantiteEnStock).toBe("10.00");
  });

  it("ajuster un stock d'un autre tenant → NotFoundError", async () => {
    const repo = new FakeStockRepository();
    const s = await seedStock(repo, A, "10.00");
    await expect(ajusterQuantiteStock(repo, B, s.id, { type: "entree", quantite: "1" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("quantité de mouvement négative → ValidationError", async () => {
    const repo = new FakeStockRepository();
    const s = await seedStock(repo, A, "10.00");
    await expect(ajusterQuantiteStock(repo, A, s.id, { type: "entree", quantite: "-2" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("getMouvementsStock (scopé via le stock parent)", () => {
  it("liste les mouvements récents d'abord, scopé au propriétaire", async () => {
    const repo = new FakeStockRepository();
    const s = await seedStock(repo, A, "0.00");
    await ajusterQuantiteStock(repo, A, s.id, { type: "entree", quantite: "1" });
    await ajusterQuantiteStock(repo, A, s.id, { type: "entree", quantite: "2" });
    const mvts = await getMouvementsStock(repo, A, s.id);
    expect(mvts.map((m) => m.quantite)).toEqual(["2.00", "1.00"]); // récents d'abord
  });

  it("getMouvements d'un stock cross-tenant → NotFoundError (anti-oracle)", async () => {
    const repo = new FakeStockRepository();
    const s = await seedStock(repo, A, "0.00");
    await expect(getMouvementsStock(repo, B, s.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
