import { describe, it, expect, beforeEach } from "vitest";
import { FakeCommandeRepository } from "../infra/commande-repository-fake";
import { changerStatutCommande, listerCommandesEnRetard } from "./statut-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const ligne = { designation: "Tube", quantite: "2", prixUnitaire: "5" };
const hier = new Date(Date.now() - 86400000);
const demain = new Date(Date.now() + 86400000);

describe("commandes — use-cases dérivés statut/retard (repo mocké)", () => {
  let repo: FakeCommandeRepository;
  let cmdA: number;

  beforeEach(async () => {
    repo = new FakeCommandeRepository();
    repo.seedFournisseur(10, 1);
    repo.seedFournisseur(20, 2);
    cmdA = (await repo.create(A, { fournisseurId: 10, lignes: [ligne] }))!.id;
  });

  it("changerStatutCommande : OK / cross-tenant → NotFound", async () => {
    expect((await changerStatutCommande(repo, A, cmdA, "confirmee")).statut).toBe("confirmee");
    await expect(changerStatutCommande(repo, B, cmdA, "annulee")).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => changerStatutCommande(repo, B, cmdA, "annulee"));
  });

  it("changerStatutCommande : pose la date de livraison réelle si fournie", async () => {
    const d = new Date("2026-06-10");
    const c = await changerStatutCommande(repo, A, cmdA, "livree", d);
    expect(c.statut).toBe("livree");
    expect(c.dateLivraisonReelle?.toISOString()).toBe(d.toISOString());
  });

  it("listerCommandesEnRetard : échéance dépassée + non livrée/annulée, scopé tenant", async () => {
    // commande A en retard (échéance hier, statut brouillon)
    const enRetard = (await repo.create(A, { fournisseurId: 10, dateLivraisonPrevue: hier, lignes: [ligne] }))!.id;
    // commande A future (pas en retard)
    await repo.create(A, { fournisseurId: 10, dateLivraisonPrevue: demain, lignes: [ligne] });
    // commande A en retard mais livrée → exclue
    const livree = (await repo.create(A, { fournisseurId: 10, dateLivraisonPrevue: hier, lignes: [ligne] }))!.id;
    await changerStatutCommande(repo, A, livree, "livree");
    // commande B en retard → ne compte pas pour A
    await repo.create(B, { fournisseurId: 20, dateLivraisonPrevue: hier, lignes: [ligne] });

    const retards = await listerCommandesEnRetard(repo, A);
    expect(retards.map((c) => c.id)).toEqual([enRetard]);
    expect((await listerCommandesEnRetard(repo, B)).length).toBe(1);
  });
});
