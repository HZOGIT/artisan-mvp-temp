import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { VehiculeRepositoryDrizzle } from "./vehicule-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 991201;
const B = 991202;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("delete cascade (entretiens + assurances) — scopé tenant", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new VehiculeRepositoryDrizzle(app.db);

  const cleanup = async () => {
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

  const countChildren = async (vehiculeId: number) => {
    const e = await admin.query('select count(*)::int n from entretiens_vehicules where "vehiculeId"=$1', [vehiculeId]);
    const a = await admin.query('select count(*)::int n from assurances_vehicules where "vehiculeId"=$1', [vehiculeId]);
    return { entretiens: e.rows[0].n as number, assurances: a.rows[0].n as number };
  };

  it("delete owné supprime le véhicule ET son historique (pas d'orphelins)", async () => {
    const v = await repo.create(ctx(A), { immatriculation: "DC-1" });
    await repo.addEntretien(ctx(A), v.id, { type: "vidange", dateEntretien: "2026-06-01" });
    await repo.addAssurance(ctx(A), v.id, { compagnie: "Maif", dateDebut: "2026-01-01", dateFin: "2026-12-31" });
    expect(await countChildren(v.id)).toEqual({ entretiens: 1, assurances: 1 });

    expect(await repo.delete(ctx(A), v.id)).toBe(true);
    expect(await repo.getById(ctx(A), v.id)).toBeNull();
    expect(await countChildren(v.id)).toEqual({ entretiens: 0, assurances: 0 });
  });

  it("delete cross-tenant refusé : véhicule de A et son historique intacts", async () => {
    const v = await repo.create(ctx(A), { immatriculation: "DC-2" });
    await repo.addEntretien(ctx(A), v.id, { type: "freins", dateEntretien: "2026-06-02" });

    expect(await repo.delete(ctx(B), v.id)).toBe(false);
    expect(await repo.getById(ctx(A), v.id)).not.toBeNull();
    expect((await countChildren(v.id)).entretiens).toBe(1);
  });
});
