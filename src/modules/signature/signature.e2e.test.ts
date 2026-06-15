import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { buildApp } from "../../app";

const URL = process.env.DATABASE_URL;

const UID = 9951041;
const TOKEN = "sige2e-token-9951041-xxxxxxxxxxxxxxxxxxxxxxxx";

// E2E à travers le routeur MONTÉ (`buildApp` → Fastify → tRPC `signature.*`), sans cookie (surface
// PUBLIQUE par token). Prouve que la bascule est servable : getDevisForSignature 200 + signDevis →
// devis `accepte`. NB : DATABASE_URL = superuser (bypasse RLS) → ce test couvre le câblage/parité ;
// l'isolation RLS par token est prouvée séparément (signature-public-*-drizzle.test.ts, app_tenant).
const inputUrl = (proc: string, json: unknown) =>
  `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json } }))}`;

describe.skipIf(!URL)("signature e2e (routeur monté, surface publique par token)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let devisId = 0;

  const cleanup = async () => {
    await admin.query("delete from signatures_devis where token = $1", [TOKEN]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from artisans where "userId" = $1', [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    const artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "E2E"])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "C"])).rows[0].id;
    devisId = (await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4) returning id', [artisanId, clientId, `E2E-${UID}`, "envoye"])).rows[0].id;
    await admin.query('insert into signatures_devis ("devisId",token,"expiresAt") values ($1,$2, now() + interval \'30 days\')', [devisId, TOKEN]);
    app = buildApp();
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getDevisForSignature (token, sans cookie) → 200 + devis", async () => {
    const res = await app.inject({ method: "GET", url: inputUrl("signature.getDevisForSignature", { token: TOKEN }) });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].result.data.json.devis.numero).toBe(`E2E-${UID}`);
  });

  it("token inconnu → 404", async () => {
    const res = await app.inject({ method: "GET", url: inputUrl("signature.getDevisForSignature", { token: "absent-zzzzzzzzzzzzzzzzzzzzzzzzzzzz" }) });
    expect(res.statusCode).toBe(404);
  });

  it("signDevis → 200, devis passe à accepte (immutabilité : 2ᵉ signature → 400)", async () => {
    const body = { "0": { json: { token: TOKEN, signatureData: "data:image/png;base64,AAA", signataireName: "Jean", signataireEmail: "jean@test.com" } } };
    const res = await app.inject({
      method: "POST",
      url: "/api/trpc/signature.signDevis?batch=1",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
      payload: JSON.stringify(body),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].result.data.json.signature.statut).toBe("accepte");
    const { rows } = await admin.query("select statut from devis where id=$1", [devisId]);
    expect(rows[0].statut).toBe("accepte");
    const { rows: sigRows } = await admin.query("select \"ipAddress\" from signatures_devis where token=$1", [TOKEN]);
    expect(sigRows[0].ipAddress).toBe("203.0.113.9");

    // 2ᵉ signature → déjà traité → 400 (immutabilité)
    const res2 = await app.inject({
      method: "POST",
      url: "/api/trpc/signature.signDevis?batch=1",
      headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.1" },
      payload: JSON.stringify(body),
    });
    expect(res2.statusCode).toBe(400);
  });
});
