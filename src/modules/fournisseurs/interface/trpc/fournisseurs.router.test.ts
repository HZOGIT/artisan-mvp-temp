import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { FournisseurRepositoryDrizzle } from "../../infra/fournisseur-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9937001;
const UB = 9937002;

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

describe.skipIf(!URL)("fournisseurs.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from articles_fournisseurs where "fournisseurId" in (select id from fournisseurs where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from articles_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from fournisseurs where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), fournisseurRepo: new FournisseurRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from articles_fournisseurs where "fournisseurId" in (select id from fournisseurs where "artisanId"=$1)', [aId]);
      await admin.query('delete from articles_artisan where "artisanId"=$1', [aId]);
      await admin.query('delete from fournisseurs where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → fournisseurs.list 401", async () => {
    expect((await callQuery(server, "fournisseurs.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "fournisseurs.create", { nom: "Point P", ville: "Lyon" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    const list = await callQuery(server, "fournisseurs.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((f) => f.id === id)).toBe(true);
  });

  it("validation Zod : nom vide → 400 ; email invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "fournisseurs.create", { nom: "" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "fournisseurs.create", { nom: "X", email: "pas-un-email" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le fournisseur de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "fournisseurs.create", { nom: "Secret" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "fournisseurs.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "fournisseurs.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "fournisseurs.update", { id, nom: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "fournisseurs.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "fournisseurs.getById", { id }, tA)).json().result.data.nom).toBe("Secret");
  });

  it("update + delete OK pour le propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "fournisseurs.create", { nom: "Temp" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "fournisseurs.update", { id, ville: "Paris" }, tA)).json().result.data.ville).toBe("Paris");
    expect((await callMutation(server, "fournisseurs.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "fournisseurs.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("getById / update / delete sur un id inexistant du même tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "fournisseurs.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "fournisseurs.update", { id: 999999999, nom: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "fournisseurs.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : nom > 255, codePostal > 10, notes > 5000 → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "fournisseurs.create", { nom: "x".repeat(256) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "fournisseurs.create", { nom: "C", codePostal: "x".repeat(11) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "fournisseurs.create", { nom: "C", notes: "x".repeat(5001) }, tA)).statusCode).toBe(400);
  });

  it("update partiel : ne touche pas les champs non fournis", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "fournisseurs.create", { nom: "Garder", contact: "Jean", ville: "Lyon" }, tA)).json().result.data.id as number;
    const maj = (await callMutation(server, "fournisseurs.update", { id, ville: "Marseille" }, tA)).json().result.data as { nom: string; contact: string | null; ville: string };
    expect(maj.ville).toBe("Marseille");
    expect(maj.nom).toBe("Garder");
    expect(maj.contact).toBe("Jean");
  });

  it("associations article↔fournisseur : associate/get/dissociate scopés, anti-IDOR prix d'achat", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    // article + fournisseur de A
    const articleA = (await admin.query(
      'insert into articles_artisan ("artisanId", reference, designation, "prixUnitaireHT") values ($1,$2,$3,$4) returning id',
      [artisanA, `REF-${Date.now()}`, "Tube cuivre", "12.50"],
    )).rows[0].id as number;
    const fournA = (await callMutation(server, "fournisseurs.create", { nom: "Point P" }, tA)).json().result.data.id as number;
    // fournisseur de B
    const fournB = (await callMutation(server, "fournisseurs.create", { nom: "Cedeo" }, tB)).json().result.data.id as number;

    // A associe son article à son fournisseur (prix d'achat tenant-privé)
    const assoc = await callMutation(server, "fournisseurs.associateArticle", { articleId: articleA, fournisseurId: fournA, prixAchat: "9.90" }, tA);
    expect(assoc.statusCode).toBe(200);
    const assocId = assoc.json().result.data.id as number;
    // getArticleFournisseurs (A) renvoie l'assoc avec le prix
    const listA = (await callQuery(server, "fournisseurs.getArticleFournisseurs", { articleId: articleA }, tA)).json().result.data as Array<{ prixAchat: string }>;
    expect(listA.length).toBe(1);
    expect(listA[0].prixAchat).toBe("9.90");
    // anti-IDOR : A associe avec le fournisseur de B → 404
    expect((await callMutation(server, "fournisseurs.associateArticle", { articleId: articleA, fournisseurId: fournB }, tA)).statusCode).toBe(404);
    // anti-IDOR : B ne lit pas le prix d'achat de l'article de A → [] (sans oracle)
    expect((await callQuery(server, "fournisseurs.getArticleFournisseurs", { articleId: articleA }, tB)).json().result.data).toEqual([]);
    // dissociate : B → 404, A → OK
    expect((await callMutation(server, "fournisseurs.dissociateArticle", { id: assocId }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "fournisseurs.dissociateArticle", { id: assocId }, tA)).json().result.data).toEqual({ success: true });
    expect(((await callQuery(server, "fournisseurs.getArticleFournisseurs", { articleId: articleA }, tA)).json().result.data as unknown[]).length).toBe(0);
  });
});
