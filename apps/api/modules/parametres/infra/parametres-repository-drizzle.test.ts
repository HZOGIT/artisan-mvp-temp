import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ParametresRepositoryDrizzle } from "./parametres-repository-drizzle";
import { defaultParametres } from "../domain/parametres";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9944101;
const B = 9944102;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("ParametresRepositoryDrizzle (PG, RLS + singleton get/upsert)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ParametresRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from parametres_artisan where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("get sans ligne → défauts (jamais null)", async () => {
    expect(await repo.get(ctx(A))).toEqual(defaultParametres(A));
  });

  it("upsert crée la ligne, puis re-get reflète l'état ; artisanId forcé", async () => {
    const r = await repo.upsert(ctx(A), { prefixeFacture: "F2024", delaiPaiementJours: 45 });
    expect(r.artisanId).toBe(A);
    expect(r.prefixeFacture).toBe("F2024");
    expect(r.delaiPaiementJours).toBe(45);
    const got = await repo.get(ctx(A));
    expect(got.prefixeFacture).toBe("F2024");
    expect(got.delaiPaiementJours).toBe(45);
  });

  it("upsert partiel : les autres champs config sont préservés", async () => {
    await repo.upsert(ctx(A), { prefixeDevis: "D24", conditionsGenerales: "CGV de test" });
    const r = await repo.upsert(ctx(A), { prefixeDevis: "D25" });
    expect(r.prefixeDevis).toBe("D25");
    expect(r.conditionsGenerales).toBe("CGV de test"); // préservé
  });

  it("INVARIANT : upsert config ne modifie pas les compteurs de numérotation", async () => {
    // Simule une ligne dont les compteurs ont déjà été avancés par la numérotation des documents.
    await admin.query(
      'insert into parametres_artisan ("artisanId", "compteurFacture", "prefixeFacture") values ($1,5,$2) on conflict ("artisanId") do update set "compteurFacture"=5',
      [B, "FAC"],
    );
    const r = await repo.upsert(ctx(B), { prefixeFacture: "ZZZ" });
    expect(r.prefixeFacture).toBe("ZZZ");
    expect(r.compteurFacture).toBe(5); // inchangé par l'upsert config
    const got = await repo.get(ctx(B));
    expect(got.compteurFacture).toBe(5);
  });

  it("isolation cross-tenant : l'upsert de A n'affecte pas la config de B", async () => {
    await repo.upsert(ctx(A), { prefixeFacture: "AAA" });
    const b = await repo.get(ctx(B));
    expect(b.prefixeFacture).not.toBe("AAA");
  });
});
