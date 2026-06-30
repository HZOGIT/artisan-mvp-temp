import { describe, it, expect } from "vitest";
import { FakeStockRepository } from "./infra/stock-repository-fake";
import { creerStock, modifierStock, ajusterQuantiteStock } from "./application/write-use-cases";
import { getStock, getMouvementsStock } from "./application/read-use-cases";
import { ValidationError, NotFoundError } from "../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine stocks (domaine sensible : inventaire).
// Verrouille en un seul endroit, indépendamment du transport et de l'infra, les garanties
// que toutes les couches doivent préserver. Sert de spec exécutable + documentation.
const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("stocks — invariants métier (synthèse)", () => {
  it("INV-1 : la quantité ne change QUE via un mouvement tracé (create init ; update n'y touche pas)", async () => {
    const repo = new FakeStockRepository();
    const s = await creerStock(repo, A, { reference: "R", designation: "D", quantiteEnStock: "10" });
    /** creerStock avec qty > 0 trace un mouvement initial de type 'entree'. */
    expect((await getMouvementsStock(repo, A, s.id)).length).toBe(1);
    /** `UpdateStockInput` n'expose pas `quantiteEnStock` → la quantité reste intacte. */
    await modifierStock(repo, A, s.id, { designation: "Renommé", emplacement: "Allée 9" });
    expect((await getStock(repo, A, s.id)).quantiteEnStock).toBe("10.00");
    /** Seul `adjustQuantity` la modifie, en traçant un mouvement supplémentaire. */
    await ajusterQuantiteStock(repo, A, s.id, { type: "entree", quantite: "5" });
    expect((await getStock(repo, A, s.id)).quantiteEnStock).toBe("15.00");
    expect((await getMouvementsStock(repo, A, s.id)).length).toBe(2);
  });

  it("INV-2 : tout mouvement laisse une trace avant/après cohérente", async () => {
    const repo = new FakeStockRepository();
    const s = await creerStock(repo, A, { reference: "R", designation: "D", quantiteEnStock: "20" });
    await ajusterQuantiteStock(repo, A, s.id, { type: "sortie", quantite: "8" });
    const [mvt] = await getMouvementsStock(repo, A, s.id);
    expect(mvt.type).toBe("sortie");
    expect(mvt.quantiteAvant).toBe("20.00");
    expect(mvt.quantiteApres).toBe("12.00");
    expect(mvt.quantite).toBe("8.00");
  });

  it("INV-3 : la quantité physique ne peut jamais devenir négative (sortie refusée, aucun mouvement supplémentaire)", async () => {
    const repo = new FakeStockRepository();
    const s = await creerStock(repo, A, { reference: "R", designation: "D", quantiteEnStock: "3" });
    const mvtAvant = (await getMouvementsStock(repo, A, s.id)).length; /** 1 mouvement initial */
    await expect(ajusterQuantiteStock(repo, A, s.id, { type: "sortie", quantite: "5" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await getStock(repo, A, s.id)).quantiteEnStock).toBe("3.00"); /** inchangée */
    expect((await getMouvementsStock(repo, A, s.id)).length).toBe(mvtAvant); /** rien tracé de plus */
  });

  it("INV-4 : isolation cross-tenant sur toutes les voies d'écriture et de lecture", async () => {
    const repo = new FakeStockRepository();
    const s = await creerStock(repo, A, { reference: "R", designation: "D", quantiteEnStock: "10" });
    await expect(getStock(repo, B, s.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierStock(repo, B, s.id, { designation: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(ajusterQuantiteStock(repo, B, s.id, { type: "entree", quantite: "1" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getMouvementsStock(repo, B, s.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
