import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DrizzleUserRoleReader } from "../../../../shared/tenant/role-reader";
import { ArticleRepositoryDrizzle } from "../../infra/article-repository-drizzle";
import { BibliothequeWriterDrizzle } from "../../infra/bibliotheque-writer-drizzle";
import { BibliothequeReaderDrizzle } from "../../infra/bibliotheque-reader-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const BIBTAG = "ZZBIBE2E";

const UA = 9943101;
const UB = 9943102;
const UADM = 9943103; // admin staff (rôle admin, sans artisan)
let seq = 0;
const ref = () => `ART-R-${++seq}`;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}
function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
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
    // Admin staff : rôle 'admin', SANS artisan (vérifie que `adminProcedure` ne dépend pas du tenant).
    await purge(UADM);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','admin')", [UADM, `u${UADM}@t.fr`]);
    await admin.query("delete from bibliotheque_articles where nom like $1", [`${BIBTAG}%`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    await admin.query('insert into artisans ("userId") values ($1) returning id', [UB]);
    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(app.db),
      roleReader: new DrizzleUserRoleReader(app.db),
      articleRepo: new ArticleRepositoryDrizzle(app.db),
      bibliothequeReader: new BibliothequeReaderDrizzle(app.db),
      bibliothequeWriter: new BibliothequeWriterDrizzle(app.db),
    });
  });

  afterAll(async () => {
    await server.close();
    await admin.query("delete from bibliotheque_articles where nom like $1", [`${BIBTAG}%`]);
    for (const uid of [UA, UB, UADM]) await purge(uid);
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

  it("alias parité client : getArtisanArticles/createArtisanArticle/update/delete = surface tenant", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    // create via la clé client → présent dans getArtisanArticles
    const created = await mut(server, "articles.createArtisanArticle", { reference: ref(), designation: "Via client", prixUnitaireHT: "7.00" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    const liste = (await q(server, "articles.getArtisanArticles", undefined, tA)).json().result.data as Array<{ id: number }>;
    expect(liste.some((x) => x.id === id)).toBe(true);
    // update via la clé client (propriétaire)
    expect((await mut(server, "articles.updateArtisanArticle", { id, designation: "MAJ client" }, tA)).json().result.data.designation).toBe("MAJ client");
    // isolation : B ne modifie/supprime pas via les alias
    expect((await mut(server, "articles.updateArtisanArticle", { id, designation: "hack" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "articles.deleteArtisanArticle", { id }, tB)).statusCode).toBe(404);
    // delete via la clé client (propriétaire)
    expect((await mut(server, "articles.deleteArtisanArticle", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await q(server, "articles.getById", { id }, tA)).statusCode).toBe(404);
    // sans cookie → 401
    expect((await q(server, "articles.getArtisanArticles", undefined)).statusCode).toBe(401);
  });

  it("getBibliotheque : PUBLIC (sans cookie → 200, catalogue partagé)", async () => {
    // Pas de cookie : la bibliothèque est un référentiel partagé, lecture publique (parité legacy).
    const res = await q(server, "articles.getBibliotheque", undefined);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result.data)).toBe(true);
    // search aussi public
    const s = await q(server, "articles.search", { query: "x" });
    expect(s.statusCode).toBe(200);
    expect(Array.isArray(s.json().result.data)).toBe(true);
  });

  it("bibliothèque WRITES : adminProcedure — 401 sans cookie, 403 non-admin, 200 admin", async () => {
    const tArtisan = await token(UA); // rôle artisan
    const tAdmin = await token(UADM); // rôle admin (sans artisan)
    const payload = { nom: `${BIBTAG} Mitigeur`, unite: "u", prix_base: "45.00", categorie: "sanitaire", sous_categorie: "robinetterie", metier: "plombier" };
    // sans cookie → 401
    expect((await mut(server, "articles.createBibliothequeArticle", payload)).statusCode).toBe(401);
    // artisan (non-admin) → 403
    expect((await mut(server, "articles.createBibliothequeArticle", payload, tArtisan)).statusCode).toBe(403);
    // admin → 200 (create)
    const created = await mut(server, "articles.createBibliothequeArticle", payload, tAdmin);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect(created.json().result.data.tauxTVA).toBe("20.00"); // défaut PG
    // update (admin) + non-admin refusé
    expect((await mut(server, "articles.updateBibliothequeArticle", { id, prix_base: "50.00" }, tArtisan)).statusCode).toBe(403);
    expect((await mut(server, "articles.updateBibliothequeArticle", { id, prix_base: "50.00" }, tAdmin)).json().result.data.prixBase).toBe("50.00");
    // import (admin) → compte
    const imp = await mut(server, "articles.importBibliothequeArticles", [{ ...payload, nom: `${BIBTAG} Imp` }], tAdmin);
    expect(imp.json().result.data).toEqual({ imported: 1 });
    // visible en lecture publique (getBibliotheque, sans cookie)
    const liste = (await q(server, "articles.getBibliotheque", { metier: "plombier" })).json().result.data as Array<{ nom: string }>;
    expect(liste.some((a) => a.nom === `${BIBTAG} Mitigeur`)).toBe(true);
    // delete (admin)
    expect((await mut(server, "articles.deleteBibliothequeArticle", { id }, tAdmin)).json().result.data).toEqual({ success: true });
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
