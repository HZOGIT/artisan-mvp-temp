import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ArticleRepositoryDrizzle } from "../../infra/article-repository-drizzle";

// Durcissement e2e du domaine articles : bornes zod exhaustives + invariants du transport
// (artisanId/id inviolables). Complète articles.router.test.ts.

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9943301;
const UB = 9943302;
let seq = 0;
const ref = () => `ART-B-${++seq}`;

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

describe.skipIf(!URL)("articles.router e2e — bornes & invariants transport", () => {
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
    await admin.query('insert into artisans ("userId") values ($1)', [UB]);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), articleRepo: new ArticleRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  const baseCreate = (over: Record<string, unknown> = {}) => ({ reference: ref(), designation: "Article", prixUnitaireHT: "10.00", ...over });

  it("create — bornes max (reference>50, designation>500, description>5000, unite>20, categorie>100) → 400", async () => {
    const tA = await token(UA);
    expect((await mut(server, "articles.create", baseCreate({ reference: "x".repeat(51) }), tA)).statusCode).toBe(400);
    expect((await mut(server, "articles.create", baseCreate({ designation: "x".repeat(501) }), tA)).statusCode).toBe(400);
    expect((await mut(server, "articles.create", baseCreate({ description: "x".repeat(5001) }), tA)).statusCode).toBe(400);
    expect((await mut(server, "articles.create", baseCreate({ unite: "u".repeat(21) }), tA)).statusCode).toBe(400);
    expect((await mut(server, "articles.create", baseCreate({ categorie: "c".repeat(101) }), tA)).statusCode).toBe(400);
  });

  it("create — tauxTVA hors [0,100] → 400 (validation use-case)", async () => {
    const tA = await token(UA);
    expect((await mut(server, "articles.create", baseCreate({ tauxTVA: "150" }), tA)).statusCode).toBe(400);
  });

  it("INVARIANT transport : artisanId/id envoyés au create sont IGNORÉS (artisanId reste le tenant)", async () => {
    const tA = await token(UA);
    const res = await mut(server, "articles.create", baseCreate({ artisanId: 999999, id: 123456 }), tA);
    expect(res.statusCode).toBe(200);
    const a = res.json().result.data as { id: number; artisanId: number };
    expect(a.artisanId).toBe(artisanA); // pas 999999
    expect(a.id).not.toBe(123456); // id serveur (serial)
  });

  it("INVARIANT transport : artisanId envoyé au update est IGNORÉ", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "articles.create", baseCreate(), tA)).json().result.data.id as number;
    const res = await mut(server, "articles.update", { id, designation: "Maj", artisanId: 999999 }, tA);
    expect(res.statusCode).toBe(200);
    expect((res.json().result.data as { artisanId: number }).artisanId).toBe(artisanA);
  });

  it("update vide (aucun champ modifiable) → renvoie l'état courant (no-op)", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "articles.create", baseCreate({ designation: "Inchangé" }), tA)).json().result.data.id as number;
    const res = await mut(server, "articles.update", { id }, tA);
    expect(res.statusCode).toBe(200);
    expect((res.json().result.data as { designation: string }).designation).toBe("Inchangé");
  });
});
