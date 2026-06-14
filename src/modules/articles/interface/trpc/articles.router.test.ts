import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ArticleRepositoryDrizzle } from "../../infra/article-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9943101;
const UB = 9943102;
let seq = 0;
const ref = () => `ART-R-${++seq}`;

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

describe.skipIf(!URL)("articles.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from articles_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    await admin.query('insert into artisans ("userId") values ($1) returning id', [UB]);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), articleRepo: new ArticleRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → articles.list 401", async () => {
    expect((await q(server, "articles.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A (défauts PG)", async () => {
    const tA = await token(UA);
    const created = await mut(server, "articles.create", { reference: ref(), designation: "Tuyau PVC", prixUnitaireHT: "12.50" }, tA);
    expect(created.statusCode).toBe(200);
    const a = created.json().result.data as { id: number; unite: string; tauxTVA: string };
    expect(a.unite).toBe("unité");
    expect(a.tauxTVA).toBe("20.00");
    expect((await q(server, "articles.list", undefined, tA)).json().result.data.some((x: { id: number }) => x.id === a.id)).toBe(true);
  });

  it("validation : reference vide → 400 ; prix non décimal → 400 ; prix négatif → 400", async () => {
    const tA = await token(UA);
    const b = { designation: "X", prixUnitaireHT: "1.00" };
    expect((await mut(server, "articles.create", { ...b, reference: "" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "articles.create", { ...b, reference: ref(), prixUnitaireHT: "abc" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "articles.create", { ...b, reference: ref(), prixUnitaireHT: "-1" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas l'article de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await mut(server, "articles.create", { reference: ref(), designation: "Secret", prixUnitaireHT: "9.99" }, tA)).json().result.data.id as number;
    expect((await q(server, "articles.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "articles.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "articles.update", { id, designation: "hack" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "articles.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "articles.getById", { id }, tA)).json().result.data.designation).toBe("Secret");
  });

  it("update partiel + delete OK propriétaire ; id inexistant → 404", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "articles.create", { reference: ref(), designation: "Avant", prixUnitaireHT: "5.00", categorie: "elec" }, tA)).json().result.data.id as number;
    const maj = await mut(server, "articles.update", { id, designation: "Après" }, tA);
    expect(maj.json().result.data.designation).toBe("Après");
    expect(maj.json().result.data.categorie).toBe("elec"); // préservé
    expect((await mut(server, "articles.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await q(server, "articles.getById", { id }, tA)).statusCode).toBe(404);
    expect((await mut(server, "articles.update", { id: 999999999, designation: "x" }, tA)).statusCode).toBe(404);
  });

  it("byCategorie : filtre scopé tenant ; catégorie inconnue → []", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    await mut(server, "articles.create", { reference: ref(), designation: "Plomberie X", prixUnitaireHT: "3.00", categorie: "plomberie-cat" }, tA);
    await mut(server, "articles.create", { reference: ref(), designation: "Elec X", prixUnitaireHT: "4.00", categorie: "elec-cat" }, tA);
    const plomberie = (await q(server, "articles.byCategorie", { categorie: "plomberie-cat" }, tA)).json().result.data as Array<{ designation: string }>;
    expect(plomberie.every((a) => a.designation !== "Elec X")).toBe(true);
    expect(plomberie.some((a) => a.designation === "Plomberie X")).toBe(true);
    expect((await q(server, "articles.byCategorie", { categorie: "inexistante" }, tA)).json().result.data).toEqual([]);
    // cross-tenant : B ne voit pas la catégorie de A
    expect((await q(server, "articles.byCategorie", { categorie: "plomberie-cat" }, tB)).json().result.data).toEqual([]);
  });
});
