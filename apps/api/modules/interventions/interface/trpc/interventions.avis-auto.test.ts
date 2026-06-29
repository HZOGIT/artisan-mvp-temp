import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { InterventionRepositoryDrizzle } from "../../infra/intervention-repository-drizzle";
import { DemandeAvisRepositoryDrizzle } from "../../../avis/infra/demande-avis-repository-drizzle";
import { FakeEmailPort, FakeRateLimiter } from "../../../../shared/ports/fakes";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9930701;
const UB = 9930702;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

/** Attend que la condition soit vraie (fire-and-forget async). */
async function waitFor(condition: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("waitFor timeout");
}

describe.skipIf(!URL)("interventions.avis-auto L3 — envoi automatique à terminee (PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  const email = new FakeEmailPort();
  const rateLimiter = new FakeRateLimiter();
  let artisanA = 0;
  let artisanB = 0;
  let clientAvecEmail = 0;
  let clientSansEmail = 0;
  let interAvecEmail = 0;
  let interSansEmail = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from demandes_avis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from interventions where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query('delete from permissions_utilisateur where "userId"=$1', [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      for (const p of ["interventions.voir", "interventions.gerer"]) {
        await admin.query('insert into permissions_utilisateur ("userId", permission, autorise) values ($1,$2,true)', [uid, p]);
      }
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    clientAvecEmail = (await admin.query('insert into clients ("artisanId", nom, email) values ($1,$2,$3) returning id', [artisanA, "Client Email", "client@test.fr"])).rows[0].id;
    clientSansEmail = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Sans Email"])).rows[0].id;
    interAvecEmail = (await admin.query(
      'insert into interventions ("artisanId","clientId",titre,"dateDebut",statut) values ($1,$2,$3,now(),$4) returning id',
      [artisanA, clientAvecEmail, "Inter avec email", "planifiee"],
    )).rows[0].id;
    interSansEmail = (await admin.query(
      'insert into interventions ("artisanId","clientId",titre,"dateDebut",statut) values ($1,$2,$3,now(),$4) returning id',
      [artisanA, clientSansEmail, "Inter sans email", "planifiee"],
    )).rows[0].id;

    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(appDb.db),
      interventionRepo: new InterventionRepositoryDrizzle(appDb.db),
      interventionsDb: appDb.db,
      demandeAvisRepo: new DemandeAvisRepositoryDrizzle(appDb.db),
      avisDb: appDb.db,
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
      await admin.query('delete from permissions_utilisateur where "userId"=$1', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await appDb.close();
    await admin.end();
  });

  it("statut → terminee : crée exactement 1 demande_avis + email envoyé + drapeau posé", async () => {
    const tA = await token(UA);
    const before = email.sent.length;

    const res = await callMutation(server, "interventions.update", { id: interAvecEmail, statut: "terminee" }, tA);
    expect(res.statusCode).toBe(200);

    await waitFor(async () => {
      const { rows } = await admin.query('select count(*)::int as n from demandes_avis where "artisanId"=$1 and "interventionId"=$2', [artisanA, interAvecEmail]);
      return rows[0].n > 0 && email.sent.length > before;
    });

    const { rows: demandes } = await admin.query(
      'select * from demandes_avis where "artisanId"=$1 and "interventionId"=$2',
      [artisanA, interAvecEmail],
    );
    expect(demandes.length).toBe(1);
    expect(email.sent.length).toBe(before + 1);
    expect(email.sent[email.sent.length - 1].to).toBe("client@test.fr");

    const { rows: inter } = await admin.query('select "avisDemandeEnvoye" from interventions where id=$1', [interAvecEmail]);
    expect(inter[0].avisDemandeEnvoye).toBe(true);
  });

  it("idempotence : 2e passage à terminee → toujours 1 demande, pas de 2e email", async () => {
    const tA = await token(UA);
    const beforeEmail = email.sent.length;

    const res = await callMutation(server, "interventions.update", { id: interAvecEmail, statut: "terminee" }, tA);
    expect(res.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 200));

    const { rows: demandes } = await admin.query(
      'select count(*)::int as n from demandes_avis where "artisanId"=$1 and "interventionId"=$2',
      [artisanA, interAvecEmail],
    );
    expect(demandes[0].n).toBe(1);
    expect(email.sent.length).toBe(beforeEmail);
  });

  it("client sans email : terminee sans email → pas de demande, pas de plantage", async () => {
    const tA = await token(UA);
    const beforeEmail = email.sent.length;

    const res = await callMutation(server, "interventions.update", { id: interSansEmail, statut: "terminee" }, tA);
    expect(res.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 200));

    const { rows: demandes } = await admin.query(
      'select count(*)::int as n from demandes_avis where "artisanId"=$1 and "interventionId"=$2',
      [artisanA, interSansEmail],
    );
    expect(demandes[0].n).toBe(0);
    expect(email.sent.length).toBe(beforeEmail);
  });

  it("RLS tenant : artisan B ne peut pas toucher l'intervention de A", async () => {
    const tB = await token(UB);
    const res = await callMutation(server, "interventions.update", { id: interAvecEmail, statut: "terminee" }, tB);
    expect(res.statusCode).toBe(404);
  });
});
