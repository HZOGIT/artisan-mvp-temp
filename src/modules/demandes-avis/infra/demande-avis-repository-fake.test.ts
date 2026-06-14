import { describe, it, expect } from "vitest";
import { FakeDemandeAvisRepository } from "./demande-avis-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("FakeDemandeAvisRepository (CRUD + listByStatut + setStatut + anti-IDOR 2 FK, sans DB)", () => {
  it("create force artisanId + token serveur unique + statut envoyee + dates", async () => {
    const repo = new FakeDemandeAvisRepository();
    const d = await repo.create(A, { clientId: 10, interventionId: 20 });
    expect(d.artisanId).toBe(1);
    expect(d.statut).toBe("envoyee");
    expect(d.avisRecuAt).toBeNull();
    expect(d.tokenDemande).toMatch(/^tok-/);
    const d2 = await repo.create(A, { clientId: 11, interventionId: 21 });
    expect(d2.tokenDemande).not.toBe(d.tokenDemande); // token unique
  });

  it("getById / list / listByStatut scopés au tenant", async () => {
    const repo = new FakeDemandeAvisRepository();
    const d = await repo.create(A, { clientId: 10, interventionId: 20 });
    await repo.create(A, { clientId: 11, interventionId: 21 });
    expect((await repo.getById(A, d.id))?.clientId).toBe(10);
    expect(await repo.list(A)).toHaveLength(2);
    expect((await repo.listByStatut(A, "envoyee")).length).toBe(2);
    expect(await repo.listByStatut(A, "completee")).toEqual([]);
    expect(await repo.list(B)).toEqual([]);
  });

  it("setStatut applique la transition ; avisRecuAt posé à la complétion", async () => {
    const repo = new FakeDemandeAvisRepository();
    const d = await repo.create(A, { clientId: 10, interventionId: 20 });
    expect((await repo.setStatut(A, d.id, "ouverte"))?.statut).toBe("ouverte");
    const complete = await repo.setStatut(A, d.id, "completee");
    expect(complete?.statut).toBe("completee");
    expect(complete?.avisRecuAt).not.toBeNull();
  });

  it("ownsClient / ownsIntervention : true si seedé pour le tenant, false sinon", async () => {
    const repo = new FakeDemandeAvisRepository();
    repo.seedClient(A, 10);
    repo.seedIntervention(A, 20);
    expect(await repo.ownsClient(A, 10)).toBe(true);
    expect(await repo.ownsClient(B, 10)).toBe(false); // autre tenant
    expect(await repo.ownsIntervention(A, 20)).toBe(true);
    expect(await repo.ownsIntervention(A, 99)).toBe(false);
  });

  it("isolation cross-tenant : B → getById null, setStatut/delete inopérants", async () => {
    const repo = new FakeDemandeAvisRepository();
    const d = await repo.create(A, { clientId: 10, interventionId: 20 });
    expect(await repo.getById(B, d.id)).toBeNull();
    expect(await repo.setStatut(B, d.id, "ouverte")).toBeNull();
    expect(await repo.delete(B, d.id)).toBe(false);
    expect(await repo.delete(A, d.id)).toBe(true);
  });
});
