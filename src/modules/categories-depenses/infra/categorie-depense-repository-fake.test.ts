import { describe, it, expect } from "vitest";
import { FakeCategorieDepenseRepository } from "./categorie-depense-repository-fake";
import { ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);

describe("FakeCategorieDepenseRepository (CRUD catalogue + unicité nom, sans DB)", () => {
  it("create force artisanId + défauts (couleur/icone/booléens/ordre)", async () => {
    const repo = new FakeCategorieDepenseRepository();
    const c = await repo.create(A, { nom: "Carburant" });
    expect(c.artisanId).toBe(1);
    expect(c.couleur).toBe("#6366f1");
    expect(c.icone).toBe("Receipt");
    expect(c.deductibleTva).toBe(true);
    expect(c.deductibleIr).toBe(true);
    expect(c.actif).toBe(true);
    expect(c.ordre).toBe(0);
  });

  it("getById / list scopés au tenant", async () => {
    const repo = new FakeCategorieDepenseRepository();
    const c = await repo.create(A, { nom: "Carburant" });
    expect((await repo.getById(A, c.id))?.nom).toBe("Carburant");
    expect(await repo.list(A)).toHaveLength(1);
    expect(await repo.list(B)).toEqual([]);
  });

  it("INVARIANT unicité : 2e create même nom même tenant → ConflictError", async () => {
    const repo = new FakeCategorieDepenseRepository();
    await repo.create(A, { nom: "Carburant" });
    await expect(repo.create(A, { nom: "Carburant" })).rejects.toBeInstanceOf(ConflictError);
    // même nom, tenant DIFFÉRENT → OK (unicité par artisan)
    const cB = await repo.create(B, { nom: "Carburant" });
    expect(cB.artisanId).toBe(2);
  });

  it("update : rename vers un nom déjà pris → ConflictError ; partiel préserve", async () => {
    const repo = new FakeCategorieDepenseRepository();
    await repo.create(A, { nom: "Carburant" });
    const c2 = await repo.create(A, { nom: "Fournitures", couleur: "#aabbcc" });
    await expect(repo.update(A, c2.id, { nom: "Carburant" })).rejects.toBeInstanceOf(ConflictError);
    const maj = await repo.update(A, c2.id, { ordre: 5 });
    expect(maj?.ordre).toBe(5);
    expect(maj?.couleur).toBe("#aabbcc"); // préservé
  });

  it("isolation cross-tenant : B → getById null, update/delete inopérants", async () => {
    const repo = new FakeCategorieDepenseRepository();
    const c = await repo.create(A, { nom: "Secret" });
    expect(await repo.getById(B, c.id)).toBeNull();
    expect(await repo.update(B, c.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(B, c.id)).toBe(false);
    expect(await repo.delete(A, c.id)).toBe(true);
  });
});
