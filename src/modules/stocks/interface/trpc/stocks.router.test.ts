import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { StockRepositoryDrizzle } from "../../infra/stock-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9939001;
const UB = 9939002;

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

describe.skipIf(!URL)("stocks.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from stocks where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), stockRepo: new StockRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId"=$1)', [aId]);
      await admin.query('delete from stocks where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → stocks.list 401", async () => {
    expect((await callQuery(server, "stocks.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "stocks.create", { reference: "REF-1", designation: "Tube", quantiteEnStock: "100" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect(created.json().result.data.quantiteEnStock).toBe("100.00");
    const list = await callQuery(server, "stocks.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((s) => s.id === id)).toBe(true);
  });

  it("validation Zod : reference vide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "stocks.create", { reference: "", designation: "X" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le stock de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "stocks.create", { reference: "SEC", designation: "Secret" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "stocks.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "stocks.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "stocks.update", { id, designation: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "stocks.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "stocks.getById", { id }, tA)).json().result.data.designation).toBe("Secret");
  });

  it("update (métadonnées) ne change pas la quantité ; delete OK propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "stocks.create", { reference: "Q", designation: "Avant", quantiteEnStock: "42" }, tA)).json().result.data.id as number;
    const maj = await callMutation(server, "stocks.update", { id, designation: "Après", emplacement: "Allée 2" }, tA);
    expect(maj.json().result.data.designation).toBe("Après");
    expect(maj.json().result.data.quantiteEnStock).toBe("42.00"); // intacte (pas dans le schéma update)
    expect((await callMutation(server, "stocks.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "stocks.getById", { id }, tA)).statusCode).toBe(404);
  });
});
