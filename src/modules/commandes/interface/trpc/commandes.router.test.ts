import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { CommandeRepositoryDrizzle } from "../../infra/commande-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9938001;
const UB = 9938002;

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

describe.skipIf(!URL)("commandesFournisseurs.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let fournA = 0;
  let fournB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from stocks where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from depenses where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from lignes_commandes_fournisseurs where "commandeId" in (select id from commandes_fournisseurs where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from commandes_fournisseurs where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from fournisseurs where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    fournA = (await admin.query('insert into fournisseurs ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Point P"])).rows[0].id;
    fournB = (await admin.query('insert into fournisseurs ("artisanId", nom) values ($1,$2) returning id', [artisanB, "Cedeo"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), commandeRepo: new CommandeRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from mouvements_stock where "stockId" in (select id from stocks where "artisanId"=$1)', [aId]);
      await admin.query('delete from stocks where "artisanId"=$1', [aId]);
      await admin.query('delete from depenses where artisan_id=$1', [aId]);
      await admin.query('delete from lignes_commandes_fournisseurs where "commandeId" in (select id from commandes_fournisseurs where "artisanId"=$1)', [aId]);
      await admin.query('delete from commandes_fournisseurs where "artisanId"=$1', [aId]);
      await admin.query('delete from fournisseurs where "artisanId"=$1', [aId]);
      await admin.query('delete from devis where "artisanId"=$1', [aId]);
      await admin.query('delete from clients where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  const ligne = { designation: "Tube", quantite: 10, prixUnitaire: 5, tauxTVA: 20 };

  it("sans cookie → commandesFournisseurs.list 401", async () => {
    expect((await callQuery(server, "commandesFournisseurs.list", undefined)).statusCode).toBe(401);
  });

  it("create (totaux serveur) + list + getLignes scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [ligne] }, tA);
    expect(created.statusCode).toBe(200);
    const cmd = created.json().result.data as { id: number; totalHT: string; totalTTC: string };
    expect(cmd.totalHT).toBe("50.00");
    expect(cmd.totalTTC).toBe("60.00");
    expect((await callQuery(server, "commandesFournisseurs.list", undefined, tA)).json().result.data as Array<{ id: number }>).toContainEqual(expect.objectContaining({ id: cmd.id }));
    expect(((await callQuery(server, "commandesFournisseurs.getLignes", { commandeId: cmd.id }, tA)).json().result.data as unknown[]).length).toBe(1);
  });

  it("validation Zod : sans ligne → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [] }, tA)).statusCode).toBe(400);
  });

  it("anti-IDOR-FK : create avec le fournisseur d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournB, lignes: [ligne] }, tA)).statusCode).toBe(404);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la commande de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [ligne] }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "commandesFournisseurs.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "commandesFournisseurs.getLignes", { commandeId: id }, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "commandesFournisseurs.update", { id, notes: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "commandesFournisseurs.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "commandesFournisseurs.getById", { id }, tA)).statusCode).toBe(200);
  });

  it("update (métadonnées) + delete OK pour le propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [ligne] }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "commandesFournisseurs.update", { id, notes: "ok" }, tA)).json().result.data.notes).toBe("ok");
    expect((await callMutation(server, "commandesFournisseurs.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "commandesFournisseurs.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("getById / update / delete sur un id inexistant du même tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "commandesFournisseurs.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "commandesFournisseurs.update", { id: 999999999, notes: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "commandesFournisseurs.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : quantite ≤ 0, lignes > 500, designation vide, tauxTVA > 100 → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [{ ...ligne, quantite: 0 }] }, tA)).statusCode).toBe(400);
    const trop = Array.from({ length: 501 }, () => ligne);
    expect((await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: trop }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [{ ...ligne, designation: "" }] }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [{ ...ligne, tauxTVA: 150 }] }, tA)).statusCode).toBe(400);
  });

  it("getLignes reflète les lignes créées (quantité/prix/montantTotal serveur)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [{ designation: "Coude", quantite: 4, prixUnitaire: 2.5, tauxTVA: 10 }] }, tA)).json().result.data.id as number;
    const lignes = (await callQuery(server, "commandesFournisseurs.getLignes", { commandeId: id }, tA)).json().result.data as Array<{ designation: string; quantite: string; prixUnitaire: string; montantTotal: string; quantiteRecue: string }>;
    expect(lignes.length).toBe(1);
    expect(lignes[0].designation).toBe("Coude");
    expect(lignes[0].quantite).toBe("4.00");
    expect(lignes[0].prixUnitaire).toBe("2.50");
    expect(lignes[0].montantTotal).toBe("10.00"); // 4 × 2.5
    expect(lignes[0].quantiteRecue).toBe("0.00");
  });

  it("updateStatut : transition scopée ; cross-tenant → 404", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [ligne] }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "commandesFournisseurs.updateStatut", { id, statut: "confirmee" }, tA)).json().result.data.statut).toBe("confirmee");
    expect((await callMutation(server, "commandesFournisseurs.updateStatut", { id, statut: "annulee" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "commandesFournisseurs.updateStatut", { id, statut: "x_invalide" as unknown as string }, tA)).statusCode).toBe(400);
  });

  it("recevoir : réception partielle → partiellement_livree, totale → livree ; qté > commandée → 400 ; cross-tenant → 404", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [{ designation: "Tube", quantite: 10, prixUnitaire: 5 }] }, tA)).json().result.data.id as number;
    await callMutation(server, "commandesFournisseurs.updateStatut", { id, statut: "confirmee" }, tA);
    const ligneId = ((await callQuery(server, "commandesFournisseurs.getLignes", { commandeId: id }, tA)).json().result.data as Array<{ id: number }>)[0].id;
    // partielle
    const partiel = await callMutation(server, "commandesFournisseurs.recevoir", { id, lignes: [{ ligneId, quantiteRecue: 4 }] }, tA);
    expect(partiel.statusCode).toBe(200);
    expect(partiel.json().result.data.statut).toBe("partiellement_livree");
    expect(((await callQuery(server, "commandesFournisseurs.getLignes", { commandeId: id }, tA)).json().result.data as Array<{ quantiteRecue: string }>)[0].quantiteRecue).toBe("4.00");
    // qté reçue > commandée → 400 (invariant)
    expect((await callMutation(server, "commandesFournisseurs.recevoir", { id, lignes: [{ ligneId, quantiteRecue: 99 }] }, tA)).statusCode).toBe(400);
    // totale → livree
    expect((await callMutation(server, "commandesFournisseurs.recevoir", { id, lignes: [{ ligneId, quantiteRecue: 10 }] }, tA)).json().result.data.statut).toBe("livree");
    // cross-tenant → 404
    expect((await callMutation(server, "commandesFournisseurs.recevoir", { id, lignes: [{ ligneId, quantiteRecue: 1 }] }, tB)).statusCode).toBe(404);
  });

  it("recevoir : intégration stock du DELTA scopée tenant, anti double-comptage, audit mouvement", async () => {
    const tA = await token(UA);
    // stock de A (quantité initiale 100) + commande de A avec une ligne liée à ce stock (qté 10)
    const stockA = (await admin.query(
      `insert into stocks ("artisanId", reference, designation, "quantiteEnStock") values ($1,$2,$3,'100.00') returning id`,
      [artisanA, `S-${Date.now()}`, "Tube cuivre"],
    )).rows[0].id as number;
    const cmd = (await admin.query(
      `insert into commandes_fournisseurs ("artisanId","fournisseurId",statut) values ($1,$2,'confirmee') returning id`,
      [artisanA, fournA],
    )).rows[0].id as number;
    const ligneId = (await admin.query(
      `insert into lignes_commandes_fournisseurs ("commandeId","stockId",designation,quantite,"quantiteRecue") values ($1,$2,$3,'10.00','0.00') returning id`,
      [cmd, stockA, "Tube"],
    )).rows[0].id as number;

    // réception partielle 4 → stock 100 + 4 = 104
    await callMutation(server, "commandesFournisseurs.recevoir", { id: cmd, lignes: [{ ligneId, quantiteRecue: 4 }] }, tA);
    let q = (await admin.query('select "quantiteEnStock" as q from stocks where id=$1', [stockA])).rows[0].q;
    expect(Number(q)).toBeCloseTo(104, 2);
    // réception complémentaire 10 → DELTA 6 → stock 110 (pas 114 : anti double-comptage)
    await callMutation(server, "commandesFournisseurs.recevoir", { id: cmd, lignes: [{ ligneId, quantiteRecue: 10 }] }, tA);
    q = (await admin.query('select "quantiteEnStock" as q from stocks where id=$1', [stockA])).rows[0].q;
    expect(Number(q)).toBeCloseTo(110, 2);
    // 2 mouvements d'entrée tracés (delta 4 puis 6)
    const mvts = await admin.query('select type, quantite from mouvements_stock where "stockId"=$1 order by id', [stockA]);
    expect(mvts.rows.map((r: { type: string; quantite: string }) => `${r.type}:${Number(r.quantite)}`)).toEqual(["entree:4", "entree:6"]);

    // anti-IDOR stock : une ligne d'une commande de A liée à un stock de B ne touche PAS B
    const stockB = (await admin.query(
      `insert into stocks ("artisanId", reference, designation, "quantiteEnStock") values ($1,$2,$3,'50.00') returning id`,
      [artisanB, `SB-${Date.now()}`, "Autre"],
    )).rows[0].id as number;
    const cmd2 = (await admin.query(`insert into commandes_fournisseurs ("artisanId","fournisseurId",statut) values ($1,$2,'confirmee') returning id`, [artisanA, fournA])).rows[0].id as number;
    const ligne2 = (await admin.query(
      `insert into lignes_commandes_fournisseurs ("commandeId","stockId",designation,quantite,"quantiteRecue") values ($1,$2,$3,'5.00','0.00') returning id`,
      [cmd2, stockB, "X"],
    )).rows[0].id as number;
    await callMutation(server, "commandesFournisseurs.recevoir", { id: cmd2, lignes: [{ ligneId: ligne2, quantiteRecue: 5 }] }, tA);
    const qB = (await admin.query('select "quantiteEnStock" as q from stocks where id=$1', [stockB])).rows[0].q;
    expect(Number(qB)).toBeCloseTo(50, 2); // inchangé (stock d'un autre tenant)
  });

  it("setStatutFacturation : facturee + lien dépense owned ; dépense d'un autre tenant non liée ; cross-tenant → 404", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "commandesFournisseurs.create", { fournisseurId: fournA, lignes: [ligne] }, tA)).json().result.data.id as number;
    const depA = (await admin.query(
      `insert into depenses (artisan_id, user_id, numero, date_depense, categorie, montant_ht, montant_ttc) values ($1,$2,$3, now(), 'achats','100.00','120.00') returning id`,
      [artisanA, UA, `DEP-${Date.now()}`],
    )).rows[0].id as number;
    const depB = (await admin.query(
      `insert into depenses (artisan_id, user_id, numero, date_depense, categorie, montant_ht, montant_ttc) values ($1,$2,$3, now(), 'achats','50.00','60.00') returning id`,
      [artisanB, UB, `DEPB-${Date.now()}`],
    )).rows[0].id as number;
    // facturée + dépense de A → liée
    const f1 = await callMutation(server, "commandesFournisseurs.setStatutFacturation", { id, statutFacturation: "facturee", depenseId: depA }, tA);
    expect(f1.json().result.data.statutFacturation).toBe("facturee");
    expect(f1.json().result.data.depenseId).toBe(depA);
    // facturée + dépense de B → non liée (anti-IDOR-FK)
    const f2 = await callMutation(server, "commandesFournisseurs.setStatutFacturation", { id, statutFacturation: "facturee", depenseId: depB }, tA);
    expect(f2.json().result.data.depenseId).toBeNull();
    // a_facturer → délie
    const f3 = await callMutation(server, "commandesFournisseurs.setStatutFacturation", { id, statutFacturation: "a_facturer" }, tA);
    expect(f3.json().result.data.depenseId).toBeNull();
    // cross-tenant → 404
    expect((await callMutation(server, "commandesFournisseurs.setStatutFacturation", { id, statutFacturation: "facturee" }, tB)).statusCode).toBe(404);
  });

  it("getEnRetard : commandes échéance dépassée non livrées, scopé tenant", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    // commande A en retard via SQL (dateLivraisonPrevue passée)
    const cmdRetard = (await admin.query(
      `insert into commandes_fournisseurs ("artisanId","fournisseurId",statut,"dateLivraisonPrevue") values ($1,$2,'envoyee', now() - interval '3 days') returning id`,
      [artisanA, fournA],
    )).rows[0].id as number;
    // commande A livrée en retard → exclue
    await admin.query(
      `insert into commandes_fournisseurs ("artisanId","fournisseurId",statut,"dateLivraisonPrevue") values ($1,$2,'livree', now() - interval '3 days')`,
      [artisanA, fournA],
    );
    // commande B en retard → ne compte pas pour A
    await admin.query(
      `insert into commandes_fournisseurs ("artisanId","fournisseurId",statut,"dateLivraisonPrevue") values ($1,$2,'envoyee', now() - interval '3 days')`,
      [artisanB, fournB],
    );
    const retardsA = (await callQuery(server, "commandesFournisseurs.getEnRetard", undefined, tA)).json().result.data as Array<{ id: number }>;
    expect(retardsA.map((c) => c.id)).toContain(cmdRetard);
    expect(retardsA.every((c) => c.id !== undefined)).toBe(true);
    // B ne voit pas les retards de A
    const retardsB = (await callQuery(server, "commandesFournisseurs.getEnRetard", undefined, tB)).json().result.data as Array<{ id: number }>;
    expect(retardsB.some((c) => c.id === cmdRetard)).toBe(false);
  });

  it("getPerformances (parité client) : 1 entrée par fournisseur du tenant, scopé ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    expect((await callQuery(server, "commandesFournisseurs.getPerformances", undefined)).statusCode).toBe(401);
    const perfA = (await callQuery(server, "commandesFournisseurs.getPerformances", undefined, tA)).json().result.data as Array<{ fournisseur: { id: number }; totalCommandes: number }>;
    // A voit son fournisseur fournA, JAMAIS celui de B (fournB)
    expect(perfA.some((p) => p.fournisseur.id === fournA)).toBe(true);
    expect(perfA.some((p) => p.fournisseur.id === fournB)).toBe(false);
    // B ne voit pas fournA
    const perfB = (await callQuery(server, "commandesFournisseurs.getPerformances", undefined, tB)).json().result.data as Array<{ fournisseur: { id: number } }>;
    expect(perfB.some((p) => p.fournisseur.id === fournA)).toBe(false);
  });

  it("listDevisAcceptes (parité client) : seuls les devis 'accepte', enrichis du nom client ; scopé ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    expect((await callQuery(server, "commandesFournisseurs.listDevisAcceptes", undefined)).statusCode).toBe(401);
    // client + devis (1 accepté, 1 brouillon) côté admin pour A
    const cliA = (await admin.query('insert into clients ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [artisanA, "Durand", "Marie"])).rows[0].id as number;
    const sfx = Date.now();
    const accId = (await admin.query(`insert into devis ("artisanId","clientId",numero,statut,objet,"totalTTC") values ($1,$2,$3,'accepte','Rénovation','1200.00') returning id`, [artisanA, cliA, `DEV-ACC-${sfx}`])).rows[0].id as number;
    await admin.query(`insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,'brouillon')`, [artisanA, cliA, `DEV-BR-${sfx}`]);
    const list = (await callQuery(server, "commandesFournisseurs.listDevisAcceptes", undefined, tA)).json().result.data as Array<{ id: number; clientNom: string; totalTTC: number; numero: string }>;
    const mine = list.find((d) => d.id === accId);
    expect(mine).toBeDefined();
    expect(mine!.clientNom).toBe("Durand Marie"); // nom + prénom
    expect(mine!.totalTTC).toBe(1200);
    // le brouillon n'est PAS listé
    expect(list.some((d) => d.numero === `DEV-BR-${sfx}`)).toBe(false);
    // isolation : B ne voit pas le devis de A
    const listB = (await callQuery(server, "commandesFournisseurs.listDevisAcceptes", undefined, tB)).json().result.data as Array<{ id: number }>;
    expect(listB.some((d) => d.id === accId)).toBe(false);
  });
});
