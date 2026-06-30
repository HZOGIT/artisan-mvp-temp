import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { StockRepositoryDrizzle } from "../../infra/stock-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9939001;
const UB = 9939002;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}
function callQuery(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
}

describe.skipIf(!URL)("stocks.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from stocks where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), stockRepo: new StockRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from notifications where "artisanId"=$1', [aId]);
      await admin.query('delete from lignes_commandes_fournisseurs where "commandeId" in (select id from commandes_fournisseurs where "artisanId"=$1)', [aId]);
      await admin.query('delete from commandes_fournisseurs where "artisanId"=$1', [aId]);
      await admin.query('delete from fournisseurs where "artisanId"=$1', [aId]);
      await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId"=$1)', [aId]);
      await admin.query('delete from stocks where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → stocks.list 401", async () => {
    expect((await callQuery(server, "stocks.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "stocks.create", { reference: "REF-1", designation: "Tube", quantiteEnStock: "100" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect(created.json().result.data.quantiteEnStock).toBe("100.00");
    const list = await callQuery(server, "stocks.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((s) => s.id === id)).toBe(true);
  });

  it("validation Zod : reference vide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "stocks.create", { reference: "", designation: "X" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le stock de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "stocks.create", { reference: "SEC", designation: "Secret" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "stocks.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "stocks.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "stocks.update", { id, designation: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "stocks.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "stocks.getById", { id }, tA)).json().result.data.designation).toBe("Secret");
  });

  it("update (métadonnées) ne change pas la quantité ; delete OK propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "stocks.create", { reference: "Q", designation: "Avant", quantiteEnStock: "42" }, tA)).json().result.data.id as number;
    const maj = await callMutation(server, "stocks.update", { id, designation: "Après", emplacement: "Allée 2" }, tA);
    expect(maj.json().result.data.designation).toBe("Après");
    expect(maj.json().result.data.quantiteEnStock).toBe("42.00"); // intacte (pas dans le schéma update)
    expect((await callMutation(server, "stocks.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "stocks.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("getById / update / delete sur un id inexistant du même tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "stocks.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "stocks.update", { id: 999999999, designation: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "stocks.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : reference > 50, designation > 500, quantité non décimale, articleType invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "stocks.create", { reference: "x".repeat(51), designation: "D" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "stocks.create", { reference: "R", designation: "x".repeat(501) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "stocks.create", { reference: "R", designation: "D", quantiteEnStock: "abc" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "stocks.create", { reference: "R", designation: "D", articleType: "inconnu" }, tA)).statusCode).toBe(400);
  });

  it("update : quantiteEnStock dans l'input est rejeté (zod strict) ou ignoré (jamais appliqué)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "stocks.create", { reference: "QZ", designation: "Garde", quantiteEnStock: "30" }, tA)).json().result.data.id as number;
    // tente de pousser quantiteEnStock via update → la quantité ne doit PAS changer
    await callMutation(server, "stocks.update", { id, quantiteEnStock: "999", designation: "Toujours" }, tA);
    expect((await callQuery(server, "stocks.getById", { id }, tA)).json().result.data.quantiteEnStock).toBe("30.00");
  });

  it("update partiel : ne touche pas les champs non fournis", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "stocks.create", { reference: "PART", designation: "Garder", emplacement: "Allée 1" }, tA)).json().result.data.id as number;
    const maj = (await callMutation(server, "stocks.update", { id, designation: "Renommé" }, tA)).json().result.data as { reference: string; designation: string; emplacement: string | null };
    expect(maj.designation).toBe("Renommé");
    expect(maj.reference).toBe("PART");
    expect(maj.emplacement).toBe("Allée 1");
  });

  it("adjustQuantity : entrée incrémente + mouvement tracé (avant/après) ; sortie décrémente", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "stocks.create", { reference: "MV", designation: "Mvt", quantiteEnStock: "10" }, tA)).json().result.data.id as number;
    const entree = await callMutation(server, "stocks.adjustQuantity", { stockId: id, type: "entree", quantite: "5", motif: "Réappro" }, tA);
    expect(entree.statusCode).toBe(200);
    expect(entree.json().result.data.quantiteEnStock).toBe("15.00");
    const sortie = await callMutation(server, "stocks.adjustQuantity", { stockId: id, type: "sortie", quantite: "4" }, tA);
    expect(sortie.json().result.data.quantiteEnStock).toBe("11.00");
    const mvts = (await callQuery(server, "stocks.getMouvements", { stockId: id }, tA)).json().result.data as Array<{ type: string; quantiteAvant: string; quantiteApres: string }>;
    expect(mvts.length).toBe(3); /* Stock initial + entree + sortie */
    expect(mvts[0].type).toBe("sortie"); // récents d'abord
    expect(mvts[0].quantiteAvant).toBe("15.00");
    expect(mvts[0].quantiteApres).toBe("11.00");
  });

  it("adjustQuantity : sortie > stock → 400 (quantité jamais négative, aucun mouvement)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "stocks.create", { reference: "NEG", designation: "Garde-fou", quantiteEnStock: "0" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "stocks.adjustQuantity", { stockId: id, type: "sortie", quantite: "5" }, tA)).statusCode).toBe(400);
    expect((await callQuery(server, "stocks.getById", { id }, tA)).json().result.data.quantiteEnStock).toBe("0.00");
    expect((await callQuery(server, "stocks.getMouvements", { stockId: id }, tA)).json().result.data).toEqual([]);
  });

  it("adjustQuantity : deux entrées successives cumulent (anti double-comptage)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "stocks.create", { reference: "CUM", designation: "Cumul", quantiteEnStock: "0" }, tA)).json().result.data.id as number;
    await callMutation(server, "stocks.adjustQuantity", { stockId: id, type: "entree", quantite: "7" }, tA);
    const second = await callMutation(server, "stocks.adjustQuantity", { stockId: id, type: "entree", quantite: "3" }, tA);
    expect(second.json().result.data.quantiteEnStock).toBe("10.00");
  });

  it("isolation cross-tenant : B ne peut ni ajuster ni lire les mouvements du stock de A → 404 / vide", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "stocks.create", { reference: "ISO", designation: "Isolé", quantiteEnStock: "20" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "stocks.adjustQuantity", { stockId: id, type: "entree", quantite: "1" }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "stocks.getMouvements", { stockId: id }, tB)).statusCode).toBe(404);
    // le stock de A n'a pas bougé
    expect((await callQuery(server, "stocks.getById", { id }, tA)).json().result.data.quantiteEnStock).toBe("20.00");
  });

  it("adjustQuantity : quantité de mouvement négative refusée par zod → 400", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "stocks.create", { reference: "ZB", designation: "Borne", quantiteEnStock: "5" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "stocks.adjustQuantity", { stockId: id, type: "entree", quantite: "-2" }, tA)).statusCode).toBe(400);
  });

  it("getLowStock / getStocksEnRupture : seuil et rupture stricte, scopés tenant", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const refBas = `LOW-${Date.now()}`;
    const refVide = `RUP-${Date.now()}`;
    const refOk = `OK-${Date.now()}`;
    await callMutation(server, "stocks.create", { reference: refBas, designation: "Sous seuil", quantiteEnStock: "2", seuilAlerte: "5" }, tA);
    await callMutation(server, "stocks.create", { reference: refVide, designation: "Épuisé", quantiteEnStock: "0", seuilAlerte: "5" }, tA);
    await callMutation(server, "stocks.create", { reference: refOk, designation: "Au-dessus", quantiteEnStock: "20", seuilAlerte: "5" }, tA);
    // B a aussi un stock bas, qui ne doit JAMAIS remonter pour A
    await callMutation(server, "stocks.create", { reference: `B-${Date.now()}`, designation: "Bas chez B", quantiteEnStock: "0", seuilAlerte: "5" }, tB);

    const low = (await callQuery(server, "stocks.getLowStock", undefined, tA)).json().result.data as Array<{ reference: string }>;
    const lowRefs = low.map((s) => s.reference);
    expect(lowRefs).toContain(refBas);
    expect(lowRefs).toContain(refVide);
    expect(lowRefs).not.toContain(refOk); // au-dessus du seuil exclu

    const rupture = (await callQuery(server, "stocks.getStocksEnRupture", undefined, tA)).json().result.data as Array<{ reference: string }>;
    const rupRefs = rupture.map((s) => s.reference);
    expect(rupRefs).toContain(refVide); // épuisé
    expect(rupRefs).not.toContain(refBas); // sous seuil mais pas épuisé → pas en rupture

    // aucun stock de B (réf "B-…") ne fuite vers A
    expect(lowRefs.some((r) => r.startsWith("B-"))).toBe(false);
    expect(rupRefs.some((r) => r.startsWith("B-"))).toBe(false);
  });

  it("generateAlerts (parité client) : 1 notification 'alerte' par stock bas, scopé tenant ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    // 401 sans cookie
    expect((await callMutation(server, "stocks.generateAlerts", undefined)).statusCode).toBe(401);
    // purge les notifications de A pour un compte déterministe, puis crée 2 stocks bas distincts
    await admin.query('delete from notifications where "artisanId"=$1', [artisanA]);
    const sfx = Date.now();
    await callMutation(server, "stocks.create", { reference: `GA1-${sfx}`, designation: "Bas 1", quantiteEnStock: "1", seuilAlerte: "5" }, tA);
    await callMutation(server, "stocks.create", { reference: `GA2-${sfx}`, designation: "Bas 2", quantiteEnStock: "0", seuilAlerte: "5" }, tA);
    // nb de stocks bas réels de A (d'autres tests ont pu en créer)
    const basCount = Number((await admin.query('select count(*)::int as n from stocks where "artisanId"=$1 and "quantiteEnStock" <= "seuilAlerte"', [artisanA])).rows[0].n);
    expect(basCount).toBeGreaterThanOrEqual(2);

    const res = await callMutation(server, "stocks.generateAlerts", undefined, tA);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data.alertsCreated).toBe(basCount);
    // autant de notifications 'alerte' créées pour A
    const notifA = Number((await admin.query(`select count(*)::int as n from notifications where "artisanId"=$1 and type='alerte'`, [artisanA])).rows[0].n);
    expect(notifA).toBe(basCount);
    // isolation : B n'a reçu aucune notification du fait de l'action de A
    const notifB = Number((await admin.query(`select count(*)::int as n from notifications where "artisanId"=$1 and type='alerte'`, [artisanB])).rows[0].n);
    expect(notifB).toBe(0);
  });

  it("getEntrant (parité client) : Σ(quantite-quantiteRecue) des commandes non soldées, scopé tenant ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    // 401 sans cookie
    expect((await callQuery(server, "stocks.getEntrant", undefined)).statusCode).toBe(401);
    // stock de A
    const stockId = (await callMutation(server, "stocks.create", { reference: `ENT-${Date.now()}`, designation: "Entrant", quantiteEnStock: "0", seuilAlerte: "5" }, tA)).json().result.data.id as number;
    // fournisseur + commande ENVOYÉE de A + 2 lignes liées au même stock (10-3) + (5-0) = 12 entrant
    const fId = (await admin.query('insert into fournisseurs ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Fournisseur A"])).rows[0].id as number;
    const cId = (await admin.query('insert into commandes_fournisseurs ("artisanId","fournisseurId",statut) values ($1,$2,$3) returning id', [artisanA, fId, "envoyee"])).rows[0].id as number;
    await admin.query('insert into lignes_commandes_fournisseurs ("commandeId","stockId",designation,quantite,"quantiteRecue") values ($1,$2,$3,$4,$5),($1,$2,$3,$6,$7)', [cId, stockId, "L", "10", "3", "5", "0"]);
    // commande BROUILLON (non comptée) sur le même stock
    const cBrouillon = (await admin.query('insert into commandes_fournisseurs ("artisanId","fournisseurId",statut) values ($1,$2,$3) returning id', [artisanA, fId, "brouillon"])).rows[0].id as number;
    await admin.query('insert into lignes_commandes_fournisseurs ("commandeId","stockId",designation,quantite,"quantiteRecue") values ($1,$2,$3,$4,$5)', [cBrouillon, stockId, "L", "99", "0"]);

    const entrant = (await callQuery(server, "stocks.getEntrant", undefined, tA)).json().result.data as Array<{ stockId: number; entrant: number }>;
    const ligne = entrant.find((e) => e.stockId === stockId);
    expect(ligne).toBeDefined();
    expect(ligne!.entrant).toBe(12); // (10-3)+(5-0) ; la commande brouillon est exclue
    // isolation : B ne voit pas l'entrant de A
    expect((await callQuery(server, "stocks.getEntrant", undefined, tB)).json().result.data).toEqual([]);
  });
});
