import { describe, it, expect, beforeEach } from "vitest";
import { FakeVehiculeRepository } from "../infra/vehicule-repository-fake";
import {
  createVehicule,
  updateVehicule,
  deleteVehicule,
  enregistrerKilometrage,
  ajouterEntretien,
  ajouterAssurance,
} from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("vehicules — use-cases écriture (repo mocké)", () => {
  let repo: FakeVehiculeRepository;
  beforeEach(() => {
    repo = new FakeVehiculeRepository();
  });

  it("createVehicule : scopé au tenant + immatriculation requise", async () => {
    const v = await createVehicule(repo, A, { immatriculation: "AA-1", marque: "Renault" });
    expect(v.artisanId).toBe(A.artisanId);
    await expect(createVehicule(repo, A, { immatriculation: "   " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("update/delete cross-tenant → NotFoundError (ressource de A inchangée)", async () => {
    const v = await createVehicule(repo, A, { immatriculation: "AA-2", marque: "Renault" });
    await expectCrossTenantDenied(() => updateVehicule(repo, B, v.id, { marque: "hack" }));
    await expectCrossTenantDenied(() => deleteVehicule(repo, B, v.id));
    expect((await repo.getById(A, v.id))?.marque).toBe("Renault");
  });

  it("enregistrerKilometrage : non régressif + validation + NotFound cross-tenant", async () => {
    const v = await createVehicule(repo, A, { immatriculation: "AA-3", kilometrageActuel: 5000 });
    expect((await enregistrerKilometrage(repo, A, v.id, 8000)).kilometrageActuel).toBe(8000);
    expect((await enregistrerKilometrage(repo, A, v.id, 6000)).kilometrageActuel).toBe(8000);
    await expect(enregistrerKilometrage(repo, A, v.id, -1)).rejects.toBeInstanceOf(ValidationError);
    await expect(enregistrerKilometrage(repo, B, v.id, 9000)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ajouterEntretien / ajouterAssurance : OK pour le tenant, NotFound hors tenant", async () => {
    const v = await createVehicule(repo, A, { immatriculation: "AA-4" });
    expect((await ajouterEntretien(repo, A, v.id, { type: "vidange", dateEntretien: "2026-06-01" })).type).toBe("vidange");
    expect((await ajouterAssurance(repo, A, v.id, { compagnie: "Maif", dateDebut: "2026-01-01", dateFin: "2026-12-31" })).compagnie).toBe("Maif");
    await expect(ajouterEntretien(repo, B, v.id, { type: "pneus", dateEntretien: "2026-06-02" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(ajouterAssurance(repo, B, v.id, { compagnie: "X", dateDebut: "2026-01-01", dateFin: "2026-12-31" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deleteVehicule supprime le véhicule du tenant", async () => {
    const v = await createVehicule(repo, A, { immatriculation: "AA-5" });
    await deleteVehicule(repo, A, v.id);
    expect(await repo.getById(A, v.id)).toBeNull();
    await expect(deleteVehicule(repo, A, v.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
