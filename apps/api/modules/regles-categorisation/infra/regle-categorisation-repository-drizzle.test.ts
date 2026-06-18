import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { RegleCategorisationRepositoryDrizzle } from "./regle-categorisation-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9946101;
const B = 9946102;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const motif = () => `MOTIF-${A}-${++seq}`;

describe.skipIf(!URL)("RegleCategorisationRepositoryDrizzle (PG, RLS + snake_case)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new RegleCategorisationRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from regles_categorisation where "artisan_id" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés ; défaut actif + mapping snake_case→camelCase", async () => {
    const m = motif();
    const r = await repo.create(ctx(A), { motifLibelle: m, categorie: "carburant" });
    expect(r.artisanId).toBe(A);
    expect(r.actif).toBe(true);
    expect(r.motifLibelle).toBe(m);
    expect((await repo.getById(ctx(A), r.id))?.categorie).toBe("carburant");
    expect((await repo.list(ctx(A))).some((x) => x.id === r.id)).toBe(true);
  });

  it("pas d'unicité : 2 règles même (motif, categorie) même tenant cohabitent", async () => {
    const m = motif();
    const r1 = await repo.create(ctx(A), { motifLibelle: m, categorie: "carburant" });
    const r2 = await repo.create(ctx(A), { motifLibelle: m, categorie: "carburant" });
    expect(r1.id).not.toBe(r2.id);
  });

  it("update partiel : actif on/off + motif/categorie ; champs non fournis préservés", async () => {
    const r = await repo.create(ctx(A), { motifLibelle: motif(), categorie: "carburant" });
    const maj = await repo.update(ctx(A), r.id, { actif: false });
    expect(maj?.actif).toBe(false);
    expect(maj?.categorie).toBe("carburant"); // préservé
    const maj2 = await repo.update(ctx(A), r.id, { categorie: "deplacements" });
    expect(maj2?.categorie).toBe("deplacements");
    expect(maj2?.actif).toBe(false); // préservé
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas la règle de A", async () => {
    const r = await repo.create(ctx(A), { motifLibelle: motif(), categorie: "carburant" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), r.id));
    expect(await repo.update(ctx(B), r.id, { actif: false })).toBeNull();
    expect(await repo.delete(ctx(B), r.id)).toBe(false);
    expect((await repo.getById(ctx(A), r.id))?.id).toBe(r.id);
  });

  it("delete : supprime la règle, scopé", async () => {
    const r = await repo.create(ctx(A), { motifLibelle: motif(), categorie: "carburant" });
    expect(await repo.delete(ctx(A), r.id)).toBe(true);
    expect(await repo.getById(ctx(A), r.id)).toBeNull();
  });
});
