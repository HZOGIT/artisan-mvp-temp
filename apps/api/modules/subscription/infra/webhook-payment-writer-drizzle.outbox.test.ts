import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { WebhookPaymentWriterDrizzle } from "./webhook-payment-writer-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9981222;
const TOKEN = "paytok-9981222-outbox-atomicite-test-connect";
const TOKEN_FAIL = "paytok-9981222-outbox-atomicite-fail-test";

describe.skipIf(!URL || !APP_URL)("WebhookPaymentWriterDrizzle.outbox — atomicité facture.payee (L2)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const writer = new WebhookPaymentWriterDrizzle(app.db);
  let artisanId = 0;
  let factureId = 0;
  let paiementId = 0;
  let failPaiementId = 0;

  const cleanup = async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from notifications where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from paiements_stripe where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, role) values ($1,$2,'artisan')", [UID, `webhook-outbox-${UID}@test.local`]);
    artisanId = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [artisanId, "Durand", "Marie"])).rows[0].id;
    factureId = (await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5) returning id', [artisanId, clientId, "FAC-OUTBOX-1", "envoyee", "180.00"])).rows[0].id;
    paiementId = (await admin.query('insert into paiements_stripe ("factureId","artisanId",montant,"tokenPaiement",statut) values ($1,$2,$3,$4,$5) returning id', [factureId, artisanId, "180.00", TOKEN, "en_attente"])).rows[0].id;
    const failFactureId = (await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5) returning id', [artisanId, clientId, "FAC-OUTBOX-FAIL", "envoyee", "90.00"])).rows[0].id;
    failPaiementId = (await admin.query('insert into paiements_stripe ("factureId","artisanId",montant,"tokenPaiement",statut) values ($1,$2,$3,$4,$5) returning id', [failFactureId, artisanId, "90.00", TOKEN_FAIL, "en_attente"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("failPaiement — paiement.echoue co-écrit dans event_outbox dans la même tx que le marquage échoué", async () => {
    await writer.failPaiement({ artisanId, paiementId: failPaiementId });

    const pai = (await admin.query("select statut from paiements_stripe where id=$1", [failPaiementId])).rows[0];
    expect(pai.statut).toBe("echouee");

    const rows = (await admin.query(
      "select action, \"entityType\", \"entityId\", payload from event_outbox where \"artisanId\"=$1 and action='paiement.echoue' order by id desc limit 1",
      [artisanId],
    )).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("paiement.echoue");
    expect(rows[0].entityType).toBe("paiement");
    expect(rows[0].entityId).toBe(failPaiementId);
    expect(rows[0].payload).toMatchObject({ paiementId: failPaiementId });
  });

  it("completeCheckout — facture.payee co-écrit dans event_outbox dans la même tx que le marquage payé", async () => {
    await writer.completeCheckout({ artisanId, paiementId, factureId, stripePaymentIntentId: "pi_connect_test_1" });

    const fac = (await admin.query("select statut from factures where id=$1", [factureId])).rows[0];
    expect(fac.statut).toBe("payee");

    const rows = (await admin.query(
      "select action, \"entityType\", \"entityId\", payload from event_outbox where \"artisanId\"=$1 and action='facture.payee' order by id desc limit 1",
      [artisanId],
    )).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("facture.payee");
    expect(rows[0].entityType).toBe("facture");
    expect(rows[0].entityId).toBe(factureId);
    expect(rows[0].payload).toMatchObject({ factureId });
  });
});
