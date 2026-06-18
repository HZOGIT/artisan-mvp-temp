import { describe, it, expect } from "vitest";
import { FakeModeleDevisRepository } from "./modele-devis-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const ligne = (over = {}) => ({ designation: "Prestation", quantite: "2.00", prixUnitaireHT: "100.00", ...over });

describe("FakeModeleDevisRepository (agrégat header+lignes scopé, sans DB)", () => {
  it("create avec 2 lignes → getById agrégat ordonné ; artisanId forcé ; défauts", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await repo.create(A, { nom: "Trame", lignes: [ligne({ ordre: 2, designation: "B" }), ligne({ ordre: 1, designation: "A" })] });
    expect(m.artisanId).toBe(1);
    expect(m.isDefault).toBe(false);
    const agg = await repo.getById(A, m.id);
    expect(agg?.lignes.map((l) => l.designation)).toEqual(["A", "B"]); // trié par ordre
    expect(agg?.lignes[0].unite).toBe("unité"); // défaut
    expect(agg?.lignes[0].tauxTVA).toBe("20.00"); // défaut
  });

  it("list est léger (en-têtes sans lignes) et scopé au tenant", async () => {
    const repo = new FakeModeleDevisRepository();
    await repo.create(A, { nom: "T", lignes: [ligne()] });
    const list = await repo.list(A);
    expect(list).toHaveLength(1);
    expect(list[0].lignes).toEqual([]); // léger
    expect(await repo.list(B)).toEqual([]);
  });

  it("isolation cross-tenant : B → getById null, update/delete inopérants ; modèle de A intact", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await repo.create(A, { nom: "Secret", lignes: [ligne()] });
    expect(await repo.getById(B, m.id)).toBeNull();
    expect(await repo.update(B, m.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(B, m.id)).toBe(false);
    expect((await repo.getById(A, m.id))?.nom).toBe("Secret");
    expect((await repo.getById(A, m.id))?.lignes).toHaveLength(1);
  });

  it("update remplace les lignes (2→1) et préserve l'en-tête non fourni", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await repo.create(A, { nom: "Avant", notes: "Garde", lignes: [ligne(), ligne()] });
    const maj = await repo.update(A, m.id, { nom: "Après", lignes: [ligne({ designation: "Unique" })] });
    expect(maj?.nom).toBe("Après");
    expect(maj?.notes).toBe("Garde"); // préservé
    expect(maj?.lignes).toHaveLength(1);
    expect(maj?.lignes[0].designation).toBe("Unique");
  });

  it("update sans lignes conserve les lignes existantes", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await repo.create(A, { nom: "T", lignes: [ligne(), ligne()] });
    const maj = await repo.update(A, m.id, { nom: "Renommé" });
    expect(maj?.lignes).toHaveLength(2); // conservées
  });

  it("delete supprime le modèle et ses lignes (scopé)", async () => {
    const repo = new FakeModeleDevisRepository();
    const m = await repo.create(A, { nom: "T", lignes: [ligne()] });
    expect(await repo.delete(A, m.id)).toBe(true);
    expect(await repo.getById(A, m.id)).toBeNull();
  });
});
