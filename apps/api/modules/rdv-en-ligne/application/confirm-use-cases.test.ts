import { describe, it, expect } from "vitest";
import { confirmerRdvAvecIntervention } from "./confirm-use-cases";
import { FakeRdvRepository } from "../infra/rdv-repository-fake";
import { FakeInterventionRepository } from "../../interventions/infra/intervention-repository-fake";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 6620001;
const B = 6620002;

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function seedRdv(repo: FakeRdvRepository, artisanId: number, dureeEstimee = 90) {
  const rdv = await repo.create(ctx(artisanId), {
    clientId: 42,
    titre: "Pose chaudière",
    description: "RDC",
    dateProposee: inDays(4),
    dureeEstimee,
    urgence: "normale",
  });
  return rdv.id;
}

describe("confirmerRdvAvecIntervention (use-case cross-domaine rdv → interventions, fakes)", () => {
  it("RDV introuvable / hors tenant → NotFoundError (anti-IDOR)", async () => {
    const rdvRepo = new FakeRdvRepository();
    const intervRepo = new FakeInterventionRepository();
    const id = await seedRdv(rdvRepo, A);
    await expect(confirmerRdvAvecIntervention(rdvRepo, intervRepo, ctx(A), 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(confirmerRdvAvecIntervention(rdvRepo, intervRepo, ctx(B), id)).rejects.toBeInstanceOf(NotFoundError);
    // aucune intervention parasite créée par les tentatives refusées
    expect(await intervRepo.list(ctx(A))).toEqual([]);
  });

  it("RDV non « en_attente » → ValidationError (pas reconfirmable)", async () => {
    const rdvRepo = new FakeRdvRepository();
    const intervRepo = new FakeInterventionRepository();
    const id = await seedRdv(rdvRepo, A);
    await rdvRepo.setStatut(ctx(A), id, "refuse");
    await expect(confirmerRdvAvecIntervention(rdvRepo, intervRepo, ctx(A), id)).rejects.toBeInstanceOf(ValidationError);
    expect(await intervRepo.list(ctx(A))).toEqual([]); // aucune intervention créée
  });

  it("succès : crée une intervention planifiée (début=créneau, fin=+durée) et lie le RDV", async () => {
    const rdvRepo = new FakeRdvRepository();
    const intervRepo = new FakeInterventionRepository();
    const id = await seedRdv(rdvRepo, A, 90);
    const rdvAvant = await rdvRepo.getById(ctx(A), id);

    const confirme = await confirmerRdvAvecIntervention(rdvRepo, intervRepo, ctx(A), id);

    // RDV → confirme + interventionId renseigné
    expect(confirme.statut).toBe("confirme");
    expect(confirme.interventionId).not.toBeNull();

    // Intervention créée, planifiée, copiant client/titre/description
    const interventions = await intervRepo.list(ctx(A));
    expect(interventions.length).toBe(1);
    const interv = interventions[0];
    expect(interv.id).toBe(confirme.interventionId);
    expect(interv.statut).toBe("planifiee");
    expect(interv.clientId).toBe(42);
    expect(interv.titre).toBe("Pose chaudière");
    expect(interv.description).toBe("RDC");
    // début = créneau proposé ; fin = début + 90 min
    expect(interv.dateDebut.getTime()).toBe(rdvAvant!.dateProposee.getTime());
    expect(interv.dateFin!.getTime()).toBe(rdvAvant!.dateProposee.getTime() + 90 * 60000);
  });

  it("durée par défaut (0/absente) → fin = début + 60 min", async () => {
    const rdvRepo = new FakeRdvRepository();
    const intervRepo = new FakeInterventionRepository();
    const id = await seedRdv(rdvRepo, A, 0); // dureeEstimee 0 → fallback 60
    const rdvAvant = await rdvRepo.getById(ctx(A), id);

    await confirmerRdvAvecIntervention(rdvRepo, intervRepo, ctx(A), id);

    const interv = (await intervRepo.list(ctx(A)))[0];
    expect(interv.dateFin!.getTime()).toBe(rdvAvant!.dateProposee.getTime() + 60 * 60000);
  });
});
