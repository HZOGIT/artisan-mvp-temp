import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { InterventionRepositoryDrizzle } from "../../infra/intervention-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9919001;
const UB = 9919002;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}
function callQuery(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
}

describe.skipIf(!URL)("interventions.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from interventions where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
    await admin.query('delete from permissions_utilisateur where "userId"=$1', [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      for (const __p of ["interventions.voir", "interventions.gerer"]) await admin.query('insert into permissions_utilisateur ("userId", permission, autorise) values ($1,$2,true)', [uid, __p]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "Client B"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), interventionRepo: new InterventionRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → interventions.list 401", async () => {
    expect((await callQuery(server, "interventions.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "interventions.create", { clientId: clientA, titre: "Pose chaudière", dateDebut: "2026-06-10T08:00:00Z" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect(created.json().result.data.statut).toBe("planifiee");
    const list = await callQuery(server, "interventions.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((x) => x.id === id)).toBe(true);
  });

  it("validation : titre vide → 400 ; date invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "interventions.create", { clientId: clientA, titre: "", dateDebut: "2026-06-10T08:00:00Z" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "interventions.create", { clientId: clientA, titre: "X", dateDebut: "pas-une-date" }, tA)).statusCode).toBe(400);
  });

  it("ANTI-IDOR-FK : create avec un clientId d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "interventions.create", { clientId: clientB, titre: "Vol", dateDebut: "2026-06-10T08:00:00Z" }, tA)).statusCode).toBe(404);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas l'intervention de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "interventions.create", { clientId: clientA, titre: "Secret", dateDebut: "2026-06-11T09:00:00Z" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "interventions.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "interventions.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "interventions.update", { id, titre: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "interventions.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "interventions.getById", { id }, tA)).json().result.data.titre).toBe("Secret");
  });

  it("update partiel + delete OK propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "interventions.create", { clientId: clientA, titre: "Avant", dateDebut: "2026-06-12T10:00:00Z", adresse: "1 rue A" }, tA)).json().result.data.id as number;
    const maj = await callMutation(server, "interventions.update", { id, titre: "Après", statut: "en_cours" }, tA);
    expect(maj.json().result.data.titre).toBe("Après");
    expect(maj.json().result.data.statut).toBe("en_cours");
    expect(maj.json().result.data.adresse).toBe("1 rue A"); // préservé
    expect((await callMutation(server, "interventions.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "interventions.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("id inexistant du même tenant : getById / update / delete → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "interventions.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "interventions.update", { id: 999999999, titre: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "interventions.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : titre > 255, adresse > 500, statut invalide → 400", async () => {
    const tA = await token(UA);
    const base = { clientId: clientA, dateDebut: "2026-06-10T08:00:00Z" };
    expect((await callMutation(server, "interventions.create", { ...base, titre: "x".repeat(256) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "interventions.create", { ...base, titre: "OK", adresse: "x".repeat(501) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "interventions.create", { ...base, titre: "OK", statut: "inconnu" }, tA)).statusCode).toBe(400);
  });

  it("ANTI-IDOR-FK étendu : create avec un technicienId d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    // technicien appartenant à B
    const techB = (await admin.query('insert into techniciens ("artisanId",nom) values ($1,$2) returning id', [artisanB, "TechB"])).rows[0].id as number;
    expect((await callMutation(server, "interventions.create", { clientId: clientA, titre: "Vol tech", dateDebut: "2026-06-10T08:00:00Z", technicienId: techB }, tA)).statusCode).toBe(404);
    await admin.query('delete from techniciens where id=$1', [techB]);
  });

  it("update qui (re)lie un technicienId hors tenant → 404", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "interventions.create", { clientId: clientA, titre: "Aff", dateDebut: "2026-06-10T08:00:00Z" }, tA)).json().result.data.id as number;
    const techB = (await admin.query('insert into techniciens ("artisanId",nom) values ($1,$2) returning id', [artisanB, "TechB2"])).rows[0].id as number;
    expect((await callMutation(server, "interventions.update", { id, technicienId: techB }, tA)).statusCode).toBe(404);
    await admin.query('delete from techniciens where id=$1', [techB]);
  });

  it("garde de transition : terminee → planifiee refusé (400) ; planifiee → en_cours OK", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "interventions.create", { clientId: clientA, titre: "Transition", dateDebut: "2026-06-14T08:00:00Z" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "interventions.update", { id, statut: "en_cours" }, tA)).statusCode).toBe(200);
    expect((await callMutation(server, "interventions.update", { id, statut: "terminee" }, tA)).statusCode).toBe(200);
    expect((await callMutation(server, "interventions.update", { id, statut: "planifiee" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "interventions.update", { id, statut: "annulee" }, tA)).statusCode).toBe(400);
  });

  it("update : dateFin < dateDebut (fournies ensemble) → 400", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "interventions.create", { clientId: clientA, titre: "Dates", dateDebut: "2026-06-10T08:00:00Z" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "interventions.update", { id, dateDebut: "2026-06-12T10:00:00Z", dateFin: "2026-06-11T10:00:00Z" }, tA)).statusCode).toBe(400);
  });
});
