import { describe, it, expect, beforeEach } from "vitest";
import { FakeTechnicienRepository } from "../infra/technicien-repository-fake";
import { creerTechnicien, modifierTechnicien, supprimerTechnicien } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("techniciens — use-cases écriture (repo mocké)", () => {
  let repo: FakeTechnicienRepository;
  let techA: number;

  beforeEach(async () => {
    repo = new FakeTechnicienRepository();
    techA = (await creerTechnicien(repo, A, { nom: "Martin" })).id;
  });

  it("creerTechnicien crée le technicien du tenant", async () => {
    const t = await creerTechnicien(repo, A, { nom: "Durand", specialite: "Élec" });
    expect(t.artisanId).toBe(1);
    expect(t.specialite).toBe("Élec");
  });

  it("creerTechnicien avec nom vide → ValidationError", async () => {
    await expect(creerTechnicien(repo, A, { nom: "  " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("modifierTechnicien OK / nom vidé → Validation / cross-tenant → NotFound", async () => {
    expect((await modifierTechnicien(repo, A, techA, { statut: "conge" })).statut).toBe("conge");
    await expect(modifierTechnicien(repo, A, techA, { nom: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(modifierTechnicien(repo, B, techA, { nom: "hack" })).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => modifierTechnicien(repo, B, techA, { nom: "hack" }));
  });

  it("supprimerTechnicien OK / cross-tenant → NotFound / déjà supprimé → NotFound", async () => {
    await expect(supprimerTechnicien(repo, B, techA)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerTechnicien(repo, A, techA);
    await expect(supprimerTechnicien(repo, A, techA)).rejects.toBeInstanceOf(NotFoundError);
  });
});
