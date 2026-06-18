import { describe, it, expect } from "vitest";
import { FakeModeleEmailRepository } from "./modele-email-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ nom: "M", type: "envoi_devis" as const, sujet: "S", contenu: "C", ...over });

describe("FakeModeleEmailRepository (CRUD scopé, sans DB)", () => {
  it("create force artisanId au tenant ; isDefault défaut false ; getById/list scopés", async () => {
    const repo = new FakeModeleEmailRepository();
    const m = await repo.create(A, base());
    expect(m.artisanId).toBe(1);
    expect(m.isDefault).toBe(false);
    expect((await repo.getById(A, m.id))?.nom).toBe("M");
    expect(await repo.list(A)).toHaveLength(1);
  });

  it("listByType filtre par type et reste scopé", async () => {
    const repo = new FakeModeleEmailRepository();
    await repo.create(A, base({ type: "relance_devis", nom: "R" }));
    await repo.create(A, base({ type: "autre", nom: "X" }));
    const r = await repo.listByType(A, "relance_devis");
    expect(r.map((m) => m.nom)).toEqual(["R"]);
    expect(await repo.listByType(A, "envoi_facture")).toEqual([]);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le modèle de A", async () => {
    const repo = new FakeModeleEmailRepository();
    const m = await repo.create(A, base({ sujet: "Secret" }));
    expect(await repo.getById(B, m.id)).toBeNull();
    expect(await repo.list(B)).toEqual([]);
    expect(await repo.update(B, m.id, { sujet: "hack" })).toBeNull();
    expect(await repo.delete(B, m.id)).toBe(false);
    expect((await repo.getById(A, m.id))?.sujet).toBe("Secret");
  });

  it("update partiel préserve les autres champs ; delete scopé", async () => {
    const repo = new FakeModeleEmailRepository();
    const m = await repo.create(A, base({ sujet: "Avant", contenu: "C", isDefault: true }));
    const maj = await repo.update(A, m.id, { sujet: "Après" });
    expect(maj?.sujet).toBe("Après");
    expect(maj?.contenu).toBe("C");
    expect(maj?.isDefault).toBe(true);
    expect(await repo.delete(A, m.id)).toBe(true);
    expect(await repo.getById(A, m.id)).toBeNull();
  });
});
