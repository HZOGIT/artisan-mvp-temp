import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { BudgetCategorieRepositoryDrizzle } from "./budget-categorie-repository-drizzle";
import { ConflictError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9945901;
const B = 9945902;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const cat = () => `cat-${A}-${++seq}`;

describe.skipIf(!URL)("BudgetCategorieRepositoryDrizzle (PG, RLS + unicité (categorie, mois) + snake_case)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new BudgetCategorieRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from budgets_categories where "artisan_id" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés ; défauts montants + mapping snake_case→camelCase", async () => {
    const c = cat();
    const b = await repo.create(ctx(A), { categorie: c, mois: "2026-07", budget: "500.00" });
    expect(b.artisanId).toBe(A);
    expect(b.budget).toBe("500.00");
    expect(b.depenseReelle).toBe("0.00");
    expect((await repo.getById(ctx(A), b.id))?.categorie).toBe(c);
    expect((await repo.list(ctx(A))).some((x) => x.id === b.id)).toBe(true);
    expect((await repo.listByMois(ctx(A), "2026-07")).some((x) => x.id === b.id)).toBe(true);
  });

  it("INVARIANT unicité : 2e create même (categorie, mois) même tenant → ConflictError ; autre tenant → OK", async () => {
    const c = cat();
    await repo.create(ctx(A), { categorie: c, mois: "2026-09" });
    await expect(repo.create(ctx(A), { categorie: c, mois: "2026-09" })).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.create(ctx(B), { categorie: c, mois: "2026-09" })).artisanId).toBe(B); // unicité par artisan
  });

  it("update ne modifie que les montants (categorie/mois inchangés)", async () => {
    const c = cat();
    const b = await repo.create(ctx(A), { categorie: c, mois: "2026-10", budget: "300.00" });
    const maj = await repo.update(ctx(A), b.id, { depenseReelle: "150.00" });
    expect(maj?.depenseReelle).toBe("150.00");
    expect(maj?.budget).toBe("300.00"); // préservé
    expect(maj?.categorie).toBe(c); // inchangé
    expect(maj?.mois).toBe("2026-10"); // inchangé
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le budget de A", async () => {
    const b = await repo.create(ctx(A), { categorie: cat(), mois: "2026-11" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), b.id));
    expect(await repo.update(ctx(B), b.id, { budget: "1.00" })).toBeNull();
    expect(await repo.delete(ctx(B), b.id)).toBe(false);
    expect((await repo.getById(ctx(A), b.id))?.id).toBe(b.id);
  });

  it("delete : supprime le budget, scopé", async () => {
    const b = await repo.create(ctx(A), { categorie: cat(), mois: "2026-12" });
    expect(await repo.delete(ctx(A), b.id)).toBe(true);
    expect(await repo.getById(ctx(A), b.id)).toBeNull();
  });
});
