import { describe, it, expect, beforeEach } from "vitest";
import { FakeCommandeRepository } from "../infra/commande-repository-fake";
import { changerStatutCommande, listerCommandesEnRetard, recevoirCommande, definirStatutFacturation } from "./statut-use-cases";
import { listLignesCommande } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError, ConflictError } from "../../../shared/errors";
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
    expect((await changerStatutCommande(repo, A, cmdA, "envoyee")).statut).toBe("envoyee");
    await expect(changerStatutCommande(repo, B, cmdA, "annulee")).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => changerStatutCommande(repo, B, cmdA, "annulee"));
  });

  it("changerStatutCommande : transition invalide → ConflictError (guard machine à états)", async () => {
    await changerStatutCommande(repo, A, cmdA, "envoyee");
    await changerStatutCommande(repo, A, cmdA, "annulee");
    await expect(changerStatutCommande(repo, A, cmdA, "envoyee")).rejects.toBeInstanceOf(ConflictError);
  });

  it("changerStatutCommande : livree terminal → ConflictError", async () => {
    await changerStatutCommande(repo, A, cmdA, "envoyee");
    await changerStatutCommande(repo, A, cmdA, "confirmee");
    await changerStatutCommande(repo, A, cmdA, "livree");
    await expect(changerStatutCommande(repo, A, cmdA, "brouillon")).rejects.toBeInstanceOf(ConflictError);
  });

  it("changerStatutCommande : pose la date de livraison réelle si fournie", async () => {
    const d = new Date("2026-06-10");
    await changerStatutCommande(repo, A, cmdA, "envoyee");
    await changerStatutCommande(repo, A, cmdA, "confirmee");
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
    await changerStatutCommande(repo, A, livree, "envoyee");
    await changerStatutCommande(repo, A, livree, "confirmee");
    await changerStatutCommande(repo, A, livree, "livree");
    // commande B en retard → ne compte pas pour A
    await repo.create(B, { fournisseurId: 20, dateLivraisonPrevue: hier, lignes: [ligne] });

    const retards = await listerCommandesEnRetard(repo, A);
    expect(retards.map((c) => c.id)).toEqual([enRetard]);
    expect((await listerCommandesEnRetard(repo, B)).length).toBe(1);
  });

  it("recevoirCommande : réception partielle → partiellement_livree ; totale → livree", async () => {
    const cmd = (await repo.create(A, { fournisseurId: 10, lignes: [{ designation: "Tube", quantite: "10", prixUnitaire: "5" }] }))!;
    await changerStatutCommande(repo, A, cmd.id, "envoyee");
    await changerStatutCommande(repo, A, cmd.id, "confirmee");
    const [l] = await listLignesCommande(repo, A, cmd.id);
    // partielle
    const partiel = await recevoirCommande(repo, A, cmd.id, [{ ligneId: l.id, quantiteRecue: 4 }]);
    expect(partiel.statut).toBe("partiellement_livree");
    expect((await listLignesCommande(repo, A, cmd.id))[0].quantiteRecue).toBe("4.00");
    // totale
    const total = await recevoirCommande(repo, A, cmd.id, [{ ligneId: l.id, quantiteRecue: 10 }]);
    expect(total.statut).toBe("livree");
    expect(total.dateLivraisonReelle).not.toBeNull();
  });

  it("recevoirCommande : quantité reçue > commandée → ValidationError", async () => {
    const [l] = await listLignesCommande(repo, A, cmdA); // ligne quantité 2
    await expect(recevoirCommande(repo, A, cmdA, [{ ligneId: l.id, quantiteRecue: 5 }])).rejects.toBeInstanceOf(ValidationError);
  });

  it("recevoirCommande : commande d'un autre tenant → NotFound (anti-IDOR)", async () => {
    await expect(recevoirCommande(repo, B, cmdA, [])).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => recevoirCommande(repo, B, cmdA, []));
  });

  it("definirStatutFacturation : facturee + lien dépense owned ; a_facturer délie ; depense hors tenant non liée", async () => {
    repo.seedDepense(500, 1); // dépense de A
    repo.seedDepense(600, 2); // dépense de B
    // facturée avec dépense de A → liée
    const f1 = await definirStatutFacturation(repo, A, cmdA, "facturee", 500);
    expect(f1.statutFacturation).toBe("facturee");
    expect(f1.depenseId).toBe(500);
    // facturée avec dépense de B → non liée (anti-IDOR-FK)
    const f2 = await definirStatutFacturation(repo, A, cmdA, "facturee", 600);
    expect(f2.depenseId).toBeNull();
    // a_facturer → délie
    const f3 = await definirStatutFacturation(repo, A, cmdA, "a_facturer");
    expect(f3.statutFacturation).toBe("a_facturer");
    expect(f3.depenseId).toBeNull();
  });

  it("definirStatutFacturation : commande d'un autre tenant → NotFound", async () => {
    await expect(definirStatutFacturation(repo, B, cmdA, "facturee")).rejects.toBeInstanceOf(NotFoundError);
  });
});
