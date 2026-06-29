import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeEmailPort } from "../../../../shared/ports/fakes";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID_OPT = 9937082;
const TOKEN_OPT = "cp-token-options-xxxxxxxxxxxxxxxxxxxxxxxx";
const TOKEN_OTHER = "cp-token-other-xxxxxxxxxxxxxxxxxxxxxxxxx";

const token = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

/**
 * L3 e2e (HTTP → tRPC `clientPortal.listerOptionsDevis` + `selectionnerOption`).
 * DATABASE_URL = superuser (bypasse RLS) → câblage + contrats ; isolation RLS validée par
 * l'anti-IDOR clientId (un token autre client ne peut pas sélectionner).
 */
describe.skipIf(!URL)("clientPortal options portail (listerOptionsDevis + selectionnerOption)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let artisanId = 0;
  let clientId = 0;
  let otherClientId = 0;
  let devisId = 0;
  let optionId = 0;

  const cleanup = async () => {
    await admin.query('delete from devis_options where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [UID_OPT]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [UID_OPT]);
    await admin.query('delete from client_portal_access where "artisanId" in (select id from artisans where "userId"=$1)', [UID_OPT]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID_OPT]);
    await admin.query('delete from artisans where "userId"=$1', [UID_OPT]);
    await admin.query("delete from users where id=$1", [UID_OPT]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID_OPT, `u${UID_OPT}@t.fr`]);
    artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_OPT, "Options E2E"])).rows[0].id;
    clientId = (await admin.query('insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id', [artisanId, "Dupont", "d@test.com"])).rows[0].id;
    otherClientId = (await admin.query('insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id', [artisanId, "Martin", "m@test.com"])).rows[0].id;
    devisId = (await admin.query('insert into devis ("artisanId","clientId",numero,"totalTTC",statut) values ($1,$2,$3,$4,$5) returning id', [artisanId, clientId, "DEV-OPT1", "500.00", "envoye"])).rows[0].id;
    optionId = (await admin.query('insert into devis_options ("devisId",nom,ordre,"totalHT","totalTTC",recommandee,selectionnee) values ($1,$2,$3,$4,$5,$6,$7) returning id', [devisId, "Standard", 1, "400.00", "480.00", false, false])).rows[0].id;
    await admin.query('insert into devis_options ("devisId",nom,ordre,"totalHT","totalTTC",recommandee,selectionnee) values ($1,$2,$3,$4,$5,$6,$7)', [devisId, "Premium", 2, "600.00", "720.00", true, false]);
    await admin.query('insert into client_portal_access ("clientId","artisanId",token,email,"expiresAt","isActive") values ($1,$2,$3,$4, now() + interval \'30 days\', true)', [clientId, artisanId, TOKEN_OPT, "d@test.com"]);
    await admin.query('insert into client_portal_access ("clientId","artisanId",token,email,"expiresAt","isActive") values ($1,$2,$3,$4, now() + interval \'30 days\', true)', [otherClientId, artisanId, TOKEN_OTHER, "m@test.com"]);
    app = buildApp({ jwtSecret: SECRET, emailPort: new FakeEmailPort() });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("listerOptionsDevis : token valide + devisId du client → liste des options", async () => {
    const res = await injectTrpc(app, "GET", "clientPortal.listerOptionsDevis", { token: TOKEN_OPT, devisId });
    expect(res.statusCode).toBe(200);
    const opts = res.json().result.data as Array<{ nom: string; recommandee: boolean }>;
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts.some((o) => o.nom === "Standard")).toBe(true);
    expect(opts.some((o) => o.recommandee && o.nom === "Premium")).toBe(true);
  });

  it("listerOptionsDevis : token invalide → 401", async () => {
    const res = await injectTrpc(app, "GET", "clientPortal.listerOptionsDevis", { token: "inconnu-zzz", devisId });
    expect(res.statusCode).toBe(401);
  });

  it("listerOptionsDevis : autre client (IDOR) → liste vide (devis ne lui appartient pas)", async () => {
    const res = await injectTrpc(app, "GET", "clientPortal.listerOptionsDevis", { token: TOKEN_OTHER, devisId });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data).toEqual([]);
  });

  it("selectionnerOption : sélection persiste (lecture après écriture)", async () => {
    const sel = await injectTrpc(app, "POST", "clientPortal.selectionnerOption", { token: TOKEN_OPT, optionId });
    expect(sel.statusCode).toBe(200);
    expect(sel.json().result.data.success).toBe(true);

    const read = await injectTrpc(app, "GET", "clientPortal.listerOptionsDevis", { token: TOKEN_OPT, devisId });
    const opts = read.json().result.data as Array<{ id: number; selectionnee: boolean }>;
    expect(opts.find((o) => o.id === optionId)?.selectionnee).toBe(true);
  });

  it("selectionnerOption : autre client ne peut pas sélectionner (anti-IDOR → 404)", async () => {
    const res = await injectTrpc(app, "POST", "clientPortal.selectionnerOption", { token: TOKEN_OTHER, optionId });
    expect(res.statusCode).toBe(404);
  });
});
