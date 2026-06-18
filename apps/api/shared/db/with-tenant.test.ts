import { describe, it, expect, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";
import { withTenant } from "./with-tenant";
import type { TenantContext } from "../tenant";

const URL = process.env.DATABASE_URL;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const readTenant = async (tx: { execute: (q: any) => Promise<any> }) =>
  (await tx.execute(sql`select current_setting('app.tenant', true) as t`)).rows[0].t as string | null;

// Tests d'intégration : nécessitent une vraie base PostgreSQL (DATABASE_URL).
describe.skipIf(!URL)("withTenant", () => {
  const handle = createDbClient(URL!);
  afterAll(() => handle.close());

  it("positionne app.tenant dans la transaction", async () => {
    const v = await withTenant(handle.db, ctx(123), (tx) => readTenant(tx));
    expect(v).toBe("123");
  });

  it("réglage local à la transaction : pas de fuite après (is_local)", async () => {
    await withTenant(handle.db, ctx(7), async (tx) => {
      await tx.execute(sql`select 1`);
    });
    // Hors withTenant : aucun tenant ne doit fuiter. set_config(local) est annulé à
    // la fin de la transaction → la GUC revient à vide (null ou "" selon PG), jamais
    // un id de tenant. Pour RLS, vide → deny (cf. nullif(...,'')::int en R0.12).
    const after = await readTenant(handle.db as any);
    expect(after === null || after === "").toBe(true);
  });

  it("isole deux tenants successifs (valeurs distinctes)", async () => {
    const a = await withTenant(handle.db, ctx(11), (tx) => readTenant(tx));
    const b = await withTenant(handle.db, ctx(22), (tx) => readTenant(tx));
    expect(a).toBe("11");
    expect(b).toBe("22");
  });

  it("propage le résultat du callback", async () => {
    const out = await withTenant(handle.db, ctx(5), async () => ({ ok: true, n: 42 }));
    expect(out).toEqual({ ok: true, n: 42 });
  });
});
