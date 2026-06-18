import { describe, it, expect } from "vitest";
import { FakePrevisionCARepository } from "../infra/prevision-ca-repository-fake";
import { creerPrevision, modifierPrevision, supprimerPrevision } from "./write-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);

describe("previsions-ca — write use-cases", () => {
  it("creerPrevision valide : artisanId scopé + défauts", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await creerPrevision(repo, A, { mois: 3, annee: 2026 });
    expect(p.artisanId).toBe(1);
    expect(p.caPrevisionnel).toBe("0.00");
    expect(p.confiance).toBeNull();
  });

  it("validation : mois hors 1-12 / annee hors bornes / montant négatif / confiance > 100 → ValidationError", async () => {
    const repo = new FakePrevisionCARepository();
    await expect(creerPrevision(repo, A, { mois: 0, annee: 2026 })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerPrevision(repo, A, { mois: 13, annee: 2026 })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerPrevision(repo, A, { mois: 3, annee: 1999 })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerPrevision(repo, A, { mois: 3, annee: 2026, caPrevisionnel: "-5.00" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerPrevision(repo, A, { mois: 3, annee: 2026, confiance: "150.00" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("ecart signé accepté ; cas valide complet", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await creerPrevision(repo, A, { mois: 4, annee: 2026, caPrevisionnel: "1000.00", caRealise: "800.00", ecart: "-200.00", ecartPourcentage: "-20.00", confiance: "75.00" });
    expect(p.ecart).toBe("-200.00");
    expect(p.confiance).toBe("75.00");
  });

  it("modifierPrevision : NotFound si inexistant ; montant invalide → ValidationError ; partiel préserve", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await creerPrevision(repo, A, { mois: 5, annee: 2026, caPrevisionnel: "500.00" });
    await expect(modifierPrevision(repo, A, 999999, { caRealise: "10.00" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierPrevision(repo, A, p.id, { caRealise: "abc" })).rejects.toBeInstanceOf(ValidationError);
    const maj = await modifierPrevision(repo, A, p.id, { caRealise: "450.00" });
    expect(maj.caRealise).toBe("450.00");
    expect(maj.caPrevisionnel).toBe("500.00"); // préservé
    expect(maj.mois).toBe(5); // immuable
  });

  it("supprimerPrevision : NotFound si inexistant", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await creerPrevision(repo, A, { mois: 6, annee: 2026 });
    await supprimerPrevision(repo, A, p.id);
    await expect(supprimerPrevision(repo, A, p.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
