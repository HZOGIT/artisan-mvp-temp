import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { WebhookPaymentWriterDrizzle } from "./webhook-payment-writer-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9981111;
const TOKEN = "paytok-9981111-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

// ⚠️ Valide la résolution du paiement par token sous la **policy public-token RLS** (`app_tenant`) +
// l'effet checkout (facture→payée + paiement→complete + notif) sous le tenant résolu.
describe.skipIf(!URL)("WebhookPaymentWriterDrizzle (paiement par token sous RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const writer = new WebhookPaymentWriterDrizzle(app.db);
  let artisanId = 0;
  let factureId = 0;
  let paiementId = 0;

  const cleanup = async () => {
    await admin.query('delete from notifications where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from paiements_stripe where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanId = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [artisanId, "Dupont", "Jean"])).rows[0].id;
    factureId = (await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5) returning id', [artisanId, clientId, "FAC-PAY-1", "envoyee", "240.00"])).rows[0].id;
    paiementId = (await admin.query('insert into paiements_stripe ("factureId","artisanId",montant,"tokenPaiement",statut) values ($1,$2,$3,$4,$5) returning id', [factureId, artisanId, "240.00", TOKEN, "en_attente"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("resolvePaiement : token connu → {paiementId, factureId, artisanId} ; inconnu → null", async () => {
    const r = await writer.resolvePaiement(TOKEN);
    expect(r).toEqual({ paiementId, factureId, artisanId });
    expect(await writer.resolvePaiement("token-inexistant-zzzzzzzzzzzz")).toBeNull();
  });

  it("completeCheckout : facture→payée (montantPaye=TTC, carte) + paiement→payee + notif + transitioned=true", async () => {
    const { transitioned } = await writer.completeCheckout({ artisanId, paiementId, factureId, stripePaymentIntentId: "pi_test_1" });
    expect(transitioned).toBe(true);

    const fac = (await admin.query("select statut, \"montantPaye\", \"modePaiement\" from factures where id=$1", [factureId])).rows[0];
    expect(fac.statut).toBe("payee");
    expect(fac.montantPaye).toBe("240.00");
    expect(fac.modePaiement).toBe("carte");

    const pay = (await admin.query("select statut, \"stripePaymentIntentId\" from paiements_stripe where id=$1", [paiementId])).rows[0];
    expect(pay.statut).toBe("payee");
    expect(pay.stripePaymentIntentId).toBe("pi_test_1");

    const notif = (await admin.query("select type, message from notifications where \"artisanId\"=$1 order by id desc limit 1", [artisanId])).rows[0];
    expect(notif.type).toBe("succes");
    expect(notif.message).toContain("FAC-PAY-1");
    expect(notif.message).toContain("Jean Dupont");
  });

  it("OPE-991 — completeCheckout idempotent : doublon (paiement déjà payee) → transitioned=false, aucune notif supplémentaire", async () => {
    const notifCount = Number((await admin.query("select count(*) from notifications where \"artisanId\"=$1", [artisanId])).rows[0].count);
    const { transitioned } = await writer.completeCheckout({ artisanId, paiementId, factureId, stripePaymentIntentId: "pi_test_doublon" });
    expect(transitioned).toBe(false);
    const notifCountAfter = Number((await admin.query("select count(*) from notifications where \"artisanId\"=$1", [artisanId])).rows[0].count);
    expect(notifCountAfter).toBe(notifCount);
  });

  it("failPaiement : paiement→echouee", async () => {
    await writer.failPaiement({ artisanId, paiementId });
    const pay = (await admin.query("select statut from paiements_stripe where id=$1", [paiementId])).rows[0];
    expect(pay.statut).toBe("echouee");
  });
});
