import { describe, it, expect, beforeEach } from "vitest";
import { FakeCommandeRepository } from "../infra/commande-repository-fake";
import { creerCommande, modifierCommande, supprimerCommande } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const ligne = { designation: "Tube", quantite: "2", prixUnitaire: "5" };

describe("commandes — use-cases écriture (repo mocké)", () => {
  let repo: FakeCommandeRepository;
  let cmdA: number;

  beforeEach(async () => {
    repo = new FakeCommandeRepository();
    repo.seedFournisseur(10, 1); // fournisseur de A
    repo.seedFournisseur(20, 2); // fournisseur de B
    cmdA = (await creerCommande(repo, A, { fournisseurId: 10, lignes: [ligne] })).id;
  });

  it("creerCommande crée la commande (totaux serveur)", async () => {
    const c = await creerCommande(repo, A, { fournisseurId: 10, lignes: [{ designation: "X", quantite: "3", prixUnitaire: "10" }] });
    expect(c.totalHT).toBe("30.00");
    expect(c.statut).toBe("brouillon");
  });

  it("creerCommande : sans ligne / quantité ≤ 0 / désignation vide → ValidationError", async () => {
    await expect(creerCommande(repo, A, { fournisseurId: 10, lignes: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerCommande(repo, A, { fournisseurId: 10, lignes: [{ designation: "X", quantite: "0", prixUnitaire: "1" }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerCommande(repo, A, { fournisseurId: 10, lignes: [{ designation: "  ", quantite: "1", prixUnitaire: "1" }] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerCommande : fournisseur d'un autre tenant → NotFound (anti-IDOR-FK)", async () => {
    await expect(creerCommande(repo, A, { fournisseurId: 20, lignes: [ligne] })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierCommande OK (métadonnées) / cross-tenant → NotFound", async () => {
    expect((await modifierCommande(repo, A, cmdA, { notes: "urgent" })).notes).toBe("urgent");
    await expect(modifierCommande(repo, B, cmdA, { notes: "hack" })).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => modifierCommande(repo, B, cmdA, { notes: "hack" }));
  });

  it("modifierCommande ne touche pas les totaux", async () => {
    const before = await modifierCommande(repo, A, cmdA, {});
    const after = await modifierCommande(repo, A, cmdA, { reference: "REF-9" });
    expect(after.totalHT).toBe(before.totalHT);
    expect(after.totalTTC).toBe(before.totalTTC);
  });

  it("supprimerCommande OK / cross-tenant → NotFound / déjà supprimée → NotFound", async () => {
    await expect(supprimerCommande(repo, B, cmdA)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerCommande(repo, A, cmdA);
    await expect(supprimerCommande(repo, A, cmdA)).rejects.toBeInstanceOf(NotFoundError);
  });
});
