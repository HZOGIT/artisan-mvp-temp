import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { FournisseurRepositoryDrizzle } from "./fournisseur-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 996001;
const B = 996002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("FournisseurRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new FournisseurRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query(
      'delete from articles_fournisseurs where "fournisseurId" in (select id from fournisseurs where "artisanId" in ($1,$2))',
      [A, B],
    );
    await admin.query('delete from fournisseurs where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const f = await repo.create(ctx(A), { nom: "Point P", ville: "Lyon", email: "contact@pointp.fr" });
    expect(f.id).toBeGreaterThan(0);
    expect(f.artisanId).toBe(A);
    expect((await repo.getById(ctx(A), f.id))?.nom).toBe("Point P");
    expect((await repo.list(ctx(A))).some((x) => x.id === f.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le fournisseur de A", async () => {
    const f = await repo.create(ctx(A), { nom: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), f.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === f.id)).toBe(false);
    expect(await repo.update(ctx(B), f.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), f.id)).toBe(false);
    expect((await repo.getById(ctx(A), f.id))?.nom).toBe("Secret");
  });

  it("update : modifie les champs scopés au tenant", async () => {
    const f = await repo.create(ctx(A), { nom: "Avant" });
    const maj = await repo.update(ctx(A), f.id, { nom: "Après", ville: "Paris" });
    expect(maj?.nom).toBe("Après");
    expect(maj?.ville).toBe("Paris");
  });

  it("delete : purge le fournisseur + ses associations article-fournisseur (cascade), scopé", async () => {
    const f = await repo.create(ctx(A), { nom: "ASupprimer" });
    await admin.query(
      'insert into articles_fournisseurs ("articleId","fournisseurId","prixAchat") values ($1,$2,$3)',
      [12345, f.id, "9.90"],
    );
    expect(await repo.delete(ctx(A), f.id)).toBe(true);
    expect(await repo.getById(ctx(A), f.id)).toBeNull();
    const assoc = await admin.query('select count(*)::int as n from articles_fournisseurs where "fournisseurId"=$1', [f.id]);
    expect(assoc.rows[0].n).toBe(0);
  });
});
