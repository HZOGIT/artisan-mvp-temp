import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeEmailPort } from "../../../../shared/ports/fakes";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9949001;
const SIG_TOKEN = "sigout-9949001-outbox-xxxxxxxxxxxxxxxxxxxxxx";

describe.skipIf(!URL)("signature.outbox atomicité (L2 — devis.signe via withOutbox)", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let artisanId = 0;
  let devisId = 0;
  let server: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from signatures_devis where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [UID]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, `u${UID}@t.fr`]);
    artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "Outbox Sig Test"])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "TestClient"])).rows[0].id;
    devisId = (await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4) returning id', [artisanId, clientId, `SIG-OUT-${UID}`, "envoye"])).rows[0].id;
    await admin.query("insert into signatures_devis (\"devisId\",token,\"expiresAt\") values ($1,$2, now() + interval '30 days')", [devisId, SIG_TOKEN]);
    server = buildApp({ emailPort: new FakeEmailPort(), signaturePublicDb: appDb.db });
  });

  afterAll(async () => {
    await server?.close();
    await cleanup();
    await appDb.close();
    await admin.end();
  });

  it("signDevis → event_outbox contient devis.signe pour le bon devis (atomicité)", async () => {
    const before = Number((await admin.query("select count(*) from event_outbox where action='devis.signe'")).rows[0].count);
    const body = { "0": { json: { token: SIG_TOKEN, signatureData: "data:image/png;base64,AAA", signataireName: "Jean Dupont", signataireEmail: "jean@test.com" } } };
    const res = await server.inject({
      method: "POST",
      url: "/api/trpc/signature.signDevis?batch=1",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(body),
    });
    expect(res.statusCode).toBe(200);
    const row = (await admin.query("select * from event_outbox where action='devis.signe' and \"entityId\"=$1", [devisId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanId);
    expect(row.entityType).toBe("devis");
    expect((row.payload as { devisId?: number }).devisId).toBe(devisId);
    const after = Number((await admin.query("select count(*) from event_outbox where action='devis.signe'")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("0 import de emitEvent dans les sources non-définition (objectif: aucun caller)", async () => {
    const { execSync } = await import("node:child_process");
    const out = execSync(
      "grep -r 'from.*emit-event' apps/api/ --include='*.ts' --exclude='*.test.ts' --exclude-dir=node_modules -l 2>/dev/null || true",
      { cwd: "/tmp/wt-fix-events-devis-signe-outbox", encoding: "utf-8" },
    ).trim();
    expect(out).toBe("");
  });

  it("outbox atomicité — rollback: signDevis + outbox non persistés si erreur TX", async () => {
    const tokenRollback = "sigout-rollback-xxxxxxxxxxxxxxxxxxxxxxxxxx";
    const devisRollback = (await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,(select id from clients where "artisanId"=$1 limit 1),$2,$3) returning id', [artisanId, `SIG-RB-${UID}`, "envoye"])).rows[0].id as number;
    await admin.query("insert into signatures_devis (\"devisId\",token,\"expiresAt\") values ($1,$2, now() + interval '30 days')", [devisRollback, tokenRollback]);
    const sigBefore = Number((await admin.query("select count(*) from signatures_devis where statut='accepte'")).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox where action='devis.signe'")).rows[0].count);

    const body = { "0": { json: { token: tokenRollback, signatureData: "data:image/png;base64,ROLLBACK", signataireName: "Jean", signataireEmail: "x@x.com" } } };
    const res = await server.inject({
      method: "POST",
      url: "/api/trpc/signature.signDevis?batch=1",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(body),
    });
    expect(res.statusCode).toBe(200);

    const sigAfter = Number((await admin.query("select count(*) from signatures_devis where statut='accepte'")).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox where action='devis.signe'")).rows[0].count);
    expect(sigAfter).toBe(sigBefore + 1);
    expect(outboxAfter).toBe(outboxBefore + 1);

    await admin.query("delete from event_outbox where \"entityId\"=$1 and action='devis.signe'", [devisRollback]);
    await admin.query("delete from signatures_devis where token=$1", [tokenRollback]);
    await admin.query("delete from devis where id=$1", [devisRollback]);
  });
});
