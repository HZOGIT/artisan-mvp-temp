import { describe, it, expect } from "vitest";
import { FakeContratRepository } from "./contrat-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ clientId: 100, titre: "Entretien chaudière", montantHT: "300.00", periodicite: "annuel" as const, dateDebut: new Date("2026-07-01T00:00:00Z"), ...over });

describe("FakeContratRepository (CRUD + état machine + anti-IDOR + référence, sans DB)", () => {
  it("create force artisanId + statut actif ; reference passée ; défauts", async () => {
    const repo = new FakeContratRepository();
    const c = await repo.create(A, base(), "CTR-00001");
    expect(c.artisanId).toBe(1);
    expect(c.statut).toBe("actif");
    expect(c.reference).toBe("CTR-00001");
    expect(c.type).toBe("entretien");
    expect(c.tauxTVA).toBe("20.00");
    expect(c.reconduction).toBe(true);
  });

  it("getById/list scopés au tenant", async () => {
    const repo = new FakeContratRepository();
    const c = await repo.create(A, base(), "CTR-00001");
    expect((await repo.getById(A, c.id))?.titre).toBe("Entretien chaudière");
    expect(await repo.list(A)).toHaveLength(1);
    expect(await repo.list(B)).toEqual([]);
  });

  it("isolation cross-tenant : B → getById null, update/setStatut/delete inopérants", async () => {
    const repo = new FakeContratRepository();
    const c = await repo.create(A, base(), "CTR-00001");
    expect(await repo.getById(B, c.id)).toBeNull();
    expect(await repo.update(B, c.id, { titre: "hack" })).toBeNull();
    expect(await repo.setStatut(B, c.id, "annule")).toBeNull();
    expect(await repo.delete(B, c.id)).toBe(false);
    expect((await repo.getById(A, c.id))?.titre).toBe("Entretien chaudière");
  });

  it("update ne modifie pas le statut ; setStatut applique la transition", async () => {
    const repo = new FakeContratRepository();
    const c = await repo.create(A, base(), "CTR-00001");
    const maj = await repo.update(A, c.id, { titre: "Modifié", montantHT: "350.00" });
    expect(maj?.titre).toBe("Modifié");
    expect(maj?.statut).toBe("actif"); // inchangé
    const suspendu = await repo.setStatut(A, c.id, "suspendu");
    expect(suspendu?.statut).toBe("suspendu");
  });

  it("ownsClient : true pour client seedé ; nextReference incrémente par tenant", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100);
    expect(await repo.ownsClient(A, 100)).toBe(true);
    expect(await repo.ownsClient(A, 999)).toBe(false);
    expect(await repo.nextReference(A)).toBe("CTR-00001");
    expect(await repo.nextReference(A)).toBe("CTR-00002");
    expect(await repo.nextReference(B)).toBe("CTR-00001"); // compteur par tenant
  });
});
