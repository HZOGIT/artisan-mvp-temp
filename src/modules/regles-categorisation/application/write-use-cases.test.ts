import { describe, it, expect } from "vitest";
import { FakeRegleCategorisationRepository } from "../infra/regle-categorisation-repository-fake";
import { creerRegle, modifierRegle, supprimerRegle } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);

describe("regles-categorisation — write use-cases", () => {
  it("creerRegle valide : artisanId scopé + actif true par défaut", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    expect(r.artisanId).toBe(1);
    expect(r.actif).toBe(true);
  });

  it("validation : motifLibelle vide / categorie vide → ValidationError", async () => {
    const repo = new FakeRegleCategorisationRepository();
    await expect(creerRegle(repo, A, { motifLibelle: " ", categorie: "carburant" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: " " })).rejects.toBeInstanceOf(ValidationError);
    const ok = await creerRegle(repo, A, { motifLibelle: "EDF", categorie: "energie", actif: false });
    expect(ok.actif).toBe(false);
  });

  it("modifierRegle : NotFound si inexistant ; motif/categorie vide → ValidationError ; partiel préserve", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    await expect(modifierRegle(repo, A, 999999, { actif: false })).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierRegle(repo, A, r.id, { categorie: "  " })).rejects.toBeInstanceOf(ValidationError);
    const maj = await modifierRegle(repo, A, r.id, { actif: false });
    expect(maj.actif).toBe(false);
    expect(maj.motifLibelle).toBe("ESSENCE"); // préservé
  });

  it("supprimerRegle : NotFound si inexistant", async () => {
    const repo = new FakeRegleCategorisationRepository();
    const r = await creerRegle(repo, A, { motifLibelle: "ESSENCE", categorie: "carburant" });
    await supprimerRegle(repo, A, r.id);
    await expect(supprimerRegle(repo, A, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
