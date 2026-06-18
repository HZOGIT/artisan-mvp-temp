import { describe, it, expect } from "vitest";
import { FakeInterventionRepository } from "../infra/intervention-repository-fake";
import { listInterventions, getIntervention, listMesInterventions } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const baseInput = (titre: string) => ({ clientId: 100, titre, dateDebut: new Date("2026-06-10T08:00:00Z") });

describe("interventions — use-cases de lecture", () => {
  it("listInterventions ne renvoie que les interventions du tenant", async () => {
    const repo = new FakeInterventionRepository();
    await repo.create(A, baseInput("Chez A"));
    await repo.create(B, baseInput("Chez B"));
    const list = await listInterventions(repo, A);
    expect(list.map((i) => i.titre)).toEqual(["Chez A"]);
  });

  it("getIntervention renvoie l'intervention du tenant propriétaire", async () => {
    const repo = new FakeInterventionRepository();
    const i = await repo.create(A, baseInput("Pose"));
    expect((await getIntervention(repo, A, i.id)).titre).toBe("Pose");
  });

  it("getIntervention sur une intervention d'un autre tenant → NotFound", async () => {
    const repo = new FakeInterventionRepository();
    const i = await repo.create(A, baseInput("Secret"));
    await expectCrossTenantDenied(() => getIntervention(repo, B, i.id));
    await expect(getIntervention(repo, B, i.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getIntervention sur un id inexistant → NotFound", async () => {
    const repo = new FakeInterventionRepository();
    await expect(getIntervention(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("interventions — listMesInterventions (minimisation RGPD technicien)", () => {
  // Technicien T1 = fiche 10 liée au user 10 ; T2 = fiche 20.
  async function seed(repo: FakeInterventionRepository) {
    const i1 = await repo.create(A, { clientId: 1, titre: "Pour T1", dateDebut: new Date("2026-06-10T08:00:00Z"), technicienId: 10 });
    const i2 = await repo.create(A, { clientId: 1, titre: "Pour T2", dateDebut: new Date("2026-06-10T09:00:00Z"), technicienId: 20 });
    const i3 = await repo.create(A, { clientId: 1, titre: "Non assignée", dateDebut: new Date("2026-06-10T10:00:00Z") });
    return { i1, i2, i3 };
  }

  it("un technicien LIÉ ne voit que SES interventions", async () => {
    const repo = new FakeInterventionRepository();
    await seed(repo);
    repo.linkTechnicien(1, 10, 10); // user 10 ↔ fiche technicien 10
    const ctxTech: TenantContext = { artisanId: 1, userId: 10, role: "technicien" };
    const mine = await listMesInterventions(repo, ctxTech);
    expect(mine.map((i) => i.titre)).toEqual(["Pour T1"]);
  });

  it("un owner/secrétaire (rôle ≠ technicien) voit toute la vue tenant", async () => {
    const repo = new FakeInterventionRepository();
    await seed(repo);
    const ctxOwner: TenantContext = { artisanId: 1, userId: 99, role: "artisan" };
    expect((await listMesInterventions(repo, ctxOwner)).length).toBe(3);
  });

  it("un technicien NON lié à une fiche → vue complète (behavior-preserving)", async () => {
    const repo = new FakeInterventionRepository();
    await seed(repo);
    const ctxTechNonLie: TenantContext = { artisanId: 1, userId: 77, role: "technicien" };
    expect((await listMesInterventions(repo, ctxTechNonLie)).length).toBe(3);
  });
});
