import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { RegleCategorisationRepositoryDrizzle } from "../../infra/regle-categorisation-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const UA = 9946201;
const UB = 9946202;
let seq = 0;
const motif = () => `MOTIF-${UA}-${++seq}`;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return app.inject({ method: "POST", url: `/api/trpc/${path}`, headers: { "content-type": "application/json", ...(tok ? { cookie: `token=${tok}` } : {}) }, payload: JSON.stringify(input) });
}
function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return app.inject({ method: "GET", url: `/api/trpc/${path}${qs}`, headers: tok ? { cookie: `token=${tok}` } : {} });
}

describe.skipIf(!URL)("reglesCategorisation.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from regles_categorisation where "artisan_id" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      await admin.query('insert into artisans ("userId") values ($1)', [uid]);
    }
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), regleCategorisationRepo: new RegleCategorisationRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → reglesCategorisation.list 401", async () => {
    expect((await q(server, "reglesCategorisation.list", undefined)).statusCode).toBe(401);
  });

  it("create + getById → actif défaut true + mapping snake_case", async () => {
    const tA = await token(UA);
    const created = await mut(server, "reglesCategorisation.create", { motifLibelle: motif(), categorie: "carburant" }, tA);
    expect(created.statusCode).toBe(200);
    const r = created.json().result.data as { id: number; artisanId: number; actif: boolean; categorie: string };
    expect(r.actif).toBe(true);
    expect(r.categorie).toBe("carburant");
    expect((await q(server, "reglesCategorisation.getById", { id: r.id }, tA)).statusCode).toBe(200);
  });

  it("pas d'unicité : 2 créations même (motif, categorie) → 2× 200, ids distincts", async () => {
    const tA = await token(UA);
    const m = motif();
    const r1 = await mut(server, "reglesCategorisation.create", { motifLibelle: m, categorie: "energie" }, tA);
    const r2 = await mut(server, "reglesCategorisation.create", { motifLibelle: m, categorie: "energie" }, tA);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r1.json().result.data.id).not.toBe(r2.json().result.data.id);
  });

  it("validations → 400 : motifLibelle vide, categorie vide", async () => {
    const tA = await token(UA);
    expect((await mut(server, "reglesCategorisation.create", { motifLibelle: "", categorie: "carburant" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "reglesCategorisation.create", { motifLibelle: "ESSENCE", categorie: "" }, tA)).statusCode).toBe(400);
  });

  it("update partiel : actif on/off + champs préservés", async () => {
    const tA = await token(UA);
    const m = motif();
    const id = (await mut(server, "reglesCategorisation.create", { motifLibelle: m, categorie: "carburant" }, tA)).json().result.data.id as number;
    const maj = await mut(server, "reglesCategorisation.update", { id, actif: false }, tA);
    expect(maj.statusCode).toBe(200);
    const r = maj.json().result.data as { actif: boolean; motifLibelle: string; categorie: string };
    expect(r.actif).toBe(false);
    expect(r.motifLibelle).toBe(m); // préservé
    expect(r.categorie).toBe("carburant"); // préservé
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la règle de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await mut(server, "reglesCategorisation.create", { motifLibelle: motif(), categorie: "carburant" }, tA)).json().result.data.id as number;
    expect((await q(server, "reglesCategorisation.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "reglesCategorisation.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "reglesCategorisation.update", { id, actif: false }, tB)).statusCode).toBe(404);
    expect((await mut(server, "reglesCategorisation.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "reglesCategorisation.getById", { id }, tA)).statusCode).toBe(200);
  });

  it("delete OK propriétaire ; id inexistant → 404", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "reglesCategorisation.create", { motifLibelle: motif(), categorie: "carburant" }, tA)).json().result.data.id as number;
    expect((await mut(server, "reglesCategorisation.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await q(server, "reglesCategorisation.getById", { id }, tA)).statusCode).toBe(404);
    expect((await mut(server, "reglesCategorisation.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });
});
