import { describe, it, expect, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient } from "./client";
import { withTenant } from "./with-tenant";
import type { TenantContext } from "../tenant";

// Vérifie la RLS tenant sur une VRAIE table métier (clients) via le rôle applicatif
// NON-superuser, en s'appuyant sur withTenant(). Intégration : nécessite DATABASE_URL
// (superuser, pour le setup) ; le rôle app est dérivé (app_tenant) ou APP_DATABASE_URL.
const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 990001;
const B = 990002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("RLS sur table réelle (clients) via rôle app + withTenant", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);

  afterAll(async () => {
    await admin.query("delete from clients where \"artisanId\" in ($1,$2)", [A, B]).catch(() => {});
    await app.close().catch(() => {});
    await admin.end();
  });

  it("le rôle app ne voit que les clients de son tenant ; le superuser voit tout", async () => {
    // Setup en superuser (bypass RLS) : 2 clients pour A, 1 pour B.
    await admin.query("delete from clients where \"artisanId\" in ($1,$2)", [A, B]);
    await admin.query("insert into clients (\"artisanId\", nom) values ($1,'A-un'),($1,'A-deux'),($2,'B-un')", [A, B]);

    const countFor = async (artisanId: number) =>
      withTenant(app.db, ctx(artisanId), async (tx) => {
        const r = await tx.execute(sql`select count(*)::int as n from clients`);
        return (r.rows[0] as { n: number }).n;
      });

    // Le rôle app, via withTenant, ne voit que les clients de son tenant.
    expect(await countFor(A)).toBe(2);
    expect(await countFor(B)).toBe(1);

    // Sans tenant (hors withTenant), le rôle app ne voit rien (RLS deny).
    const appNoTenant = await app.db.execute(sql`select count(*)::int as n from clients`);
    expect((appNoTenant.rows[0] as { n: number }).n).toBe(0);

    // Le superuser (legacy) voit tout → app live non impactée par la RLS.
    const adminAll = await admin.query("select count(*)::int as n from clients where \"artisanId\" in ($1,$2)", [A, B]);
    expect(adminAll.rows[0].n).toBe(3);
  });
});
