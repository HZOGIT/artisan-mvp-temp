import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ParametresRepositoryDrizzle } from "../../infra/parametres-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const UA = 9944201;
const UB = 9944202;
const UC = 9944203; /** collaborateur non-owner de A — gate permission `parametres.modifier` */

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}
function q(app: ReturnType<typeof buildApp>, path: string, tok?: string) {
  return injectTrpc(app, "GET", path, undefined, tok);
}

describe.skipIf(!URL)("parametres.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [uid]);
    await admin.query('delete from parametres_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [UC]);
    await admin.query("delete from users where id=$1", [UC]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    await admin.query('insert into artisans ("userId") values ($1) returning id', [UB]);
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'artisan\',$3)', [UC, `u${UC}@t.fr`, artisanA]);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), parametresRepo: new ParametresRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [UC]);
    await admin.query("delete from users where id=$1", [UC]);
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → parametres.get 401", async () => {
    expect((await q(server, "parametres.get")).statusCode).toBe(401);
  });

  it("get d'un tenant neuf → défauts (DEV/FAC/AV, net)", async () => {
    const tA = await token(UA);
    const res = await q(server, "parametres.get", tA);
    expect(res.statusCode).toBe(200);
    const p = res.json().result.data as { prefixeDevis: string; prefixeFacture: string; prefixeAvoir: string; delaiPaiementType: string };
    expect(p.prefixeDevis).toBe("DEV");
    expect(p.prefixeFacture).toBe("FAC");
    expect(p.prefixeAvoir).toBe("AV");
    expect(p.delaiPaiementType).toBe("net");
  });

  it("update + re-get : la config est persistée et relue", async () => {
    const tA = await token(UA);
    const upd = await mut(server, "parametres.update", { prefixeFacture: "F2026", delaiPaiementJours: 45, objectifCA: "15000.50", couleurPrincipale: "#AABBCC" }, tA);
    expect(upd.statusCode).toBe(200);
    const p = (await q(server, "parametres.get", tA)).json().result.data as { prefixeFacture: string; delaiPaiementJours: number; objectifCA: string; couleurPrincipale: string };
    expect(p.prefixeFacture).toBe("F2026");
    expect(p.delaiPaiementJours).toBe(45);
    expect(p.objectifCA).toBe("15000.50");
    expect(p.couleurPrincipale).toBe("#AABBCC");
  });

  it("validations → 400 (préfixe vide/>10, délai négatif, type hors enum, objectifCA non décimal, couleur invalide)", async () => {
    const tA = await token(UA);
    expect((await mut(server, "parametres.update", { prefixeDevis: "" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "parametres.update", { prefixeDevis: "TROP-LONG-XX" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "parametres.update", { delaiPaiementJours: -1 }, tA)).statusCode).toBe(400);
    expect((await mut(server, "parametres.update", { delaiPaiementType: "comptant" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "parametres.update", { objectifCA: "abc" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "parametres.update", { couleurPrincipale: "rouge" }, tA)).statusCode).toBe(400);
  });

  it("update partiel : préserve les autres champs config", async () => {
    const tA = await token(UA);
    await mut(server, "parametres.update", { conditionsGenerales: "CGV e2e", prefixeDevis: "D1" }, tA);
    await mut(server, "parametres.update", { prefixeDevis: "D2" }, tA);
    const p = (await q(server, "parametres.get", tA)).json().result.data as { prefixeDevis: string; conditionsGenerales: string };
    expect(p.prefixeDevis).toBe("D2");
    expect(p.conditionsGenerales).toBe("CGV e2e"); // préservé
  });

  it("INVARIANT : les compteurs de numérotation ne sont PAS altérables via l'API", async () => {
    const tA = await token(UA);
    // Simule une numérotation déjà avancée (compteurFacture=7) côté base.
    await admin.query('update parametres_artisan set "compteurFacture"=7 where "artisanId"=$1', [artisanA]);
    const upd = await mut(server, "parametres.update", { prefixeFacture: "X", compteurFacture: 1 } as Record<string, unknown>, tA);
    expect(upd.statusCode).toBe(200); // le champ compteurFacture inconnu est ignoré (zod strip), pas une erreur
    const compteur = (await admin.query('select "compteurFacture" from parametres_artisan where "artisanId"=$1', [artisanA])).rows[0].compteurFacture;
    expect(compteur).toBe(7); // inchangé : l'API n'expose aucun moyen de l'altérer
  });

  it("isolation cross-tenant : l'update de A n'affecte pas la config de B", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    await mut(server, "parametres.update", { prefixeFacture: "AAA" }, tA);
    const pB = (await q(server, "parametres.get", tB)).json().result.data as { prefixeFacture: string };
    expect(pB.prefixeFacture).not.toBe("AAA");
    expect(pB.prefixeFacture).toBe("FAC"); // B voit ses défauts
  });

  it("gate permission : collaborateur non-owner sans `parametres.modifier` → update 403", async () => {
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [UC]);
    const tC = await token(UC);
    expect((await mut(server, "parametres.update", { prefixeDevis: "X" }, tC)).statusCode).toBe(403);
  });

  it("gate permission : collaborateur non-owner AVEC `parametres.modifier` → update 200", async () => {
    await admin.query(
      'insert into permissions_utilisateur ("userId", permission, autorise) values ($1,$2,true) on conflict ("userId", permission) do update set autorise = true',
      [UC, "parametres.modifier"],
    );
    const tC = await token(UC);
    expect((await mut(server, "parametres.update", { prefixeDevis: "P" }, tC)).statusCode).toBe(200);
  });

  it("gate permission : owner (UA) sans permission DB → update autorisé (bypass propriétaire)", async () => {
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [UA]);
    const tA = await token(UA);
    expect((await mut(server, "parametres.update", { prefixeDevis: "DEV" }, tA)).statusCode).toBe(200);
  });
});
