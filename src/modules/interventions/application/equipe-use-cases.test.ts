import { describe, it, expect } from "vitest";
import { FakeInterventionRepository } from "../infra/intervention-repository-fake";
import {
  getEquipeIntervention,
  getEquipesArtisan,
  ajouterMembreEquipe,
  retirerMembreEquipe,
} from "./equipe-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ForbiddenError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const baseInput = (titre: string) => ({ clientId: 100, titre, dateDebut: new Date("2026-06-10T08:00:00Z") });

describe("interventions — équipe (sous-ressource) use-cases", () => {
  it("ajouterMembreEquipe : intervention possédée + technicien du tenant ; enrichi nom ; idempotent", async () => {
    const repo = new FakeInterventionRepository();
    repo.registerRef(A.artisanId, "technicien", 7);
    repo.setTechnicienNom(7, "Martin", "Léa");
    const i = await repo.create(A, baseInput("Pose"));

    const m = await ajouterMembreEquipe(repo, A, { interventionId: i.id, technicienId: 7, role: "aide" });
    expect(m.technicienId).toBe(7);
    expect(m.role).toBe("aide");
    expect(m.nom).toBe("Martin");
    expect(m.prenom).toBe("Léa");
    // idempotent : même (intervention, technicien) → même liaison, pas de doublon
    const again = await ajouterMembreEquipe(repo, A, { interventionId: i.id, technicienId: 7 });
    expect(again.id).toBe(m.id);
    expect(await getEquipeIntervention(repo, A, i.id)).toHaveLength(1);
  });

  it("ajouterMembreEquipe : 404 intervention hors tenant ; 403 technicien non possédé", async () => {
    const repo = new FakeInterventionRepository();
    const i = await repo.create(A, baseInput("Pose"));
    // technicien non enregistré au tenant → Forbidden
    await expect(ajouterMembreEquipe(repo, A, { interventionId: i.id, technicienId: 999 })).rejects.toBeInstanceOf(ForbiddenError);
    // intervention vue depuis un autre tenant → NotFound
    repo.registerRef(B.artisanId, "technicien", 7);
    await expect(ajouterMembreEquipe(repo, B, { interventionId: i.id, technicienId: 7 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getEquipeIntervention : 404 si intervention hors tenant (anti-oracle)", async () => {
    const repo = new FakeInterventionRepository();
    const i = await repo.create(A, baseInput("Pose"));
    await expectCrossTenantDenied(() => getEquipeIntervention(repo, B, i.id));
  });

  it("getEquipesArtisan : ne renvoie que les liaisons du tenant", async () => {
    const repo = new FakeInterventionRepository();
    repo.registerRef(A.artisanId, "technicien", 7);
    repo.registerRef(B.artisanId, "technicien", 8);
    const iA = await repo.create(A, baseInput("A"));
    const iB = await repo.create(B, baseInput("B"));
    await ajouterMembreEquipe(repo, A, { interventionId: iA.id, technicienId: 7 });
    await ajouterMembreEquipe(repo, B, { interventionId: iB.id, technicienId: 8 });
    const eqA = await getEquipesArtisan(repo, A);
    expect(eqA).toHaveLength(1);
    expect(eqA[0].interventionId).toBe(iA.id);
  });

  it("retirerMembreEquipe : scopé tenant (un autre tenant ne retire pas) + idempotent", async () => {
    const repo = new FakeInterventionRepository();
    repo.registerRef(A.artisanId, "technicien", 7);
    const i = await repo.create(A, baseInput("Pose"));
    const m = await ajouterMembreEquipe(repo, A, { interventionId: i.id, technicienId: 7 });
    // B tente de retirer la liaison de A → no-op (toujours présente)
    await retirerMembreEquipe(repo, B, m.id);
    expect(await getEquipeIntervention(repo, A, i.id)).toHaveLength(1);
    // A retire → ok ; re-retirer → idempotent (no-op)
    await retirerMembreEquipe(repo, A, m.id);
    await retirerMembreEquipe(repo, A, m.id);
    expect(await getEquipeIntervention(repo, A, i.id)).toHaveLength(0);
  });
});
