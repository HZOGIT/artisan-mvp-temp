import { describe, it, expect, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient } from "../db/client";
import { withTenant } from "../db/with-tenant";
import { expectCrossTenantDenied } from "./cross-tenant";
import type { TenantContext } from "../tenant";

// Démonstration : le harnais appliqué à un accès RLS réel. Sous withTenant(tenant A),
// lire le client du tenant B renvoie « rien » (RLS) → le harnais valide le non-leak.
const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 990101;
const B = 990102;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("harnais cross-tenant sur RLS réelle (clients)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let clientDeB = 0;

  afterAll(async () => {
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]).catch(() => {});
    await app.close().catch(() => {});
    await admin.end();
  });

  it("le tenant A ne peut pas lire le client du tenant B (non-leak)", async () => {
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    const ins = await admin.query('insert into clients ("artisanId", nom) values ($1, $2) returning id', [B, "client-de-B"]);
    clientDeB = ins.rows[0].id;

    // getById « par id » du client de B, exécuté en tant que tenant A → doit être refusé
    // (RLS : la ligne est invisible → undefined → harnais OK).
    await expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), async (tx) => {
        const r = await tx.execute(sql`select * from clients where id = ${clientDeB}`);
        return r.rows[0] ?? null;
      }),
    );
  });

  it("contrôle : le tenant B lit bien SON client (sinon le test serait vacuously vrai)", async () => {
    const found = await withTenant(app.db, ctx(B), async (tx) => {
      const r = await tx.execute(sql`select id from clients where id = ${clientDeB}`);
      return r.rows[0] ?? null;
    });
    expect(found).not.toBeNull();
  });
});
