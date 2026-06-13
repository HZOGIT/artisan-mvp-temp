import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { VehiculeRepositoryDrizzle } from "../../infra/vehicule-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9931001;
const UB = 9931002;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

// Appel tRPC mutation via app.inject (POST, body = input direct en v11 non-batché).
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
  return app.inject({
    method: "GET",
    url: `/api/trpc/${path}${qs}`,
    headers: tok ? { cookie: `token=${tok}` } : {},
  });
}

describe.skipIf(!URL)("vehicules.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from vehicules where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), vehiculeRepo: new VehiculeRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from vehicules where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → vehicules.list 401", async () => {
    const res = await callQuery(server, "vehicules.list", undefined);
    expect(res.statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "vehicules.create", { immatriculation: "EE-111-EE", marque: "Peugeot" }, tA);
    expect(created.statusCode).toBe(200);
    const vId = created.json().result.data.id as number;
    expect(vId).toBeGreaterThan(0);

    const list = await callQuery(server, "vehicules.list", undefined, tA);
    expect(list.statusCode).toBe(200);
    expect((list.json().result.data as Array<{ id: number }>).some((v) => v.id === vId)).toBe(true);
  });

  it("isolation cross-tenant : B ne voit pas / ne modifie pas le véhicule de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const created = await callMutation(server, "vehicules.create", { immatriculation: "EE-222-EE" }, tA);
    const vId = created.json().result.data.id as number;

    // B: getById → NOT_FOUND (404)
    const getByB = await callQuery(server, "vehicules.getById", { id: vId }, tB);
    expect(getByB.statusCode).toBe(404);

    // B: list ne contient pas le véhicule de A
    const listB = await callQuery(server, "vehicules.list", undefined, tB);
    expect((listB.json().result.data as Array<{ id: number }>).some((v) => v.id === vId)).toBe(false);

    // B: update → NOT_FOUND
    const updByB = await callMutation(server, "vehicules.update", { id: vId, data: { marque: "hack" } }, tB);
    expect(updByB.statusCode).toBe(404);
  });

  it("validation Zod : immatriculation vide → 400", async () => {
    const tA = await token(UA);
    const res = await callMutation(server, "vehicules.create", { immatriculation: "" }, tA);
    expect(res.statusCode).toBe(400);
  });
});
