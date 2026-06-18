import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { StockRepositoryDrizzle } from "./stock-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 998001;
const B = 998002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("StockRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new StockRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from stocks where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const s = await repo.create(ctx(A), { reference: "REF-1", designation: "Tube cuivre", quantiteEnStock: "100.00", seuilAlerte: "10.00" });
    expect(s.id).toBeGreaterThan(0);
    expect(s.artisanId).toBe(A);
    expect(s.quantiteEnStock).toBe("100.00");
    expect((await repo.getById(ctx(A), s.id))?.designation).toBe("Tube cuivre");
    expect((await repo.list(ctx(A))).some((x) => x.id === s.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le stock de A", async () => {
    const s = await repo.create(ctx(A), { reference: "SEC", designation: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), s.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === s.id)).toBe(false);
    expect(await repo.update(ctx(B), s.id, { designation: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), s.id)).toBe(false);
    expect((await repo.getById(ctx(A), s.id))?.designation).toBe("Secret");
  });

  it("update : modifie les métadonnées mais PAS la quantité (invariant audit)", async () => {
    const s = await repo.create(ctx(A), { reference: "Q", designation: "Avant", quantiteEnStock: "50.00" });
    const maj = await repo.update(ctx(A), s.id, { designation: "Après", emplacement: "Allée 3" });
    expect(maj?.designation).toBe("Après");
    expect(maj?.emplacement).toBe("Allée 3");
    expect(maj?.quantiteEnStock).toBe("50.00"); // quantité intacte
  });

  it("delete : purge le stock + ses mouvements (cascade), scopé", async () => {
    const s = await repo.create(ctx(A), { reference: "DEL", designation: "ASupprimer" });
    await admin.query(
      `insert into mouvements_stock ("stockId", type, quantite, "quantiteAvant", "quantiteApres") values ($1,'entree','5.00','0.00','5.00')`,
      [s.id],
    );
    expect(await repo.delete(ctx(A), s.id)).toBe(true);
    expect(await repo.getById(ctx(A), s.id)).toBeNull();
    const n = await admin.query('select count(*)::int as n from mouvements_stock where "stockId"=$1', [s.id]);
    expect(n.rows[0].n).toBe(0);
  });
});
