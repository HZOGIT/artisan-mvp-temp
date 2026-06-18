import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { VehiculeRepositoryDrizzle } from "./vehicule-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 991001;
const B = 991002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("VehiculeRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new VehiculeRepositoryDrizzle(app.db);

  const cleanup = async () => {
    // entretiens/assurances via les véhicules des 2 tenants, puis les véhicules.
    await admin.query(
      'delete from entretiens_vehicules where "vehiculeId" in (select id from vehicules where "artisanId" in ($1,$2))',
      [A, B],
    );
    await admin.query(
      'delete from assurances_vehicules where "vehiculeId" in (select id from vehicules where "artisanId" in ($1,$2))',
      [A, B],
    );
    await admin.query('delete from vehicules where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const v = await repo.create(ctx(A), { immatriculation: "AA-111-AA", marque: "Renault", kilometrageActuel: 1000 });
    expect(v.id).toBeGreaterThan(0);
    expect(v.artisanId).toBe(A);

    const got = await repo.getById(ctx(A), v.id);
    expect(got?.immatriculation).toBe("AA-111-AA");

    const list = await repo.list(ctx(A));
    expect(list.some((x) => x.id === v.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit pas le véhicule de A", async () => {
    const v = await repo.create(ctx(A), { immatriculation: "AA-222-AA" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), v.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === v.id)).toBe(false);
    // update/delete cross-tenant → no-op (null / false)
    expect(await repo.update(ctx(B), v.id, { marque: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), v.id)).toBe(false);
    // le véhicule de A est intact
    expect((await repo.getById(ctx(A), v.id))?.marque ?? null).toBeNull();
  });

  it("updateKilometrage : le compteur ne recule jamais", async () => {
    const v = await repo.create(ctx(A), { immatriculation: "AA-333-AA", kilometrageActuel: 5000 });
    expect((await repo.updateKilometrage(ctx(A), v.id, 8000))?.kilometrageActuel).toBe(8000);
    // tentative de recul → reste à 8000
    expect((await repo.updateKilometrage(ctx(A), v.id, 6000))?.kilometrageActuel).toBe(8000);
  });

  it("entretiens/assurances scopés via le véhicule du tenant", async () => {
    const v = await repo.create(ctx(A), { immatriculation: "AA-444-AA" });
    const ent = await repo.addEntretien(ctx(A), v.id, { type: "vidange", dateEntretien: "2026-06-01", cout: "120.00" });
    expect(ent?.type).toBe("vidange");
    expect((await repo.listEntretiens(ctx(A), v.id)).length).toBe(1);

    const ass = await repo.addAssurance(ctx(A), v.id, { compagnie: "Maif", dateDebut: "2026-01-01", dateFin: "2026-12-31" });
    expect(ass?.compagnie).toBe("Maif");
    expect((await repo.listAssurances(ctx(A), v.id)).length).toBe(1);

    // B ne peut ni lister ni ajouter sur le véhicule de A (ownership via véhicule).
    expect(await repo.listEntretiens(ctx(B), v.id)).toEqual([]);
    expect(await repo.addEntretien(ctx(B), v.id, { type: "pneus", dateEntretien: "2026-06-02" })).toBeNull();
    expect(await repo.addAssurance(ctx(B), v.id, { compagnie: "X", dateDebut: "2026-01-01", dateFin: "2026-12-31" })).toBeNull();
  });
});
