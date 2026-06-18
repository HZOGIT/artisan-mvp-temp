import { describe, it, expect } from "vitest";
import { FakeChantierRepository } from "../infra/chantier-repository-fake";
import { computeStatistiques, getStatistiquesChantier, calculerAvancementChantier } from "./stats-use-cases";
import { creerChantier } from "./write-use-cases";
import { NotFoundError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";
import type { Chantier } from "../domain/chantier";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const CLIENT_A = 500;
const INTERV_A = 700;

async function repoAvecChantier(over?: { budgetPrevisionnel?: string; budgetRealise?: string }) {
  const repo = new FakeChantierRepository();
  repo.registerClient(1, CLIENT_A);
  repo.registerIntervention(1, INTERV_A);
  const ch = await creerChantier(repo, A, {
    clientId: CLIENT_A,
    reference: "CH-1",
    nom: "Chantier",
    budgetPrevisionnel: over?.budgetPrevisionnel,
    budgetRealise: over?.budgetRealise,
  });
  return { repo, chantierId: ch.id };
}

const baseChantier: Chantier = {
  id: 1,
  artisanId: 1,
  clientId: 1,
  reference: "CH",
  nom: "C",
  description: null,
  adresse: null,
  codePostal: null,
  ville: null,
  dateDebut: null,
  dateFinPrevue: null,
  dateFinReelle: null,
  budgetPrevisionnel: "10000.00",
  budgetRealise: "0.00",
  statut: "en_cours",
  avancement: 42,
  priorite: "normale",
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("chantiers — stats (pur)", () => {
  it("computeStatistiques : coutReel (dépenses) prime sur budgetRealise manuel + marge/pct", () => {
    const s = computeStatistiques(
      { ...baseChantier, budgetPrevisionnel: "10000.00", budgetRealise: "3000.00" },
      [
        { ...phase(1, "termine") },
        { ...phase(2, "en_cours") },
      ],
      2,
      1,
      "4000.00", // coutReel dépenses > 0 → prime
    );
    expect(s.nombrePhases).toBe(2);
    expect(s.phasesTerminees).toBe(1);
    expect(s.nombreInterventions).toBe(2);
    expect(s.nombreDocuments).toBe(1);
    expect(s.coutReel).toBe(4000);
    expect(s.budgetConsomme).toBe(4000); // coutReel prime sur budgetRealise (3000)
    expect(s.budgetTotal).toBe(10000);
    expect(s.marge).toBe(6000);
    expect(s.margePct).toBe(60);
    expect(s.pourcentageBudget).toBe(40);
    expect(s.avancement).toBe(42);
  });

  it("computeStatistiques : repli sur budgetRealise si aucune dépense ; marge null sans budget", () => {
    const s = computeStatistiques({ ...baseChantier, budgetPrevisionnel: null, budgetRealise: "2500.00" }, [], 0, 0, "0");
    expect(s.coutReel).toBe(0);
    expect(s.budgetConsomme).toBe(2500); // repli budgetRealise manuel
    expect(s.budgetTotal).toBe(0);
    expect(s.marge).toBeNull();
    expect(s.margePct).toBeNull();
    expect(s.pourcentageBudget).toBe(0);
  });
});

describe("chantiers — stats use-cases", () => {
  it("getStatistiquesChantier : agrège phases/interventions/documents/dépenses ; 404 hors tenant", async () => {
    const { repo, chantierId } = await repoAvecChantier({ budgetPrevisionnel: "10000.00" });
    repo.registerDepensesChantier(1, chantierId, "2500.00");
    const stats = await getStatistiquesChantier(repo, A, chantierId);
    expect(stats.coutReel).toBe(2500);
    expect(stats.budgetConsomme).toBe(2500);
    expect(stats.budgetTotal).toBe(10000);
    expect(stats.pourcentageBudget).toBe(25);
    // isolation : B ne voit pas le chantier de A
    await expectCrossTenantDenied(() => getStatistiquesChantier(repo, B, chantierId));
    await expect(getStatistiquesChantier(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("calculerAvancementChantier : moyenne des phases, persistée ; 0 si aucune phase ; 404 hors tenant", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    // aucune phase → 0 (sans écriture)
    expect(await calculerAvancementChantier(repo, A, chantierId)).toEqual({ avancement: 0 });
    await repo.addPhase(A, { chantierId, nom: "P1" });
    await repo.updatePhase(A, 1, { avancement: 80 });
    await repo.addPhase(A, { chantierId, nom: "P2" });
    await repo.updatePhase(A, 2, { avancement: 40 });
    const res = await calculerAvancementChantier(repo, A, chantierId);
    expect(res).toEqual({ avancement: 60 }); // (80+40)/2
    // persisté : getById reflète le nouvel avancement
    expect((await repo.getById(A, chantierId))?.avancement).toBe(60);
    // isolation
    await expect(calculerAvancementChantier(repo, B, chantierId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

function phase(id: number, statut: "a_faire" | "en_cours" | "termine" | "annule") {
  return {
    id,
    chantierId: 1,
    nom: `P${id}`,
    description: null,
    ordre: id,
    dateDebutPrevue: null,
    dateFinPrevue: null,
    dateDebutReelle: null,
    dateFinReelle: null,
    statut,
    avancement: 0,
    budgetPhase: null,
    coutReel: null,
    heuresPrevues: null,
    createdAt: new Date(),
  };
}
