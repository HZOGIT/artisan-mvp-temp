import { describe, it, expect } from "vitest";
import { FakeRdvRepository } from "./rdv-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ clientId: 100, titre: "Dépannage", dateProposee: new Date("2026-07-01T10:00:00Z"), ...over });

describe("FakeRdvRepository (CRUD + état machine + anti-IDOR, sans DB)", () => {
  it("create force artisanId + statut en_attente ; défauts dureeEstimee/urgence", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    expect(r.artisanId).toBe(1);
    expect(r.statut).toBe("en_attente");
    expect(r.motifRefus).toBeNull();
    expect(r.dureeEstimee).toBe(60);
    expect(r.urgence).toBe("normale");
  });

  it("getById/list scopés au tenant", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    expect((await repo.getById(A, r.id))?.titre).toBe("Dépannage");
    expect(await repo.list(A)).toHaveLength(1);
    expect(await repo.list(B)).toEqual([]);
  });

  it("isolation cross-tenant : B → getById null, update/setStatut/delete inopérants", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    expect(await repo.getById(B, r.id)).toBeNull();
    expect(await repo.update(B, r.id, { titre: "hack" })).toBeNull();
    expect(await repo.setStatut(B, r.id, "confirme")).toBeNull();
    expect(await repo.delete(B, r.id)).toBe(false);
    expect((await repo.getById(A, r.id))?.titre).toBe("Dépannage");
  });

  it("update ne modifie jamais le statut ; setStatut applique la transition", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    const maj = await repo.update(A, r.id, { titre: "Modifié" });
    expect(maj?.titre).toBe("Modifié");
    expect(maj?.statut).toBe("en_attente"); // inchangé par update
    const refuse = await repo.setStatut(A, r.id, "refuse", { motifRefus: "Indisponible" });
    expect(refuse?.statut).toBe("refuse");
    expect(refuse?.motifRefus).toBe("Indisponible");
  });

  it("ownsClient : true pour un client seedé du tenant, false sinon", async () => {
    const repo = new FakeRdvRepository();
    repo.seedClient(1, 100);
    expect(await repo.ownsClient(A, 100)).toBe(true);
    expect(await repo.ownsClient(A, 999)).toBe(false);
    expect(await repo.ownsClient(B, 100)).toBe(false); // pas le client de B
  });
});
