import { describe, it, expect, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient } from "../../shared/db/client";
import { withTenant } from "../../shared/db/with-tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ??
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

describe.skipIf(!URL)("superpdp_tokens — RLS isolation tenant (L2)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanAId = 0;
  let artisanBId = 0;

  afterAll(async () => {
    if (artisanAId) await admin.query(`delete from superpdp_tokens where "artisanId" = $1`, [artisanAId]).catch(() => {});
    if (artisanAId) await admin.query(`delete from artisans where id = $1`, [artisanAId]).catch(() => {});
    if (artisanBId) await admin.query(`delete from artisans where id = $1`, [artisanBId]).catch(() => {});
    await app.close().catch(() => {});
    await admin.end();
  });

  it("setup : crée deux artisans distincts", async () => {
    const uA = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    artisanAId = (
      await admin.query(`insert into artisans ("userId", "nomEntreprise") values ($1, 'Artisan A') returning id`, [uA])
    ).rows[0].id as number;

    const uB = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    artisanBId = (
      await admin.query(`insert into artisans ("userId", "nomEntreprise") values ($1, 'Artisan B') returning id`, [uB])
    ).rows[0].id as number;

    expect(artisanAId).toBeGreaterThan(0);
    expect(artisanBId).toBeGreaterThan(0);
  });

  it("RED — insert sans GUC app.tenant (rôle app_tenant) → rejeté par RLS", async () => {
    await expect(
      app.db.execute(
        sql`insert into superpdp_tokens ("artisanId", "accessToken", "expiresAt") values (${artisanAId}, 'tok-raw', now() + interval '1 hour')`,
      ),
    ).rejects.toThrow();
  });

  it("GREEN — insert avec withTenant → token visible sous le même tenant", async () => {
    const ctxA = { artisanId: artisanAId, userId: 1 };
    await withTenant(app.db, ctxA, async (tx) => {
      await tx.execute(
        sql`insert into superpdp_tokens ("artisanId", "accessToken", "expiresAt") values (${artisanAId}, 'tok-a', now() + interval '1 hour')`,
      );
    });

    const count = await withTenant(app.db, ctxA, async (tx) => {
      const r = await tx.execute(sql`select count(*)::int as n from superpdp_tokens where "artisanId" = ${artisanAId}`);
      return (r.rows[0] as { n: number }).n;
    });
    expect(count).toBe(1);
  });

  it("isolation — tenant B ne voit pas le token de tenant A", async () => {
    const ctxB = { artisanId: artisanBId, userId: 2 };
    const count = await withTenant(app.db, ctxB, async (tx) => {
      const r = await tx.execute(sql`select count(*)::int as n from superpdp_tokens where "artisanId" = ${artisanAId}`);
      return (r.rows[0] as { n: number }).n;
    });
    expect(count).toBe(0);
  });
});
