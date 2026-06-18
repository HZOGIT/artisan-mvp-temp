import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ModeleDevisRepositoryDrizzle } from "./modele-devis-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9944501;
const B = 9944502;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const ligne = (over = {}) => ({ designation: "Prestation", quantite: "2.00", prixUnitaireHT: "100.00", ...over });

describe.skipIf(!URL)("ModeleDevisRepositoryDrizzle (PG, RLS + agrégat header+lignes scopé parent)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ModeleDevisRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from modeles_devis_lignes where "modeleId" in (select id from modeles_devis where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from modeles_devis where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create avec 2 lignes → getById agrégat (lignes ordonnées, défauts PG) ; artisanId forcé", async () => {
    const m = await repo.create(ctx(A), { nom: "Trame", lignes: [ligne({ ordre: 2, designation: "B" }), ligne({ ordre: 1, designation: "A" })] });
    expect(m.artisanId).toBe(A);
    expect(m.isDefault).toBe(false);
    const agg = await repo.getById(ctx(A), m.id);
    expect(agg?.lignes.map((l) => l.designation)).toEqual(["A", "B"]);
    expect(agg?.lignes[0].unite).toBe("unité");
    expect(agg?.lignes[0].tauxTVA).toBe("20.00");
    expect(agg?.lignes[0].quantite).toBe("2.00");
  });

  it("list léger (en-têtes sans lignes) scopé au tenant", async () => {
    const list = await repo.list(ctx(A));
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((m) => m.lignes.length === 0)).toBe(true);
    expect(await repo.list(ctx(B))).toEqual([]);
  });

  it("isolation cross-tenant : B → getById null ; update/delete inopérants ; modèle de A intact", async () => {
    const m = await repo.create(ctx(A), { nom: "Secret", lignes: [ligne()] });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), m.id));
    expect(await repo.update(ctx(B), m.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), m.id)).toBe(false);
    const agg = await repo.getById(ctx(A), m.id);
    expect(agg?.nom).toBe("Secret");
    expect(agg?.lignes).toHaveLength(1);
  });

  it("update remplace les lignes (2→1) et préserve l'en-tête non fourni", async () => {
    const m = await repo.create(ctx(A), { nom: "Avant", notes: "Garde", lignes: [ligne(), ligne()] });
    const maj = await repo.update(ctx(A), m.id, { nom: "Après", lignes: [ligne({ designation: "Unique" })] });
    expect(maj?.nom).toBe("Après");
    expect(maj?.notes).toBe("Garde");
    expect(maj?.lignes).toHaveLength(1);
    expect(maj?.lignes[0].designation).toBe("Unique");
  });

  it("delete supprime modèle + lignes (scopé)", async () => {
    const m = await repo.create(ctx(A), { nom: "ASupprimer", lignes: [ligne(), ligne()] });
    expect(await repo.delete(ctx(A), m.id)).toBe(true);
    expect(await repo.getById(ctx(A), m.id)).toBeNull();
    // les lignes orphelines ne subsistent pas
    const orphelines = await admin.query('select count(*)::int as n from modeles_devis_lignes where "modeleId"=$1', [m.id]);
    expect(orphelines.rows[0].n).toBe(0);
  });

  it("addLigne : ajoute UNE ligne au modèle possédé (sans toucher aux autres) ; null si hors tenant", async () => {
    const m = await repo.create(ctx(A), { nom: "Trame", lignes: [ligne({ designation: "L1" })] });
    const ajoutee = await repo.addLigne(ctx(A), m.id, { designation: "L2", quantite: "3.00", prixUnitaireHT: "50.00" });
    expect(ajoutee?.designation).toBe("L2");
    expect(ajoutee?.modeleId).toBe(m.id);
    expect((await repo.getById(ctx(A), m.id))?.lignes.map((l) => l.designation)).toEqual(["L1", "L2"]);
    // anti-IDOR via le parent : B ne peut pas ajouter de ligne au modèle de A
    expect(await repo.addLigne(ctx(B), m.id, { designation: "Hack" })).toBeNull();
    expect((await repo.getById(ctx(A), m.id))?.lignes).toHaveLength(2);
  });
});
