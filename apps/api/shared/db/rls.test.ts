import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";

// Prouve le mécanisme RLS d'isolation tenant sur une table de démo, via un rôle
// applicatif NON-superuser (les superusers/BYPASSRLS ignorent RLS — d'où l'exigence
// d'un rôle dédié pour le nouveau stack). Intégration : nécessite DATABASE_URL.
const URL = process.env.DATABASE_URL;
const ROLE = "rls_demo_role";
const PW = "rls_demo_pw_xyz";

describe.skipIf(!URL)("RLS isolation tenant (rôle non-superuser)", () => {
  const admin = new Pool({ connectionString: URL });
  let appPool: Pool | undefined;

  afterAll(async () => {
    if (appPool) await appPool.end().catch(() => {});
    await admin.query("drop table if exists rls_demo_iso").catch(() => {});
    await admin.query(`drop role if exists ${ROLE}`).catch(() => {});
    await admin.end();
  });

  it("un rôle non-superuser ne voit que les lignes de son tenant ; le superuser bypasse", async () => {
    // Setup (en superuser).
    await admin.query("drop table if exists rls_demo_iso");
    await admin.query(`drop role if exists ${ROLE}`);
    await admin.query("create table rls_demo_iso (id serial primary key, artisan_id int not null, label text)");
    await admin.query("insert into rls_demo_iso (artisan_id, label) values (1,'a1'),(1,'a2'),(2,'b1')");
    await admin.query("alter table rls_demo_iso enable row level security");
    await admin.query("alter table rls_demo_iso force row level security");
    await admin.query(
      "create policy tenant_isolation on rls_demo_iso using (artisan_id = nullif(current_setting('app.tenant', true), '')::int)",
    );
    await admin.query(`create role ${ROLE} login password '${PW}'`);
    await admin.query(`grant select on rls_demo_iso to ${ROLE}`);

    // Connexion en tant que rôle applicatif (non-superuser) → RLS appliqué.
    appPool = new Pool({ connectionString: URL!.replace(/:\/\/[^@]+@/, `://${ROLE}:${PW}@`) });
    const c = await appPool.connect();
    try {
      const count = async () => (await c.query("select count(*)::int as n from rls_demo_iso")).rows[0].n as number;

      // Sans tenant → 0 ligne (deny par défaut).
      expect(await count()).toBe(0);

      // Tenant 1 → ses 2 lignes.
      await c.query("select set_config('app.tenant', '1', false)");
      expect(await count()).toBe(2);

      // Tenant 2 → sa 1 ligne (jamais celles de 1).
      await c.query("select set_config('app.tenant', '2', false)");
      expect(await count()).toBe(1);

      // Retour à vide → 0 ligne.
      await c.query("select set_config('app.tenant', '', false)");
      expect(await count()).toBe(0);
    } finally {
      c.release();
    }

    // Le superuser (legacy) bypasse RLS → voit les 3 lignes (non impacté par RLS).
    const all = (await admin.query("select count(*)::int as n from rls_demo_iso")).rows[0].n as number;
    expect(all).toBe(3);
  });
});
