import { describe, it, expect, beforeEach } from "vitest";
import { FakeFournisseurRepository } from "../infra/fournisseur-repository-fake";
import { creerFournisseur, modifierFournisseur, supprimerFournisseur } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("fournisseurs — use-cases écriture (repo mocké)", () => {
  let repo: FakeFournisseurRepository;
  let fA: number;

  beforeEach(async () => {
    repo = new FakeFournisseurRepository();
    fA = (await creerFournisseur(repo, A, { nom: "Point P" })).id;
  });

  it("creerFournisseur crée le fournisseur du tenant", async () => {
    const f = await creerFournisseur(repo, A, { nom: "Brico", ville: "Lyon" });
    expect(f.artisanId).toBe(1);
    expect(f.ville).toBe("Lyon");
  });

  it("creerFournisseur avec nom vide → ValidationError", async () => {
    await expect(creerFournisseur(repo, A, { nom: "  " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("modifierFournisseur OK / nom vidé → Validation / cross-tenant → NotFound", async () => {
    expect((await modifierFournisseur(repo, A, fA, { ville: "Paris" })).ville).toBe("Paris");
    await expect(modifierFournisseur(repo, A, fA, { nom: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(modifierFournisseur(repo, B, fA, { nom: "hack" })).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => modifierFournisseur(repo, B, fA, { nom: "hack" }));
  });

  it("supprimerFournisseur OK / cross-tenant → NotFound / déjà supprimé → NotFound", async () => {
    await expect(supprimerFournisseur(repo, B, fA)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerFournisseur(repo, A, fA);
    await expect(supprimerFournisseur(repo, A, fA)).rejects.toBeInstanceOf(NotFoundError);
  });
});
