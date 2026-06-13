import { describe, it, expect, beforeEach } from "vitest";
import { FakeCommandeRepository } from "../infra/commande-repository-fake";
import { listCommandes, getCommande, listLignesCommande } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("commandes — use-cases lecture (repo mocké)", () => {
  let repo: FakeCommandeRepository;
  let cmdA: number;

  beforeEach(async () => {
    repo = new FakeCommandeRepository();
    repo.seedFournisseur(10, 1); // fournisseur de A
    repo.seedFournisseur(20, 2); // fournisseur de B
    cmdA = (await repo.create(A, { fournisseurId: 10, lignes: [{ designation: "Tube", quantite: "2", prixUnitaire: "5" }] }))!.id;
    await repo.create(B, { fournisseurId: 20, lignes: [] });
  });

  it("listCommandes ne renvoie que les commandes du tenant", async () => {
    expect((await listCommandes(repo, A)).map((c) => c.id)).toEqual([cmdA]);
    expect((await listCommandes(repo, B)).length).toBe(1);
    expect((await listCommandes(repo, B)).some((c) => c.id === cmdA)).toBe(false);
  });

  it("getCommande renvoie la commande du tenant (totaux serveur)", async () => {
    const c = await getCommande(repo, A, cmdA);
    expect(c.totalHT).toBe("10.00"); // 2 × 5
    expect(c.totalTTC).toBe("12.00"); // + 20% TVA
  });

  it("getCommande sur une ressource d'un autre tenant → NotFoundError", async () => {
    await expect(getCommande(repo, B, cmdA)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => getCommande(repo, B, cmdA));
  });

  it("getCommande sur un id inexistant → NotFoundError", async () => {
    await expect(getCommande(repo, A, 99999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listLignesCommande : scopé ; commande d'un autre tenant → [] (sans oracle)", async () => {
    expect((await listLignesCommande(repo, A, cmdA)).length).toBe(1);
    expect(await listLignesCommande(repo, B, cmdA)).toEqual([]);
  });
});
