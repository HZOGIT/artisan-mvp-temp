import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient, withTenant } from "../../../shared/db";
import { paiementsStripe } from "../../../../../drizzle/schema.pg";
import { PortalPaymentWriterDrizzle } from "./portal-payment-writer-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9966371;
const UID_B = 9966372;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : écriture `paiements_stripe` (ouverture Checkout) via withTenant(artisanId forcé du contexte).
// Vérifie la persistance (statut en_attente, artisanId du ctx) + l'isolation RLS en lecture cross-tenant.
describe.skipIf(!URL)("PortalPaymentWriterDrizzle (RLS écriture paiements_stripe)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const writer = new PortalPaymentWriterDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let factureA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    await admin.query('delete from paiements_stripe where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Pay A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Pay B"])).rows[0].id;
    const clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "C"])).rows[0].id;
    factureA = (await admin.query('insert into factures ("artisanId","clientId",numero,"totalTTC",statut) values ($1,$2,$3,$4,$5) returning id', [artisanA, clientA, "PAY-A", "120.00", "envoyee"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("createPaiement : insère une ligne en_attente scopée à l'artisan du contexte", async () => {
    await writer.createPaiement(ctx(artisanA), { factureId: factureA, stripeSessionId: "cs_test_1", montant: "120.00", lienPaiement: "https://pay/x", tokenPaiement: "tok-9966371" });
    const { rows } = await admin.query('select "artisanId", statut, montant, "tokenPaiement" from paiements_stripe where "factureId"=$1', [factureA]);
    expect(rows).toHaveLength(1);
    expect(rows[0].artisanId).toBe(artisanA);
    expect(rows[0].statut).toBe("en_attente");
    expect(rows[0].tokenPaiement).toBe("tok-9966371");
  });

  it("isolation RLS : l'artisan B ne voit PAS le paiement de A ; A le voit", async () => {
    const seenByB = await withTenant(app.db, ctx(artisanB), (tx) =>
      tx.select().from(paiementsStripe).where(eq(paiementsStripe.factureId, factureA)),
    );
    expect(seenByB).toEqual([]);
    const seenByA = await withTenant(app.db, ctx(artisanA), (tx) =>
      tx.select().from(paiementsStripe).where(and(eq(paiementsStripe.factureId, factureA), eq(paiementsStripe.artisanId, artisanA))),
    );
    expect(seenByA.length).toBe(1);
  });
});
