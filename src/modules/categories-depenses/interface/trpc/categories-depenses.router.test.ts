import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { CategorieDepenseRepositoryDrizzle } from "../../infra/categorie-depense-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9945401;
const UB = 9945402;
let seq = 0;
const nom = () => `Cat-${++seq}`;

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

describe.skipIf(!URL)("categoriesDepenses.router e2e (HTTP → tRPC → use-case → repo → RLS + unicité)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from categories_depenses where "artisan_id" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      await admin.query('insert into artisans ("userId") values ($1)', [uid]);
    }
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), categorieDepenseRepo: new CategorieDepenseRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → categoriesDepenses.list 401", async () => {
    expect((await q(server, "categoriesDepenses.list", undefined)).statusCode).toBe(401);
  });

  it("create + getById → défauts PG (couleur/icone/booléens/ordre)", async () => {
    const tA = await token(UA);
    const created = await mut(server, "categoriesDepenses.create", { nom: nom() }, tA);
    expect(created.statusCode).toBe(200);
    const c = created.json().result.data as { id: number; couleur: string; icone: string; deductibleTva: boolean; ordre: number };
    expect(c.couleur).toBe("#6366f1");
    expect(c.icone).toBe("Receipt");
    expect(c.deductibleTva).toBe(true);
    expect(c.ordre).toBe(0);
    expect((await q(server, "categoriesDepenses.getById", { id: c.id }, tA)).statusCode).toBe(200);
  });

  it("INVARIANT unicité : 2e create même nom même tenant → 409", async () => {
    const tA = await token(UA);
    const n = nom();
    expect((await mut(server, "categoriesDepenses.create", { nom: n }, tA)).statusCode).toBe(200);
    expect((await mut(server, "categoriesDepenses.create", { nom: n }, tA)).statusCode).toBe(409);
  });

  it("validations → 400 : nom vide, couleur hors hexa, plafond non décimal", async () => {
    const tA = await token(UA);
    expect((await mut(server, "categoriesDepenses.create", { nom: "" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "categoriesDepenses.create", { nom: nom(), couleur: "rouge" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "categoriesDepenses.create", { nom: nom(), plafondMensuel: "abc" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la catégorie de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await mut(server, "categoriesDepenses.create", { nom: nom() }, tA)).json().result.data.id as number;
    expect((await q(server, "categoriesDepenses.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "categoriesDepenses.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "categoriesDepenses.update", { id, nom: "hack" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "categoriesDepenses.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "categoriesDepenses.getById", { id }, tA)).statusCode).toBe(200);
  });

  it("update partiel préserve + rename vers nom pris → 409", async () => {
    const tA = await token(UA);
    const n1 = nom();
    await mut(server, "categoriesDepenses.create", { nom: n1 }, tA);
    const id2 = (await mut(server, "categoriesDepenses.create", { nom: nom(), couleur: "#112233" }, tA)).json().result.data.id as number;
    const maj = await mut(server, "categoriesDepenses.update", { id: id2, ordre: 7 }, tA);
    expect(maj.json().result.data.ordre).toBe(7);
    expect(maj.json().result.data.couleur).toBe("#112233"); // préservé
    expect((await mut(server, "categoriesDepenses.update", { id: id2, nom: n1 }, tA)).statusCode).toBe(409);
  });

  it("delete OK propriétaire ; id inexistant → 404", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "categoriesDepenses.create", { nom: nom() }, tA)).json().result.data.id as number;
    expect((await mut(server, "categoriesDepenses.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await q(server, "categoriesDepenses.getById", { id }, tA)).statusCode).toBe(404);
    expect((await mut(server, "categoriesDepenses.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });
});
