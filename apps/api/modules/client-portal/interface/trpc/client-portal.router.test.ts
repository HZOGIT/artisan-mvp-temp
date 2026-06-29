import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeEmailPort } from "../../../../shared/ports/fakes";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9937081;
const TOKEN = "cp-token-9937081-xxxxxxxxxxxxxxxxxxxxxxxx";

const token = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `clientPortal.*`). Surface ADMIN par cookie + surface PUBLIQUE par token (capacité,
// sans cookie). DATABASE_URL = superuser (bypasse RLS) → couvre le câblage/contrats ; l'isolation RLS est
// prouvée séparément (portal-*-drizzle.test.ts, app_tenant).
describe.skipIf(!URL)("clientPortal.router e2e (admin cookie + public token)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let artisanId = 0;
  let clientId = 0;

  const cleanup = async () => {
    await admin.query('delete from client_portal_access where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, `u${UID}@t.fr`]);
    artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "Portail E2E"])).rows[0].id;
    clientId = (await admin.query('insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id', [artisanId, "Durand", "c@test.com"])).rows[0].id;
    await admin.query('insert into devis ("artisanId","clientId",numero,"totalTTC",statut) values ($1,$2,$3,$4,$5)', [artisanId, clientId, "DEV-CP1", "500.00", "envoye"]);
    await admin.query('insert into client_portal_access ("clientId","artisanId",token,email,"expiresAt","isActive") values ($1,$2,$3,$4, now() + interval \'30 days\', true)', [clientId, artisanId, TOKEN, "c@test.com"]);
    // emailPort fake : `generateAccess` envoie un email d'accès → on évite l'adaptateur réel (non configuré en test).
    app = buildApp({ jwtSecret: SECRET, emailPort: new FakeEmailPort() });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  // ── PUBLIC (token, sans cookie) ──
  it("verifyAccess : token valide → valid:true + client ; token inconnu → valid:false", async () => {
    const ok = await injectTrpc(app, "GET", "clientPortal.verifyAccess", { token: TOKEN });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().result.data.valid).toBe(true);
    expect(ok.json().result.data.client?.nom).toBe("Durand");
    const ko = await injectTrpc(app, "GET", "clientPortal.verifyAccess", { token: "inconnu-zzzzzzzzzzzzzzzzzzzzzzzzzzzz" });
    expect(ko.statusCode).toBe(200);
    expect(ko.json().result.data.valid).toBe(false);
  });

  it("getDevis (public) : token valide → liste des devis du client", async () => {
    const res = await injectTrpc(app, "GET", "clientPortal.getDevis", { token: TOKEN });
    expect(res.statusCode).toBe(200);
    const rows = res.json().result.data as Array<{ numero: string }>;
    expect(rows.some((d) => d.numero === "DEV-CP1")).toBe(true);
  });

  it("getDevis (public) : token inconnu → 401 (capacité requise)", async () => {
    const res = await injectTrpc(app, "GET", "clientPortal.getDevis", { token: "inconnu-zzzzzzzzzzzzzzzzzzzzzzzzzzzz" });
    expect(res.statusCode).toBe(401);
  });

  it("verifyAccess : token vide → 400 (BAD_REQUEST Zod)", async () => {
    const res = await injectTrpc(app, "GET", "clientPortal.verifyAccess", { token: "" });
    expect(res.statusCode).toBe(400);
  });

  it("verifyAccess : token > 128 chars → 400 (BAD_REQUEST Zod)", async () => {
    const res = await injectTrpc(app, "GET", "clientPortal.verifyAccess", { token: "a".repeat(129) });
    expect(res.statusCode).toBe(400);
  });

  it("getDevis (public) : token vide → 400 (BAD_REQUEST Zod)", async () => {
    const res = await injectTrpc(app, "GET", "clientPortal.getDevis", { token: "" });
    expect(res.statusCode).toBe(400);
  });

  it("getDevis (public) : token > 128 chars → 400 (BAD_REQUEST Zod)", async () => {
    const res = await injectTrpc(app, "GET", "clientPortal.getDevis", { token: "b".repeat(200) });
    expect(res.statusCode).toBe(400);
  });

  // ── ADMIN (cookie artisan) ──
  it("generateAccess sans cookie → 401 (procédure protégée)", async () => {
    const res = await injectTrpc(app, "POST", "clientPortal.generateAccess", { clientId });
    expect(res.statusCode).toBe(401);
  });

  it("generateAccess avec cookie → 200, puis getStatus actif", async () => {
    const tok = await token(UID);
    const gen = await injectTrpc(app, "POST", "clientPortal.generateAccess", { clientId }, tok);
    expect(gen.statusCode).toBe(200);
    const st = await injectTrpc(app, "GET", "clientPortal.getStatus", { clientId }, tok);
    expect(st.statusCode).toBe(200);
    expect(st.json().result.data?.actif).toBe(true);
  });
});
