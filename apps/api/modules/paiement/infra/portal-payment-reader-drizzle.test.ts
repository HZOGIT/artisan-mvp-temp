import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { PortalPaymentReaderDrizzle } from "./portal-payment-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9991141;
const TOKEN = "portaltok-9991141-xxxxxxxxxxxxxxxxxxxxxxxxxx";
const TOKEN_EXPIRED = "portalexp-9991141-xxxxxxxxxxxxxxxxxxxxxxxxxx";

describe.skipIf(!URL)("PortalPaymentReaderDrizzle (accès portail par token sous RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new PortalPaymentReaderDrizzle(app.db);
  let artisanId = 0;
  let clientId = 0;
  let factureId = 0;

  const cleanup = async () => {
    await admin.query('delete from paiements_stripe where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from client_portal_access where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanId = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID])).rows[0].id;
    clientId = (await admin.query('insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id', [artisanId, "Durand", "c@test.com"])).rows[0].id;
    factureId = (await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5) returning id', [artisanId, clientId, "FAC-PAY-S", "envoyee", "240.00"])).rows[0].id;
    await admin.query('insert into client_portal_access ("clientId","artisanId",token,email,"expiresAt","isActive") values ($1,$2,$3,$4, now() + interval \'7 days\', true)', [clientId, artisanId, TOKEN, "c@test.com"]);
    await admin.query('insert into client_portal_access ("clientId","artisanId",token,email,"expiresAt","isActive") values ($1,$2,$3,$4, now() - interval \'1 day\', true)', [clientId, artisanId, TOKEN_EXPIRED, "c@test.com"]);
    await admin.query('insert into paiements_stripe ("factureId","artisanId",montant,"tokenPaiement",statut) values ($1,$2,$3,$4,$5)', [factureId, artisanId, "240.00", "pt-s-1", "en_attente"]);
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const now = () => new Date();

  it("resolveAccessByToken : token actif → {clientId, artisanId} ; expiré → null ; inconnu → null", async () => {
    expect(await reader.resolveAccessByToken(TOKEN, now())).toEqual({ clientId, artisanId });
    expect(await reader.resolveAccessByToken(TOKEN_EXPIRED, now())).toBeNull();
    expect(await reader.resolveAccessByToken("inconnu-zzzzzzzzzzz", now())).toBeNull();
  });

  it("getFactureStatut : facture du tenant lue sous le tenant résolu", async () => {
    const f = await reader.getFactureStatut({ artisanId, userId: 0 }, factureId);
    expect(f?.statut).toBe("envoyee");
    expect(f?.totalTTC).toBe("240.00");
    expect(f?.clientId).toBe(clientId);
  });

  it("getDernierPaiement : dernier paiement de la facture", async () => {
    const p = await reader.getDernierPaiement({ artisanId, userId: 0 }, factureId);
    expect(p?.statut).toBe("en_attente");
  });
});
