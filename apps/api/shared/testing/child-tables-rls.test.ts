import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient } from "../db/client";
import { withTenant } from "../db/with-tenant";
import { expectCrossTenantDenied } from "./cross-tenant";
import type { TenantContext } from "../tenant";

/** RLS isolation tests for child tables (no direct artisanId column).
 * Tenant A tries to read rows that belong to tenant B — RLS must block.
 */
const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 990201;
const B = 990202;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("RLS child tables — isolation cross-tenant", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);

  /* IDs of B's records */
  let clientB = 0;
  let devisB = 0;
  let factureB = 0;
  let conversationB = 0;
  let userB = 0;

  let devisLigneB = 0;
  let devisOptionB = 0;
  let devisOptionLigneB = 0;
  let factureLigneB = 0;
  let messageB = 0;
  let portalSessionB = 0;
  let permissionB = 0;

  beforeAll(async () => {
    /* Clean slate */
    await admin.query(`
      delete from "permissions_utilisateur" pu
        using "users" u where u.id = pu."userId" and u."artisanId" in ($1,$2)
    `, [A, B]).catch(() => {});
    await admin.query(`delete from "messages" m using "conversations" c where c.id = m."conversationId" and c."artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "devis_options_lignes" dl using "devis_options" o join "devis" d on d.id=o."devisId" where o.id=dl."optionId" and d."artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "devis_lignes" dl using "devis" d where d.id=dl."devisId" and d."artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "devis_options" o using "devis" d where d.id=o."devisId" and d."artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "factures_lignes" fl using "factures" f where f.id=fl."factureId" and f."artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "client_portal_sessions" ps using "clients" cl where cl.id=ps."clientId" and cl."artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "conversations" where "artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "devis" where "artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "factures" where "artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "clients" where "artisanId" in ($1,$2)`, [A, B]).catch(() => {});
    await admin.query(`delete from "users" where "artisanId" in ($1,$2)`, [A, B]).catch(() => {});

    /* Seed tenant B's parents */
    const cl = await admin.query(`insert into "clients" ("artisanId", nom) values ($1, 'client-B') returning id`, [B]);
    clientB = cl.rows[0].id;

    const dv = await admin.query(`insert into "devis" ("artisanId", "clientId", numero) values ($1,$2,'D-B-001') returning id`, [B, clientB]);
    devisB = dv.rows[0].id;

    const fa = await admin.query(`insert into "factures" ("artisanId", "clientId") values ($1,$2) returning id`, [B, clientB]);
    factureB = fa.rows[0].id;

    const cv = await admin.query(`insert into "conversations" ("artisanId", "clientId") values ($1,$2) returning id`, [B, clientB]);
    conversationB = cv.rows[0].id;

    const usr = await admin.query(`insert into "users" (email, "artisanId") values ($1,$2) returning id`, [`rls-test-b@test.local`, B]);
    userB = usr.rows[0].id;

    /* Seed child records for tenant B */
    const dl = await admin.query(`insert into "devis_lignes" ("devisId", designation, "prixUnitaireHT") values ($1,'ligne-B',10) returning id`, [devisB]);
    devisLigneB = dl.rows[0].id;

    const dopt = await admin.query(`insert into "devis_options" ("devisId", nom) values ($1,'option-B') returning id`, [devisB]);
    devisOptionB = dopt.rows[0].id;

    const dol = await admin.query(`insert into "devis_options_lignes" ("optionId", designation) values ($1,'opt-ligne-B') returning id`, [devisOptionB]);
    devisOptionLigneB = dol.rows[0].id;

    const fl = await admin.query(`insert into "factures_lignes" ("factureId", designation, "prixUnitaireHT") values ($1,'fl-B',20) returning id`, [factureB]);
    factureLigneB = fl.rows[0].id;

    const msg = await admin.query(`insert into "messages" ("conversationId", auteur, contenu) values ($1,'artisan','msg-B') returning id`, [conversationB]);
    messageB = msg.rows[0].id;

    const ps = await admin.query(`insert into "client_portal_sessions" ("clientId","sessionToken","expiresAt") values ($1,'tok-B-rls',now()+interval'1h') returning id`, [clientB]);
    portalSessionB = ps.rows[0].id;

    const perm = await admin.query(`insert into "permissions_utilisateur" ("userId", permission) values ($1,'test.read') returning id`, [userB]);
    permissionB = perm.rows[0].id;
  });

  afterAll(async () => {
    await admin.query(`delete from "permissions_utilisateur" where id=$1`, [permissionB]).catch(() => {});
    await admin.query(`delete from "client_portal_sessions" where id=$1`, [portalSessionB]).catch(() => {});
    await admin.query(`delete from "messages" where id=$1`, [messageB]).catch(() => {});
    await admin.query(`delete from "devis_options_lignes" where id=$1`, [devisOptionLigneB]).catch(() => {});
    await admin.query(`delete from "devis_lignes" where id=$1`, [devisLigneB]).catch(() => {});
    await admin.query(`delete from "devis_options" where id=$1`, [devisOptionB]).catch(() => {});
    await admin.query(`delete from "factures_lignes" where id=$1`, [factureLigneB]).catch(() => {});
    await admin.query(`delete from "conversations" where "artisanId"=$1`, [B]).catch(() => {});
    await admin.query(`delete from "devis" where "artisanId"=$1`, [B]).catch(() => {});
    await admin.query(`delete from "factures" where "artisanId"=$1`, [B]).catch(() => {});
    await admin.query(`delete from "clients" where "artisanId"=$1`, [B]).catch(() => {});
    await admin.query(`delete from "users" where "artisanId"=$1`, [B]).catch(() => {});
    await app.close().catch(() => {});
    await admin.end();
  });

  /** CROSS-TENANT: tenant A must NOT see tenant B's child rows */

  it("devis_lignes — tenant A bloqué par RLS", async () => {
    await expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "devis_lignes" where id = ${devisLigneB}`).then((r) => r.rows[0] ?? null),
      ),
    );
  });

  it("devis_options — tenant A bloqué par RLS", async () => {
    await expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "devis_options" where id = ${devisOptionB}`).then((r) => r.rows[0] ?? null),
      ),
    );
  });

  it("devis_options_lignes — tenant A bloqué par RLS (2 hops)", async () => {
    await expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "devis_options_lignes" where id = ${devisOptionLigneB}`).then((r) => r.rows[0] ?? null),
      ),
    );
  });

  it("factures_lignes — tenant A bloqué par RLS", async () => {
    await expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "factures_lignes" where id = ${factureLigneB}`).then((r) => r.rows[0] ?? null),
      ),
    );
  });

  it("messages — tenant A bloqué par RLS", async () => {
    await expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "messages" where id = ${messageB}`).then((r) => r.rows[0] ?? null),
      ),
    );
  });

  it("client_portal_sessions — tenant A bloqué par RLS", async () => {
    await expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "client_portal_sessions" where id = ${portalSessionB}`).then((r) => r.rows[0] ?? null),
      ),
    );
  });

  it("permissions_utilisateur — tenant A bloqué par RLS", async () => {
    await expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "permissions_utilisateur" where id = ${permissionB}`).then((r) => r.rows[0] ?? null),
      ),
    );
  });

  /** SAME-TENANT: tenant B must see its own child rows */

  it("contrôle : tenant B lit ses propres lignes (devis_lignes)", async () => {
    const r = await withTenant(app.db, ctx(B), (tx) =>
      tx.execute(sql`select id from "devis_lignes" where id = ${devisLigneB}`),
    );
    expect(r.rows[0]).toBeDefined();
  });

  it("contrôle : tenant B lit ses propres lignes (factures_lignes)", async () => {
    const r = await withTenant(app.db, ctx(B), (tx) =>
      tx.execute(sql`select id from "factures_lignes" where id = ${factureLigneB}`),
    );
    expect(r.rows[0]).toBeDefined();
  });

  it("contrôle : tenant B lit ses messages", async () => {
    const r = await withTenant(app.db, ctx(B), (tx) =>
      tx.execute(sql`select id from "messages" where id = ${messageB}`),
    );
    expect(r.rows[0]).toBeDefined();
  });

  it("contrôle : tenant B lit ses sessions portail", async () => {
    const r = await withTenant(app.db, ctx(B), (tx) =>
      tx.execute(sql`select id from "client_portal_sessions" where id = ${portalSessionB}`),
    );
    expect(r.rows[0]).toBeDefined();
  });

  it("contrôle : tenant B lit ses permissions", async () => {
    const r = await withTenant(app.db, ctx(B), (tx) =>
      tx.execute(sql`select id from "permissions_utilisateur" where id = ${permissionB}`),
    );
    expect(r.rows[0]).toBeDefined();
  });
});
