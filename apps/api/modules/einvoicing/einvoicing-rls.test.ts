import { describe, it, expect, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient } from "../../shared/db/client";
import { withTenant } from "../../shared/db/with-tenant";
import { FakePaAdapter } from "./infra/fake-pa-adapter";
import { ensureArtisanEntity } from "./application/ensure-artisan-entity";
import type { TenantContext } from "../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ??
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

describe.skipIf(!URL)("einvoicing — pa_entites RLS (L2)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanId = 0;
  let artisanBId = 0;

  afterAll(async () => {
    if (artisanId) await admin.query(`delete from pa_entites where "artisanId" = $1`, [artisanId]).catch(() => {});
    if (artisanId) await admin.query("delete from artisans where id = $1", [artisanId]).catch(() => {});
    if (artisanBId) await admin.query("delete from artisans where id = $1", [artisanBId]).catch(() => {});
    await app.close().catch(() => {});
    await admin.end();
  });

  it("setup : crée artisan A avec SIRET et artisan B vide", async () => {
    const uA = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    artisanId = (
      await admin.query(
        `insert into artisans ("userId", siret, "nomEntreprise", email) values ($1, '83814693700027', 'ACME Test', 'test@acme.fr') returning id`,
        [uA],
      )
    ).rows[0].id as number;
    const uB = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    artisanBId = (await admin.query(`insert into artisans ("userId") values ($1) returning id`, [uB])).rows[0].id as number;
    expect(artisanId).toBeGreaterThan(0);
  });

  it("RED — insert dans pa_entites sans app.tenant (app_tenant role) → PG 42501", async () => {
    /* ponytail: démontre que RLS bloque sans withTenant — le test est volontairement cassé */
    await expect(
      app.db.execute(
        sql`insert into pa_entites ("artisanId", fournisseur, "paEntityId", "statutProvisioning") values (${artisanId}, 'test-raw', 'x', 'done')`,
      ),
    ).rejects.toThrow();
  });

  it("GREEN — ensureArtisanEntity (withTenant) → pa_entites créé et lisible sous le même tenant", async () => {
    const ctx: TenantContext = { artisanId, userId: 1 };
    const result = await ensureArtisanEntity(app.db, new FakePaAdapter(), ctx, "fake-l2");
    expect(result.paEntityId).toBe(`fake-entity-83814693700027`);
    expect(result.kybStatut).toBe("validé");

    const rowCount = await withTenant(app.db, ctx, async (tx) => {
      const r = await tx.execute(
        sql`select count(*)::int as n from pa_entites where "artisanId" = ${artisanId} and fournisseur = 'fake-l2'`,
      );
      return (r.rows[0] as { n: number }).n;
    });
    expect(rowCount).toBe(1);
  });

  it("isolation — tenant B ne peut pas lire l'entité PA du tenant A", async () => {
    const ctxB: TenantContext = { artisanId: artisanBId, userId: 2 };
    const count = await withTenant(app.db, ctxB, async (tx) => {
      const r = await tx.execute(
        sql`select count(*)::int as n from pa_entites where "artisanId" = ${artisanId}`,
      );
      return (r.rows[0] as { n: number }).n;
    });
    expect(count).toBe(0);
  });
});
