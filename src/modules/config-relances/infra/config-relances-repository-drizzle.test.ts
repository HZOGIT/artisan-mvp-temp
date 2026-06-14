import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ConfigRelancesRepositoryDrizzle } from "./config-relances-repository-drizzle";
import { defaultConfigRelances } from "../domain/config-relances";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9944701;
const B = 9944702;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("ConfigRelancesRepositoryDrizzle (PG, RLS + singleton get/upsert)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ConfigRelancesRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from config_relances_auto where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("get sans ligne → défauts (jamais null)", async () => {
    expect(await repo.get(ctx(A))).toEqual(defaultConfigRelances(A));
  });

  it("upsert crée la ligne, puis re-get reflète l'état ; artisanId forcé", async () => {
    const r = await repo.upsert(ctx(A), { actif: true, nombreMaxRelances: 5, heureEnvoi: "08:30" });
    expect(r.artisanId).toBe(A);
    expect(r.actif).toBe(true);
    expect(r.nombreMaxRelances).toBe(5);
    const got = await repo.get(ctx(A));
    expect(got.actif).toBe(true);
    expect(got.heureEnvoi).toBe("08:30");
  });

  it("upsert partiel : les autres champs config sont préservés", async () => {
    await repo.upsert(ctx(A), { joursApresEnvoi: 14, joursEnvoi: "1,3,5" });
    const r = await repo.upsert(ctx(A), { joursApresEnvoi: 21 });
    expect(r.joursApresEnvoi).toBe(21);
    expect(r.joursEnvoi).toBe("1,3,5"); // préservé
  });

  it("isolation cross-tenant : l'upsert de A n'affecte pas la config de B", async () => {
    await repo.upsert(ctx(A), { actif: true });
    expect((await repo.get(ctx(B))).actif).toBe(false); // B voit ses défauts
  });
});
