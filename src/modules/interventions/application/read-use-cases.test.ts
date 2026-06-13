import { describe, it, expect } from "vitest";
import { FakeInterventionRepository } from "../infra/intervention-repository-fake";
import { listInterventions, getIntervention } from "./read-use-cases";
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
