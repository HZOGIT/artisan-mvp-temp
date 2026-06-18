import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { CategorieDepenseRepositoryDrizzle } from "./categorie-depense-repository-drizzle";
import { ConflictError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9945301;
const B = 9945302;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const nom = () => `Cat-${A}-${++seq}`;

describe.skipIf(!URL)("CategorieDepenseRepositoryDrizzle (PG, RLS + unicité nom + mapping snake_case)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new CategorieDepenseRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from categories_depenses where "artisan_id" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés ; défauts PG + mapping snake_case→camelCase", async () => {
    const c = await repo.create(ctx(A), { nom: nom(), compteComptable: "606" });
    expect(c.artisanId).toBe(A);
    expect(c.couleur).toBe("#6366f1");
    expect(c.icone).toBe("Receipt");
    expect(c.deductibleTva).toBe(true);
    expect(c.compteComptable).toBe("606");
    expect((await repo.getById(ctx(A), c.id))?.compteComptable).toBe("606");
    expect((await repo.list(ctx(A))).some((x) => x.id === c.id)).toBe(true);
  });

  it("INVARIANT unicité : 2e create même nom même tenant → ConflictError ; même nom autre tenant → OK", async () => {
    const n = nom();
    await repo.create(ctx(A), { nom: n });
    await expect(repo.create(ctx(A), { nom: n })).rejects.toBeInstanceOf(ConflictError);
    const cB = await repo.create(ctx(B), { nom: n }); // unicité par artisan
    expect(cB.artisanId).toBe(B);
  });

  it("update : rename vers un nom déjà pris → ConflictError ; partiel préserve", async () => {
    const n1 = nom();
    await repo.create(ctx(A), { nom: n1 });
    const c2 = await repo.create(ctx(A), { nom: nom(), couleur: "#112233" });
    await expect(repo.update(ctx(A), c2.id, { nom: n1 })).rejects.toBeInstanceOf(ConflictError);
    const maj = await repo.update(ctx(A), c2.id, { ordre: 5 });
    expect(maj?.ordre).toBe(5);
    expect(maj?.couleur).toBe("#112233"); // préservé
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas la catégorie de A", async () => {
    const c = await repo.create(ctx(A), { nom: nom() });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), c.id));
    expect(await repo.update(ctx(B), c.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), c.id)).toBe(false);
    expect((await repo.getById(ctx(A), c.id))?.id).toBe(c.id);
  });

  it("delete : supprime la catégorie, scopé", async () => {
    const c = await repo.create(ctx(A), { nom: nom() });
    expect(await repo.delete(ctx(A), c.id)).toBe(true);
    expect(await repo.getById(ctx(A), c.id)).toBeNull();
  });
});
