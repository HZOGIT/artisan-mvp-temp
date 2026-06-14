import { describe, it, expect } from "vitest";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import {
  listContratsAFacturer,
  getInterventionsContrat,
  creerInterventionContrat,
  modifierInterventionContrat,
} from "./interventions-use-cases";
import { NotFoundError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({
  clientId: 100,
  titre: "Entretien",
  montantHT: "300.00",
  periodicite: "annuel" as const,
  dateDebut: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("contrats — interventions & à-facturer use-cases", () => {
  it("getInterventionsContrat : liste si contrat possédé, NotFound sinon", async () => {
    const repo = new FakeContratRepository();
    const c = await repo.create(A, base(), "CTR-00001");
    await creerInterventionContrat(repo, A, { contratId: c.id, titre: "Visite 1", dateIntervention: new Date("2026-02-01") });
    expect(await getInterventionsContrat(repo, A, c.id)).toHaveLength(1);
    await expectCrossTenantDenied(() => getInterventionsContrat(repo, B, c.id));
    await expect(getInterventionsContrat(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creerInterventionContrat : statut 'planifiee' forcé + artisanId du tenant ; 404 si contrat hors tenant", async () => {
    const repo = new FakeContratRepository();
    const c = await repo.create(A, base(), "CTR-00001");
    const i = await creerInterventionContrat(repo, A, { contratId: c.id, titre: "Visite", dateIntervention: new Date("2026-02-01") });
    expect(i.statut).toBe("planifiee");
    expect(i.artisanId).toBe(A.artisanId);
    await expect(
      creerInterventionContrat(repo, B, { contratId: c.id, titre: "X", dateIntervention: new Date("2026-02-01") }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierInterventionContrat : anti-IDOR id↔contrat (intervention d'un autre contrat → 404)", async () => {
    const repo = new FakeContratRepository();
    const c1 = await repo.create(A, base(), "CTR-00001");
    const c2 = await repo.create(A, base({ titre: "Autre" }), "CTR-00002");
    const i = await creerInterventionContrat(repo, A, { contratId: c1.id, titre: "Visite", dateIntervention: new Date("2026-02-01") });
    // bon contrat → OK
    const updated = await modifierInterventionContrat(repo, A, i.id, c1.id, { statut: "effectuee", rapport: "RAS" });
    expect(updated.statut).toBe("effectuee");
    expect(updated.rapport).toBe("RAS");
    // id d'intervention de c1 mais déclaré sous c2 → 404 (découplage refusé)
    await expect(modifierInterventionContrat(repo, A, i.id, c2.id, { statut: "annulee" })).rejects.toBeInstanceOf(NotFoundError);
    // intervention vue depuis un autre tenant → 404
    await expect(modifierInterventionContrat(repo, B, i.id, c1.id, { statut: "annulee" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listContratsAFacturer : seulement actifs échus, TTC dérivé + jours de retard + nom client", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(A.artisanId, 100, "Dupont");
    // échu (hier) : doit apparaître
    const echu = await repo.create(
      A,
      base({ clientId: 100, montantHT: "100.00", tauxTVA: "20.00", prochainFacturation: new Date("2026-06-13T00:00:00Z") }),
      "CTR-00001",
    );
    // futur : ne doit PAS apparaître
    await repo.create(A, base({ clientId: 100, prochainFacturation: new Date("2030-01-01") }), "CTR-00002");
    // suspendu échu : ne doit PAS apparaître
    const susp = await repo.create(A, base({ clientId: 100, prochainFacturation: new Date("2026-06-13") }), "CTR-00003");
    await repo.setStatut(A, susp.id, "suspendu");

    const out = await listContratsAFacturer(repo, A, () => new Date("2026-06-14T12:00:00Z"));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(echu.id);
    expect(out[0].montantTTC).toBe("120.00"); // 100 × 1.20
    expect(out[0].clientNom).toBe("Dupont");
    expect(out[0].joursRetard).toBe(1);
    // isolation : B ne voit rien
    expect(await listContratsAFacturer(repo, B)).toEqual([]);
  });
});
