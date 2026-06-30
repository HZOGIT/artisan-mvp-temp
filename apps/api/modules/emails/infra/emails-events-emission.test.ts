import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../app";
import { createDbClient } from "../../../shared/db";
import { DrizzleTenantResolver } from "../../../shared/tenant/drizzle-tenant-resolver";
import { injectTrpc } from "../../../shared/testing/trpc-inject";
import { EmailLogWriterDrizzle } from "./email-log-writer-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9938001;

async function makeToken(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

describe.skipIf(!URL)("emails-events-emission (L3 — sendByEmail → emails_log + event_outbox)", () => {
  const admin = new Pool({ connectionString: URL });
  const adminDb = createDbClient(URL!);
  const appDb = createDbClient(APP_URL!);
  let artisanId = 0;
  let clientId = 0;
  let factureId = 0;
  let devisId = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from emails_log where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in (select id from artisans where "userId"=$1))', [UA]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [UA]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);

    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    artisanId = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    clientId = (await admin.query(
      'insert into clients ("artisanId", nom, email) values ($1,$2,$3) returning id',
      [artisanId, "Client Email Test", "client-test@example.com"],
    )).rows[0].id;
    factureId = (await admin.query(
      'insert into factures ("artisanId","clientId",statut,"typeDocument",numero,"totalHT","totalTTC","totalTVA") values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
      [artisanId, clientId, "validee", "facture", "F-TEST-01", "100.00", "120.00", "20.00"],
    )).rows[0].id;
    devisId = (await admin.query(
      'insert into devis ("artisanId","clientId",statut,numero,"totalHT","totalTTC","totalTVA") values ($1,$2,$3,$4,$5,$6,$7) returning id',
      [artisanId, clientId, "envoye", "D-TEST-01", "100.00", "120.00", "20.00"],
    )).rows[0].id;

    const emailLogWriter = new EmailLogWriterDrizzle(adminDb.db);
    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(appDb.db),
      emailLogWriter,
      devisDb: appDb.db,
    });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanId]);
    await admin.query('delete from emails_log where "artisanId"=$1', [artisanId]);
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId"=$1)', [artisanId]);
    await admin.query('delete from factures where "artisanId"=$1', [artisanId]);
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId"=$1)', [artisanId]);
    await admin.query('delete from devis where "artisanId"=$1', [artisanId]);
    await admin.query('delete from clients where "artisanId"=$1', [artisanId]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await adminDb.close();
    await appDb.close();
    await admin.end();
  });

  it("factures.sendByEmail → 1 ligne emails_log + 1 event_outbox facture.email_envoye", async () => {
    const tok = await makeToken(UA);
    const res = await injectTrpc(server, "POST", "factures.sendByEmail", { factureId, attachPdf: false }, tok);
    expect(res.statusCode).toBe(200);

    const logRows = await admin.query(
      'select * from emails_log where "artisanId"=$1 and "entiteId"=$2 and type=$3',
      [artisanId, factureId, "envoi_facture"],
    );
    expect(logRows.rows.length).toBe(1);
    expect(logRows.rows[0].destinataire).toBe("client-test@example.com");

    const outboxRows = await admin.query(
      'select * from event_outbox where "artisanId"=$1 and "entityId"=$2 and action=$3',
      [artisanId, factureId, "facture.email_envoye"],
    );
    expect(outboxRows.rows.length).toBe(1);
    expect(outboxRows.rows[0].entityType).toBe("facture");
  });

  it("devis.sendByEmail → 1 ligne emails_log + 1 event_outbox devis.email_envoye", async () => {
    const tok = await makeToken(UA);
    const res = await injectTrpc(server, "POST", "devis.sendByEmail", { devisId, attachPdf: false }, tok);
    expect(res.statusCode).toBe(200);

    const logRows = await admin.query(
      'select * from emails_log where "artisanId"=$1 and "entiteId"=$2 and type=$3',
      [artisanId, devisId, "envoi_devis"],
    );
    expect(logRows.rows.length).toBe(1);

    const outboxRows = await admin.query(
      'select * from event_outbox where "artisanId"=$1 and "entityId"=$2 and action=$3',
      [artisanId, devisId, "devis.email_envoye"],
    );
    expect(outboxRows.rows.length).toBe(1);
    expect(outboxRows.rows[0].entityType).toBe("devis");
  });
});
