import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { buildApp } from "../../app";
import { FakeStripePort } from "../../shared/ports/stripe-adapter";

const URL = process.env.DATABASE_URL;
const UID = 9991151;
const TOKEN = "payroute-9991151-xxxxxxxxxxxxxxxxxxxxxxxxxxx";

// E2E `GET /api/paiement/status/:factureId?token=…` via le routeur MONTÉ (public par token portail).
describe.skipIf(!URL)("GET /api/paiement/status/:factureId (public par token portail)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  const stripe = new FakeStripePort();
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
    const artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "Plomberie X"])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id', [artisanId, "Durand", "c@test.com"])).rows[0].id;
    factureId = (await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5) returning id', [artisanId, clientId, "FAC-R", "envoyee", "240.00"])).rows[0].id;
    await admin.query('insert into client_portal_access ("clientId","artisanId",token,email,"expiresAt","isActive") values ($1,$2,$3,$4, now() + interval \'7 days\', true)', [clientId, artisanId, TOKEN, "c@test.com"]);
    app = buildApp({ stripePort: stripe });
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("sans token → 400", async () => {
    const res = await app.inject({ method: "GET", url: `/api/paiement/status/${factureId}` });
    expect(res.statusCode).toBe(400);
  });

  it("token inconnu → 403", async () => {
    const res = await app.inject({ method: "GET", url: `/api/paiement/status/${factureId}?token=absent-zzzzzzzz` });
    expect(res.statusCode).toBe(403);
  });

  it("token valide → 200 + statut facture", async () => {
    const res = await app.inject({ method: "GET", url: `/api/paiement/status/${factureId}?token=${TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ factureId, statutFacture: "envoyee", montantTTC: "240.00" });
  });

  it("create-checkout-session : body incomplet → 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/paiement/create-checkout-session", headers: { "content-type": "application/json" }, payload: JSON.stringify({ factureId }) });
    expect(res.statusCode).toBe(400);
  });

  it("create-checkout-session : token inconnu → 403", async () => {
    const res = await app.inject({ method: "POST", url: "/api/paiement/create-checkout-session", headers: { "content-type": "application/json" }, payload: JSON.stringify({ factureId, token: "absent-zzzzzzzz" }) });
    expect(res.statusCode).toBe(403);
  });

  it("create-checkout-session : facture payable → 200 {url} + ligne paiement en_attente créée", async () => {
    const res = await app.inject({ method: "POST", url: "/api/paiement/create-checkout-session", headers: { "content-type": "application/json" }, payload: JSON.stringify({ factureId, token: TOKEN }) });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain("checkout.stripe.test");
    const { rows } = await admin.query("select statut, \"tokenPaiement\" from paiements_stripe where \"factureId\"=$1 order by id desc limit 1", [factureId]);
    expect(rows[0].statut).toBe("en_attente");
    expect(rows[0].tokenPaiement).toHaveLength(32);
  });

  it("origin des redirections Stripe : x-forwarded-host (hôte PUBLIC) prime sur host (hôte interne proxy)", async () => {
    // Régression : derrière le dispatcher Pages, `host` = hôte INTERNE du new-stack ; bâtir la
    // redirection dessus renvoie l'utilisateur vers le BACKEND (→ 404 sur /portail/*). Le dispatcher
    // pose `x-forwarded-host` = hôte public d'origine → c'est lui qui DOIT déterminer l'origin.
    const before = stripe.invoiceCheckouts.length;
    const res = await app.inject({
      method: "POST",
      url: "/api/paiement/create-checkout-session",
      headers: {
        "content-type": "application/json",
        host: "staging-newstack.operioz.com", // hôte interne (posé par fetch côté dispatcher)
        "x-forwarded-host": "staging.operioz.com", // hôte public (posé par le dispatcher)
        "x-forwarded-proto": "https",
      },
      payload: JSON.stringify({ factureId, token: TOKEN }),
    });
    expect(res.statusCode).toBe(200);
    const captured = stripe.invoiceCheckouts[stripe.invoiceCheckouts.length - 1];
    expect(stripe.invoiceCheckouts.length).toBe(before + 1);
    expect(captured.origin).toBe("https://staging.operioz.com");
    expect(captured.origin).not.toContain("newstack");
  });
});
