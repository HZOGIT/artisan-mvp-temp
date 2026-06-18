import { describe, it, expect, beforeEach } from "vitest";
import { FakeStockRepository } from "../infra/stock-repository-fake";
import { creerStock, modifierStock, supprimerStock } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("stocks — use-cases écriture (repo mocké)", () => {
  let repo: FakeStockRepository;
  let stockA: number;

  beforeEach(async () => {
    repo = new FakeStockRepository();
    stockA = (await creerStock(repo, A, { reference: "R1", designation: "Tube", quantiteEnStock: "50.00" })).id;
  });

  it("creerStock crée le stock du tenant", async () => {
    const s = await creerStock(repo, A, { reference: "R2", designation: "Coude", quantiteEnStock: "20.00" });
    expect(s.artisanId).toBe(1);
    expect(s.quantiteEnStock).toBe("20.00");
  });

  it("creerStock : reference/designation vide ou quantité négative → ValidationError", async () => {
    await expect(creerStock(repo, A, { reference: "", designation: "X" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerStock(repo, A, { reference: "X", designation: "  " })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerStock(repo, A, { reference: "X", designation: "Y", quantiteEnStock: "-1" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("modifierStock OK (métadonnées) / cross-tenant → NotFound", async () => {
    expect((await modifierStock(repo, A, stockA, { emplacement: "Allée 1" })).emplacement).toBe("Allée 1");
    await expect(modifierStock(repo, B, stockA, { designation: "hack" })).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => modifierStock(repo, B, stockA, { designation: "hack" }));
  });

  it("modifierStock ne modifie pas la quantité (invariant audit)", async () => {
    const maj = await modifierStock(repo, A, stockA, { designation: "Renommé", seuilAlerte: "3.00" });
    expect(maj.designation).toBe("Renommé");
    expect(maj.quantiteEnStock).toBe("50.00"); // inchangée
  });

  it("supprimerStock OK / cross-tenant → NotFound / déjà supprimé → NotFound", async () => {
    await expect(supprimerStock(repo, B, stockA)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerStock(repo, A, stockA);
    await expect(supprimerStock(repo, A, stockA)).rejects.toBeInstanceOf(NotFoundError);
  });
});
