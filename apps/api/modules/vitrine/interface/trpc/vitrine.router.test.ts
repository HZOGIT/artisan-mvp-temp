import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9964351;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `vitrine.*`) : surface PUBLIQUE (getBySlug/submitContact, sans cookie) + ADMIN
// leads (getDemandesContact/updateStatut/convertir, protégée).
describe.skipIf(!URL)("vitrine.router e2e (public + admin leads)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from avis_clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from interventions where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from parametres_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  const SLUG = "vitrine-sarl-9964351";

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    const artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise",slug) values ($1,$2,$3) returning id', [UID, "Vitrine SARL", SLUG])).rows[0].id;
    await admin.query('insert into parametres_artisan ("artisanId","vitrineActive","vitrineDescription") values ($1,true,$2)', [artisanId, "Artisan vitrine"]);
    const clientId = (await admin.query('insert into clients ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [artisanId, "Client", "Test"])).rows[0].id;
    const iId = (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut",statut) values ($1,$2,$3,$4,$5) returning id', [artisanId, clientId, "Réparation", "2026-06-01T08:00:00Z", "terminee"])).rows[0].id;
    await admin.query('insert into avis_clients ("artisanId","clientId","interventionId",note,statut) values ($1,$2,$3,5,$4)', [artisanId, clientId, iId, "publie"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("ADMIN getDemandesContact sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "vitrine.getDemandesContact", undefined)).statusCode).toBe(401);
  });

  it("getDemandesContact (cookie) → 200, tableau (aucun lead → [])", async () => {
    const res = await injectTrpc(app, "GET", "vitrine.getDemandesContact", undefined, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result.data)).toBe(true);
  });

  it("PUBLIC submitContact : validation (message < 10 / email invalide) → 400 (sans cookie)", async () => {
    const base = { slug: "vitrine-sarl", nom: "Jean", email: "jean@example.com", message: "Bonjour je suis intéressé." };
    expect((await injectTrpc(app, "POST", "vitrine.submitContact", { ...base, message: "court" })).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "vitrine.submitContact", { ...base, email: "pas-un-email" })).statusCode).toBe(400);
  });

  it("ADMIN updateDemandeContactStatut : sans cookie → 401 ; statut hors enum → 400", async () => {
    expect((await injectTrpc(app, "POST", "vitrine.updateDemandeContactStatut", { id: 1, statut: "nouveau" })).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "vitrine.updateDemandeContactStatut", { id: 1, statut: "archive" }, await jwt(UID))).statusCode).toBe(400);
  });

  // getBySlug — endpoint PUBLIC (sans cookie), contrat consommé par la page Vitrine du SPA.
  it("PUBLIC getBySlug : vitrine active → 200 + payload agrégé (artisan/vitrine/avis/stats)", async () => {
    const res = await injectTrpc(app, "GET", "vitrine.getBySlug", { slug: SLUG }); // pas de cookie
    expect(res.statusCode).toBe(200);
    const data = res.json().result.data as { artisan: { nomEntreprise: string }; vitrine: unknown; avis: { interventionId: number | null; createdAt: string }[]; avisStats: unknown; publicStats: unknown };
    expect(data.artisan.nomEntreprise).toBe("Vitrine SARL");
    expect(data.vitrine).toBeTruthy();
    expect(Array.isArray(data.avis)).toBe(true);
    expect(data).toHaveProperty("avisStats");
    expect(data).toHaveProperty("publicStats");
    // L111-7-2 : badge vérifié (interventionId présent) + date
    expect(data.avis).toHaveLength(1);
    expect(data.avis[0].interventionId).toBeTypeOf("number");
    expect(data.avis[0].createdAt).toBeTruthy();
  });

  it("PUBLIC getBySlug : slug inconnu → 404 (NOT_FOUND)", async () => {
    const res = await injectTrpc(app, "GET", "vitrine.getBySlug", { slug: "slug-inexistant-zzz" });
    expect(res.statusCode).toBe(404);
  });
});
