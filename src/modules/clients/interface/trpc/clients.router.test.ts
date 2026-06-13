import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ClientRepositoryDrizzle } from "../../infra/client-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9929001;
const UB = 9929002;

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
function callQuery(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return app.inject({ method: "GET", url: `/api/trpc/${path}${qs}`, headers: tok ? { cookie: `token=${tok}` } : {} });
}

describe.skipIf(!URL)("clients.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), clientRepo: new ClientRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from factures where "artisanId"=$1', [aId]);
      await admin.query('delete from devis where "artisanId"=$1', [aId]);
      await admin.query('delete from clients where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → clients.list 401", async () => {
    expect((await callQuery(server, "clients.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "clients.create", { nom: "Durand", email: "marie@a.fr", type: "professionnel" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect(created.json().result.data.type).toBe("professionnel");
    const list = await callQuery(server, "clients.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((c) => c.id === id)).toBe(true);
  });

  it("validation : nom vide → 400 ; e-mail invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "clients.create", { nom: "" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "clients.create", { nom: "X", email: "pas-un-email" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le client de A (PII)", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "clients.create", { nom: "Secret", email: "secret@a.fr" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "clients.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "clients.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "clients.update", { id, nom: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "clients.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "clients.getById", { id }, tA)).json().result.data.email).toBe("secret@a.fr");
  });

  it("update partiel + delete OK propriétaire (sans document lié)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "clients.create", { nom: "Avant", ville: "Lyon" }, tA)).json().result.data.id as number;
    const maj = await callMutation(server, "clients.update", { id, nom: "Après" }, tA);
    expect(maj.json().result.data.nom).toBe("Après");
    expect(maj.json().result.data.ville).toBe("Lyon"); // champ non fourni préservé
    expect((await callMutation(server, "clients.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "clients.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("delete REFUSÉ (409) si le client est référencé par une facture", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "clients.create", { nom: "Référencé" }, tA)).json().result.data.id as number;
    await admin.query(`insert into factures ("artisanId","clientId",numero) values ($1,$2,'F-CLI-1')`, [artisanA, id]);
    expect((await callMutation(server, "clients.delete", { id }, tA)).statusCode).toBe(409);
    // le client est toujours là (intégrité préservée)
    expect((await callQuery(server, "clients.getById", { id }, tA)).statusCode).toBe(200);
  });
});
