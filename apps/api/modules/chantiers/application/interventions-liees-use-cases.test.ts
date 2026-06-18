import { describe, it, expect } from "vitest";
import { FakeChantierRepository } from "../infra/chantier-repository-fake";
import {
  getInterventionsLiees,
  getAllInterventionsLiees,
  associerInterventionChantier,
  dissocierInterventionChantier,
} from "./interventions-liees-use-cases";
import { creerChantier } from "./write-use-cases";
import { NotFoundError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const CLIENT_A = 500;
const INTERV_A = 700;

async function repoAvecChantier(): Promise<{ repo: FakeChantierRepository; chantierId: number }> {
  const repo = new FakeChantierRepository();
  repo.registerClient(1, CLIENT_A);
  repo.registerIntervention(1, INTERV_A);
  const ch = await creerChantier(repo, A, { clientId: CLIENT_A, reference: "CH-1", nom: "Chantier" });
  return { repo, chantierId: ch.id };
}

describe("chantiers — interventions liées use-cases", () => {
  it("associer + getInterventions : scopés via le chantier parent ; anti-IDOR DOUBLE", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const lien = await associerInterventionChantier(repo, A, { chantierId, interventionId: INTERV_A, ordre: 1 });
    expect(lien.chantierId).toBe(chantierId);
    expect(lien.interventionId).toBe(INTERV_A);
    expect(await getInterventionsLiees(repo, A, chantierId)).toHaveLength(1);
    // intervention d'un autre tenant → 404 (anti-IDOR FK)
    await expect(associerInterventionChantier(repo, A, { chantierId, interventionId: 99999 })).rejects.toBeInstanceOf(NotFoundError);
    // chantier inexistant / d'un autre tenant → 404
    await expect(associerInterventionChantier(repo, B, { chantierId, interventionId: INTERV_A })).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => getInterventionsLiees(repo, B, chantierId));
  });

  it("associer : idempotent sur (chantier, intervention)", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const l1 = await associerInterventionChantier(repo, A, { chantierId, interventionId: INTERV_A });
    const l2 = await associerInterventionChantier(repo, A, { chantierId, interventionId: INTERV_A });
    expect(l2.id).toBe(l1.id);
    expect(await getInterventionsLiees(repo, A, chantierId)).toHaveLength(1);
  });

  it("getAllInterventionsChantier : tous les liens des chantiers du tenant, scopé", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    await associerInterventionChantier(repo, A, { chantierId, interventionId: INTERV_A });
    expect(await getAllInterventionsLiees(repo, A)).toHaveLength(1);
    // B ne voit aucun lien des chantiers de A
    expect(await getAllInterventionsLiees(repo, B)).toHaveLength(0);
  });

  it("dissocier : scopé via le chantier parent ; idempotent ; cross-tenant → 404", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    await associerInterventionChantier(repo, A, { chantierId, interventionId: INTERV_A });
    // B ne peut pas dissocier sur le chantier de A (404)
    await expect(dissocierInterventionChantier(repo, B, chantierId, INTERV_A)).rejects.toBeInstanceOf(NotFoundError);
    await dissocierInterventionChantier(repo, A, chantierId, INTERV_A);
    expect(await getInterventionsLiees(repo, A, chantierId)).toHaveLength(0);
    // idempotent : re-dissocier ne lève pas (chantier toujours possédé)
    await dissocierInterventionChantier(repo, A, chantierId, INTERV_A);
  });
});
