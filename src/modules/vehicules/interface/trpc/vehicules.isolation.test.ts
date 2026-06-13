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
const UA = 991301;
const UB = 991302;

const tok = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

describe.skipIf(!URL)("vehicules — isolation cross-tenant systématique (toutes les routes by-id)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;
  let aId = 0;
  let vehiculeDeA = 0;
  let tokenB = "";

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from entretiens_vehicules where "vehiculeId" in (select id from vehicules where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from assurances_vehicules where "vehiculeId" in (select id from vehicules where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from vehicules where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id,email,password,role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    aId = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    await admin.query('insert into artisans ("userId") values ($1)', [UB]);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), vehiculeRepo: new VehiculeRepositoryDrizzle(app.db) });

    // Un véhicule appartenant à A (créé en direct, scopé A).
    const tA = await tok(UA);
    const created = await server.inject({
      method: "POST",
      url: "/api/trpc/vehicules.create",
      headers: { "content-type": "application/json", cookie: `token=${tA}` },
      payload: JSON.stringify({ immatriculation: "ISO-1" }),
    });
    vehiculeDeA = created.json().result.data.id;
    tokenB = await tok(UB);
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) {
      await admin.query('delete from vehicules where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  const post = (path: string, input: unknown) =>
    server.inject({
      method: "POST",
      url: `/api/trpc/${path}`,
      headers: { "content-type": "application/json", cookie: `token=${tokenB}` },
      payload: JSON.stringify(input),
    });
  const get = (path: string, input: unknown) =>
    server.inject({
      method: "GET",
      url: `/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`,
      headers: { cookie: `token=${tokenB}` },
    });

  // Toutes les routes « by-id » du routeur, appelées en tant que B sur la ressource de A.
  // Un refus cross-tenant valide = NOT_FOUND (404). (B a un tenant valide → pas 401.)
  it.each([
    ["query", "vehicules.getById", () => ({ id: vehiculeDeA })],
    ["mutation", "vehicules.update", () => ({ id: vehiculeDeA, data: { marque: "x" } })],
    ["mutation", "vehicules.delete", () => ({ id: vehiculeDeA })],
    ["mutation", "vehicules.updateKilometrage", () => ({ id: vehiculeDeA, kilometrage: 1 })],
    ["query", "vehicules.listEntretiens", () => ({ vehiculeId: vehiculeDeA })],
    ["mutation", "vehicules.addEntretien", () => ({ vehiculeId: vehiculeDeA, data: { type: "vidange", dateEntretien: "2026-06-01" } })],
    ["query", "vehicules.listAssurances", () => ({ vehiculeId: vehiculeDeA })],
    ["mutation", "vehicules.addAssurance", () => ({ vehiculeId: vehiculeDeA, data: { compagnie: "X", dateDebut: "2026-01-01", dateFin: "2026-12-31" } })],
  ] as const)("B → %s %s sur la ressource de A est refusé (404 ou liste vide)", async (kind, path, mkInput) => {
    const res = kind === "query" ? await get(path, mkInput()) : await post(path, mkInput());
    if (path.startsWith("vehicules.list")) {
      // Les list* renvoient [] (le véhicule n'appartient pas à B) → 200 mais vide.
      expect(res.statusCode).toBe(200);
      expect(res.json().result.data).toEqual([]);
    } else {
      expect(res.statusCode).toBe(404);
    }
  });

  it("le véhicule de A reste intact après toutes les tentatives de B", async () => {
    const [row] = (await admin.query('select id, immatriculation from vehicules where id=$1', [vehiculeDeA])).rows;
    expect(row?.immatriculation).toBe("ISO-1");
    expect(row?.id).toBe(vehiculeDeA);
    void aId;
  });
});
