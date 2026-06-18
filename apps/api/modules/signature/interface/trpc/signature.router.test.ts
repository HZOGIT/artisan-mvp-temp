import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeEmailPort } from "../../../../shared/ports/fakes";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9938091;
const TOKEN_REFUSE = "sigrt-refuse-9938091-xxxxxxxxxxxxxxxxxxxxxx";

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `signature.*`) — COMPLÈTE la colonne signature. ⚠️ Ne duplique PAS
// `signature.e2e.test.ts` (qui couvre déjà getDevisForSignature + signDevis) : ici on cible la
// surface ARTISAN protégée (createSignatureLink/getSignatureByDevis + garde 401) et refuseDevis.
describe.skipIf(!URL)("signature.router e2e (admin protégé + refuseDevis public)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let devisForLink = 0;
  let devisForRefuse = 0;

  const cleanup = async () => {
    await admin.query('delete from signatures_devis where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [UID]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, `u${UID}@t.fr`]);
    const artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "Sig E2E"])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id', [artisanId, "Durand", "c@test.com"])).rows[0].id;
    devisForLink = (await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4) returning id', [artisanId, clientId, "DEV-LINK", "envoye"])).rows[0].id;
    devisForRefuse = (await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4) returning id', [artisanId, clientId, "DEV-REF", "envoye"])).rows[0].id;
    await admin.query('insert into signatures_devis ("devisId",token,"expiresAt") values ($1,$2, now() + interval \'30 days\')', [devisForRefuse, TOKEN_REFUSE]);
    app = buildApp({ jwtSecret: SECRET, emailPort: new FakeEmailPort() });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  // ── Surface ARTISAN (protégée) ──
  it("createSignatureLink / getSignatureByDevis sans cookie → 401", async () => {
    expect((await injectTrpc(app, "POST", "signature.createSignatureLink", { devisId: devisForLink })).statusCode).toBe(401);
    expect((await injectTrpc(app, "GET", "signature.getSignatureByDevis", { devisId: devisForLink })).statusCode).toBe(401);
  });

  it("createSignatureLink (cookie) → 200 + token ; idempotent (2ᵉ appel = même token)", async () => {
    const tok = await jwt(UID);
    const r1 = await injectTrpc(app, "POST", "signature.createSignatureLink", { devisId: devisForLink }, tok);
    expect(r1.statusCode).toBe(200);
    const t1 = r1.json().result.data.token as string;
    expect(typeof t1).toBe("string");
    const r2 = await injectTrpc(app, "POST", "signature.createSignatureLink", { devisId: devisForLink }, tok);
    expect(r2.json().result.data.token).toBe(t1); // idempotent
  });

  it("getSignatureByDevis (cookie) → renvoie la signature du devis", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "GET", "signature.getSignatureByDevis", { devisId: devisForLink }, tok);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data?.devisId).toBe(devisForLink);
  });

  // ── refuseDevis (public par token) ──
  it("refuseDevis (token) → 200, devis refusé ; 2ᵉ refus → 400 (immutabilité)", async () => {
    const r1 = await injectTrpc(app, "POST", "signature.refuseDevis", { token: TOKEN_REFUSE, motifRefus: "Trop cher" });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().result.data.signature.statut).toBe("refuse");
    const { rows } = await admin.query("select statut from devis where id=$1", [devisForRefuse]);
    expect(rows[0].statut).toBe("refuse");
    // déjà traité → 400
    expect((await injectTrpc(app, "POST", "signature.refuseDevis", { token: TOKEN_REFUSE })).statusCode).toBe(400);
  });

  it("refuseDevis : token inconnu → 404", async () => {
    expect((await injectTrpc(app, "POST", "signature.refuseDevis", { token: "inconnu-zzzzzzzzzzzzzzzzzzzzzzzzzzzz" })).statusCode).toBe(404);
  });
});
