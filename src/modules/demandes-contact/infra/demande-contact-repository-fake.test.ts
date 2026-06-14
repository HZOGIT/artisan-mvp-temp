import { describe, it, expect } from "vitest";
import { FakeDemandeContactRepository } from "./demande-contact-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("FakeDemandeContactRepository (CRUD + état machine + anti-IDOR, sans DB)", () => {
  it("create force artisanId + statut nouveau + clientId null ; source défaut", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await repo.create(A, { nom: "Jean Dupont" });
    expect(d.artisanId).toBe(1);
    expect(d.statut).toBe("nouveau");
    expect(d.clientId).toBeNull();
    expect(d.source).toBe("vitrine");
  });

  it("getById / list / listByStatut scopés au tenant", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await repo.create(A, { nom: "Jean" });
    expect((await repo.getById(A, d.id))?.nom).toBe("Jean");
    expect(await repo.list(A)).toHaveLength(1);
    expect((await repo.listByStatut(A, "nouveau")).map((x) => x.id)).toEqual([d.id]);
    expect(await repo.listByStatut(A, "converti")).toEqual([]);
    expect(await repo.list(B)).toEqual([]);
  });

  it("isolation cross-tenant : B → getById null, update/setStatut/delete inopérants", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await repo.create(A, { nom: "Secret" });
    expect(await repo.getById(B, d.id)).toBeNull();
    expect(await repo.update(B, d.id, { nom: "hack" })).toBeNull();
    expect(await repo.setStatut(B, d.id, "perdu")).toBeNull();
    expect(await repo.delete(B, d.id)).toBe(false);
    expect((await repo.getById(A, d.id))?.nom).toBe("Secret");
  });

  it("update ne modifie pas le statut/clientId ; setStatut applique transition + clientId", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await repo.create(A, { nom: "Jean" });
    const maj = await repo.update(A, d.id, { nom: "Jean Modifié", message: "rappel" });
    expect(maj?.nom).toBe("Jean Modifié");
    expect(maj?.statut).toBe("nouveau"); // inchangé
    expect(maj?.clientId).toBeNull(); // inchangé
    const contacte = await repo.setStatut(A, d.id, "contacte");
    expect(contacte?.statut).toBe("contacte");
    const converti = await repo.setStatut(A, d.id, "converti", 555);
    expect(converti?.statut).toBe("converti");
    expect(converti?.clientId).toBe(555);
  });

  it("ownsClient : true pour un client seedé du tenant, false sinon", async () => {
    const repo = new FakeDemandeContactRepository();
    repo.seedClient(1, 100);
    expect(await repo.ownsClient(A, 100)).toBe(true);
    expect(await repo.ownsClient(A, 999)).toBe(false);
    expect(await repo.ownsClient(B, 100)).toBe(false);
  });
});
