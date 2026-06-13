import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { AvisRepositoryDrizzle } from "../../infra/avis-repository-drizzle";
import { DemandeAvisRepositoryDrizzle } from "../../infra/demande-avis-repository-drizzle";
import { FakeEmailPort, FakeRateLimiter } from "../../../../shared/ports/fakes";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9933001;
const UB = 9933002;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return app.inject({
    method: "POST",
    url: `/api/trpc/${path}`,
    headers: { "content-type": "application/json", ...(tok ? { cookie: `token=${tok}` } : {}) },
    payload: JSON.stringify(input),
  });
}

describe.skipIf(!URL)("avis.envoyerDemande e2e (workflow PG : ownership tenant + RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const email = new FakeEmailPort();
  const rateLimiter = new FakeRateLimiter();
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientSansEmail = 0;
  let interA = 0;
  let interSansEmail = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from demandes_avis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from interventions where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId", nom, email) values ($1,$2,$3) returning id', [artisanA, "Client A", "a@a.fr"])).rows[0].id;
    clientSansEmail = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Sans Email"])).rows[0].id;
    interA = (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,now()) returning id', [artisanA, clientA, "Inter A"])).rows[0].id;
    interSansEmail = (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,now()) returning id', [artisanA, clientSansEmail, "Inter sans email"])).rows[0].id;

    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(app.db),
      avisRepo: new AvisRepositoryDrizzle(app.db),
      demandeAvisRepo: new DemandeAvisRepositoryDrizzle(app.db),
      emailPort: email,
      rateLimiter,
      lienBaseUrl: "https://test.operioz.com",
    });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from demandes_avis where "artisanId"=$1', [aId]);
      await admin.query('delete from interventions where "artisanId"=$1', [aId]);
      await admin.query('delete from clients where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("envoyerDemande OK : crée la demande + envoie 1 email (ownership tenant A)", async () => {
    const tA = await token(UA);
    const res = await callMutation(server, "avis.envoyerDemande", { interventionId: interA }, tA);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data.interventionId).toBe(interA);
    expect(email.sent.some((m) => m.to === "a@a.fr" && m.body.includes("https://test.operioz.com/avis/"))).toBe(true);
    // la demande est bien persistée pour A
    const { rows } = await admin.query('select count(*)::int as n from demandes_avis where "artisanId"=$1 and "interventionId"=$2', [artisanA, interA]);
    expect(rows[0].n).toBe(1);
  });

  it("isolation : B envoie sur l'intervention de A → 404 (anti-oracle), aucun envoi", async () => {
    const before = email.sent.length;
    const tB = await token(UB);
    const res = await callMutation(server, "avis.envoyerDemande", { interventionId: interA }, tB);
    expect(res.statusCode).toBe(404);
    expect(email.sent.length).toBe(before);
  });

  it("client sans email → 400, aucun envoi", async () => {
    const before = email.sent.length;
    const tA = await token(UA);
    const res = await callMutation(server, "avis.envoyerDemande", { interventionId: interSansEmail }, tA);
    expect(res.statusCode).toBe(400);
    expect(email.sent.length).toBe(before);
  });

  it("envoyerDemandeParClient OK : dernière intervention du client", async () => {
    const tA = await token(UA);
    const res = await callMutation(server, "avis.envoyerDemandeParClient", { clientId: clientA }, tA);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data.clientId).toBe(clientA);
  });

  it("rate limit atteint → 429", async () => {
    rateLimiter.denyKey(`avis:${artisanA}`);
    const tA = await token(UA);
    const res = await callMutation(server, "avis.envoyerDemande", { interventionId: interA }, tA);
    expect(res.statusCode).toBe(429);
  });
});
