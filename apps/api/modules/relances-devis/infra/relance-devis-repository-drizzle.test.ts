import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { RelanceDevisRepositoryDrizzle } from "./relance-devis-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9945101;
const B = 9945102;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("RelanceDevisRepositoryDrizzle (PG, RLS + journal + anti-IDOR devisId)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new RelanceDevisRepositoryDrizzle(app.db);
  let devisA = 0;
  let devisB = 0;

  const cleanup = async () => {
    await admin.query('delete from relances_devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };
  // Crée un devis réel pour un artisan (client + devis avec numero unique).
  const seedDevis = async (artisanId: number, n: number) => {
    const clientId = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanId, `C${artisanId}`])).rows[0].id;
    return (await admin.query('insert into devis ("artisanId", "clientId", numero) values ($1,$2,$3) returning id', [artisanId, clientId, `DEV-${n}`])).rows[0].id;
  };
  beforeAll(async () => {
    await cleanup();
    devisA = await seedDevis(A, A);
    devisB = await seedDevis(B, B);
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const base = (over = {}) => ({ devisId: devisA, type: "email" as const, destinataire: "client@test.fr", ...over });

  it("create force artisanId + statut défaut envoye ; getById/list/listByDevis scopés", async () => {
    const r = await repo.create(ctx(A), base());
    expect(r.artisanId).toBe(A);
    expect(r.statut).toBe("envoye");
    expect((await repo.getById(ctx(A), r.id))?.type).toBe("email");
    expect((await repo.list(ctx(A))).some((x) => x.id === r.id)).toBe(true);
    expect((await repo.listByDevis(ctx(A), devisA)).some((x) => x.id === r.id)).toBe(true);
  });

  it("create avec statut echec explicite", async () => {
    const r = await repo.create(ctx(A), base({ statut: "echec", type: "notification" }));
    expect(r.statut).toBe("echec");
    expect(r.type).toBe("notification");
  });

  it("isolation cross-tenant : B ne lit/supprime pas la relance de A ; listByDevis scopé", async () => {
    const r = await repo.create(ctx(A), base());
    await expectCrossTenantDenied(() => repo.getById(ctx(B), r.id));
    expect(await repo.listByDevis(ctx(B), devisA)).toEqual([]);
    expect(await repo.delete(ctx(B), r.id)).toBe(false);
    expect((await repo.getById(ctx(A), r.id))?.id).toBe(r.id);
  });

  it("ownsDevis : true pour un devis du tenant, false sinon (anti-IDOR)", async () => {
    expect(await repo.ownsDevis(ctx(A), devisA)).toBe(true);
    expect(await repo.ownsDevis(ctx(A), devisB)).toBe(false); // devis d'un autre tenant
    expect(await repo.ownsDevis(ctx(A), 999999999)).toBe(false);
  });

  it("delete : supprime la relance, scopé", async () => {
    const r = await repo.create(ctx(A), base());
    expect(await repo.delete(ctx(A), r.id)).toBe(true);
    expect(await repo.getById(ctx(A), r.id)).toBeNull();
  });
});
