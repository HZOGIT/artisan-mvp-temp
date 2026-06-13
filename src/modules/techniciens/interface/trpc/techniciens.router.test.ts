import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { TechnicienRepositoryDrizzle } from "../../infra/technicien-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9935001;
const UB = 9935002;

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

describe.skipIf(!URL)("techniciens.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from techniciens where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), technicienRepo: new TechnicienRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from techniciens where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → techniciens.list 401", async () => {
    expect((await callQuery(server, "techniciens.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "techniciens.create", { nom: "Martin", specialite: "Plomberie" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    const list = await callQuery(server, "techniciens.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((t) => t.id === id)).toBe(true);
  });

  it("validation Zod : nom vide → 400 ; email invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "techniciens.create", { nom: "" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "techniciens.create", { nom: "X", email: "pas-un-email" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le technicien de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "techniciens.create", { nom: "Secret" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "techniciens.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "techniciens.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "techniciens.update", { id, nom: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "techniciens.delete", { id }, tB)).statusCode).toBe(404);
    // intact pour A
    expect((await callQuery(server, "techniciens.getById", { id }, tA)).json().result.data.nom).toBe("Secret");
  });

  it("update + delete OK pour le propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "techniciens.create", { nom: "Temp" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "techniciens.update", { id, statut: "conge" }, tA)).json().result.data.statut).toBe("conge");
    expect((await callMutation(server, "techniciens.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "techniciens.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("getById / update / delete sur un id inexistant du même tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "techniciens.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "techniciens.update", { id: 999999999, nom: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "techniciens.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : nom > 255, couleur non #RRGGBB, coutHoraire non décimal → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "techniciens.create", { nom: "x".repeat(256) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "techniciens.create", { nom: "C", couleur: "rouge" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "techniciens.create", { nom: "C", coutHoraire: "abc" }, tA)).statusCode).toBe(400);
  });

  it("getAll renvoie le même résultat que list (parité legacy)", async () => {
    const tA = await token(UA);
    await callMutation(server, "techniciens.create", { nom: "Parité" }, tA);
    const list = (await callQuery(server, "techniciens.list", undefined, tA)).json().result.data as Array<{ id: number }>;
    const getAll = (await callQuery(server, "techniciens.getAll", undefined, tA)).json().result.data as Array<{ id: number }>;
    expect(getAll.map((t) => t.id).sort()).toEqual(list.map((t) => t.id).sort());
  });

  it("update partiel : ne touche pas les champs non fournis", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "techniciens.create", { nom: "Garder", specialite: "Élec", statut: "actif" }, tA)).json().result.data.id as number;
    // update du seul statut → specialite préservée
    const maj = (await callMutation(server, "techniciens.update", { id, statut: "inactif" }, tA)).json().result.data as { specialite: string | null; statut: string; nom: string };
    expect(maj.statut).toBe("inactif");
    expect(maj.specialite).toBe("Élec");
    expect(maj.nom).toBe("Garder");
  });
});
