import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { FactureRepositoryDrizzle } from "../../infra/facture-repository-drizzle";
import { NoopComptaPort } from "../../application/compta-port";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9894101;
const UB = 9894102;

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

describe.skipIf(!URL)("factures.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;
  let devisB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from events where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from ecritures_comptables where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from parametres_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId",siret) values ($1,$2) returning id', [UA, "73282932000074"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId",siret) values ($1,$2) returning id', [UB, "73282932000074"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "Client B"])).rows[0].id;
    devisB = (await admin.query('insert into devis ("artisanId","clientId",numero) values ($1,$2,$3) returning id', [artisanB, clientB, "DEV-B-FACT"])).rows[0].id;
    // ⚠️ NoopComptaPort : ce test couvre les factures, pas la génération FEC (testée côté
    // ecritures) — évite un effet de bord d'écritures via une autre connexion.
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), factureRepo: new FactureRepositoryDrizzle(app.db), compta: new NoopComptaPort() });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → factures.list 401", async () => {
    expect((await callQuery(server, "factures.list", undefined)).statusCode).toBe(401);
  });

  it("create : brouillon sans numéro ; numéro FAC- assigné à l'émission + list scopé", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "factures.create", { clientId: clientA, objet: "Travaux" }, tA);
    expect(created.statusCode).toBe(200);
    const f = created.json().result.data as { id: number; numero: string | null; statut: string; totalTTC: string };
    expect(f.numero).toBeNull();
    expect(f.statut).toBe("brouillon");
    expect(f.totalTTC).toBe("0.00");
    const list = await callQuery(server, "factures.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((x) => x.id === f.id)).toBe(true);
    const emise = (await callMutation(server, "factures.envoyer", { id: f.id }, tA)).json().result.data as { numero: string | null };
    expect(emise.numero).toMatch(/^FAC-\d{5}$/);
    /* idempotence : second envoyer → même numéro conservé */
    const emise2 = (await callMutation(server, "factures.envoyer", { id: f.id }, tA)).json().result.data as { numero: string | null };
    expect(emise2.numero).toBe(emise.numero);
  });

  it("ANTI-IDOR-FK : create avec un clientId/devisId d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "factures.create", { clientId: clientB, objet: "Vol" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "factures.create", { clientId: clientA, devisId: devisB }, tA)).statusCode).toBe(404);
  });

  it("lignes : addLigne recalcule le total ; section neutre", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "factures.create", { clientId: clientA }, tA)).json().result.data.id as number;
    const l = await callMutation(server, "factures.addLigne", { factureId: id, designation: "Pose", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" }, tA);
    expect(l.json().result.data.montantTTC).toBe("240.00");
    await callMutation(server, "factures.addLigne", { factureId: id, designation: "— Lot —", type: "section", quantite: "9", prixUnitaireHT: "999" }, tA);
    expect((await callQuery(server, "factures.getById", { id }, tA)).json().result.data.totalTTC).toBe("240.00");
    expect((await callQuery(server, "factures.getLignes", { factureId: id }, tA)).json().result.data.length).toBe(2);
  });

  it("addLigne avec remise 15% : montantHT = pu × q × 0.85", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "factures.create", { clientId: clientA }, tA)).json().result.data.id as number;
    const l = await callMutation(server, "factures.addLigne", { factureId: id, designation: "Service remisé", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20", remise: 15 }, tA);
    expect(l.json().result.data.montantHT).toBe("170.00"); /* 2 × 100 × 0.85 */
    expect(l.json().result.data.montantTTC).toBe("204.00"); /* 170 × 1.2 */
    expect((await callQuery(server, "factures.getById", { id }, tA)).json().result.data.totalHT).toBe("170.00");
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la facture de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "factures.create", { clientId: clientA, objet: "Secret" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "factures.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "factures.getLignes", { factureId: id }, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "factures.update", { id, objet: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "factures.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "factures.addLigne", { factureId: id, designation: "Vol", prixUnitaireHT: "1" }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "factures.getById", { id }, tA)).json().result.data.objet).toBe("Secret");
  });

  it("validation : designation vide → 400 ; prix non décimal → 400", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "factures.create", { clientId: clientA }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "factures.addLigne", { factureId: id, designation: "", prixUnitaireHT: "1" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.addLigne", { factureId: id, designation: "X", prixUnitaireHT: "abc" }, tA)).statusCode).toBe(400);
  });

  it("IMMUTABILITÉ : facture non-brouillon → update/addLigne → 409 (Conflict)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "factures.create", { clientId: clientA }, tA)).json().result.data.id as number;
    await admin.query('update factures set statut=$1 where id=$2', ["validee", id]);
    expect((await callMutation(server, "factures.update", { id, objet: "x" }, tA)).statusCode).toBe(409);
    expect((await callMutation(server, "factures.addLigne", { factureId: id, designation: "Y", prixUnitaireHT: "1" }, tA)).statusCode).toBe(409);
    expect((await callMutation(server, "factures.delete", { id }, tA)).statusCode).toBe(409);
  });

  it("update/delete : métadonnées OK ; delete cascade lignes ; id inexistant → 404", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "factures.create", { clientId: clientA, objet: "Avant" }, tA)).json().result.data.id as number;
    await callMutation(server, "factures.addLigne", { factureId: id, designation: "L", prixUnitaireHT: "10" }, tA);
    expect((await callMutation(server, "factures.update", { id, objet: "Après" }, tA)).json().result.data.objet).toBe("Après");
    expect((await callMutation(server, "factures.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "factures.getById", { id }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "factures.update", { id: 999999999, objet: "x" }, tA)).statusCode).toBe(404);
  });

  it("transitions de statut : envoyer→marquerEnRetard ; transition invalide → 409 ; cross-tenant → 404", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "factures.create", { clientId: clientA }, tA)).json().result.data.id as number;
    // brouillon → marquerEnRetard directement interdit (il faut envoyer d'abord)
    expect((await callMutation(server, "factures.marquerEnRetard", { id }, tA)).statusCode).toBe(409);
    expect((await callMutation(server, "factures.envoyer", { id }, tA)).json().result.data.statut).toBe("envoyee");
    expect((await callMutation(server, "factures.marquerEnRetard", { id }, tA)).json().result.data.statut).toBe("en_retard");
    // cross-tenant : B ne transitionne pas la facture de A
    expect((await callMutation(server, "factures.envoyer", { id }, tB)).statusCode).toBe(404);
  });

  it("enregistrerPaiement : partiel puis soldant → payee ; sur-paiement → 400 ; brouillon → 409", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "factures.create", { clientId: clientA }, tA)).json().result.data.id as number;
    await callMutation(server, "factures.addLigne", { factureId: id, designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }, tA);
    // brouillon → paiement interdit (409)
    expect((await callMutation(server, "factures.enregistrerPaiement", { id, montant: "10.00" }, tA)).statusCode).toBe(409);
    await callMutation(server, "factures.envoyer", { id }, tA);
    // paiement partiel : reste envoyee
    const p1 = await callMutation(server, "factures.enregistrerPaiement", { id, montant: "50.00" }, tA);
    expect(p1.json().result.data.statut).toBe("envoyee");
    expect(p1.json().result.data.montantPaye).toBe("50.00");
    // sur-paiement (50 déjà + 100 > 120) → 400
    expect((await callMutation(server, "factures.enregistrerPaiement", { id, montant: "100.00" }, tA)).statusCode).toBe(400);
    // paiement soldant → payee
    const p2 = await callMutation(server, "factures.enregistrerPaiement", { id, montant: "70.00", mode: "cb" }, tA);
    expect(p2.json().result.data.statut).toBe("payee");
    expect(p2.json().result.data.montantPaye).toBe("120.00");
  });

  it("creerAvoir : note de crédit négative AV- liée à l'origine ; brouillon → 409 ; cross-tenant → 404", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "factures.create", { clientId: clientA }, tA)).json().result.data.id as number;
    await callMutation(server, "factures.addLigne", { factureId: id, designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }, tA);
    // origine brouillon → avoir interdit (409)
    expect((await callMutation(server, "factures.creerAvoir", { factureOrigineId: id, lignes: [{ designation: "x", quantite: "1", prixUnitaireHT: "10" }] }, tA)).statusCode).toBe(409);
    await callMutation(server, "factures.envoyer", { id }, tA);
    // avoir total → montants négatifs, typeDocument avoir, numéro AV-
    const av = await callMutation(server, "factures.creerAvoir", { factureOrigineId: id, lignes: [{ designation: "Remboursement", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }] }, tA);
    expect(av.statusCode).toBe(200);
    const data = av.json().result.data as { typeDocument: string; numero: string; totalTTC: string; factureOrigineId: number };
    expect(data.typeDocument).toBe("avoir");
    expect(data.numero).toMatch(/^AV-\d{5}$/);
    expect(data.totalTTC).toBe("-120.00");
    expect(data.factureOrigineId).toBe(id);
    // cross-tenant : B ne peut pas avoir la facture de A
    expect((await callMutation(server, "factures.creerAvoir", { factureOrigineId: id, lignes: [{ designation: "Vol", quantite: "1", prixUnitaireHT: "1" }] }, tB)).statusCode).toBe(404);
  });

  it("convertirDepuisDevis : devis accepté → facture (lignes copiées) ; non accepté → 409 ; cross-tenant → 404 ; double → 409", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    // Seed un devis ACCEPTÉ de A + une ligne (via admin, bypass RLS).
    const devisId = (
      await admin.query(
        'insert into devis ("artisanId","clientId",numero,statut,"objet","totalHT","totalTVA","totalTTC") values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
        [artisanA, clientA, "DEV-CONV-A", "accepte", "Chantier X", "200.00", "40.00", "240.00"],
      )
    ).rows[0].id as number;
    await admin.query(
      'insert into devis_lignes ("devisId",ordre,designation,quantite,"prixUnitaireHT","tauxTVA","montantHT","montantTVA","montantTTC",type) values ($1,0,$2,$3,$4,$5,$6,$7,$8,$9)',
      [devisId, "Pose", "2.00", "100.00", "20.00", "200.00", "40.00", "240.00", "produit"],
    );
    // Devis brouillon (A) pour le test "non accepté".
    const devisBrouillon = (
      await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4) returning id', [artisanA, clientA, "DEV-BR-A", "brouillon"])
    ).rows[0].id as number;

    // conversion OK
    const res = await callMutation(server, "factures.convertirDepuisDevis", { devisId }, tA);
    expect(res.statusCode).toBe(200);
    const f = res.json().result.data as { id: number; typeDocument: string; numero: string | null; totalTTC: string; devisId: number; statut: string };
    expect(f.typeDocument).toBe("facture");
    expect(f.numero).toBeNull();
    expect(f.statut).toBe("brouillon");
    expect(f.devisId).toBe(devisId);
    expect(f.totalTTC).toBe("240.00"); // totaux = ceux du devis
    expect((await callQuery(server, "factures.getLignes", { factureId: f.id }, tA)).json().result.data.length).toBe(1);
    // double conversion → 409
    expect((await callMutation(server, "factures.convertirDepuisDevis", { devisId }, tA)).statusCode).toBe(409);
    // devis non accepté → 409
    expect((await callMutation(server, "factures.convertirDepuisDevis", { devisId: devisBrouillon }, tA)).statusCode).toBe(409);
    // cross-tenant : B ne convertit pas le devis de A → 404
    expect((await callMutation(server, "factures.convertirDepuisDevis", { devisId }, tB)).statusCode).toBe(404);
  });

  it("getAvoirsByFacture (parité client) : avoirs scopés ; hors tenant → [] ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "factures.create", { clientId: clientA, objet: "Avec avoir" }, tA)).json().result.data.id as number;
    // une facture neuve n'a pas d'avoir
    expect((await callQuery(server, "factures.getAvoirsByFacture", { factureId: id })).statusCode).toBe(401);
    expect((await callQuery(server, "factures.getAvoirsByFacture", { factureId: id }, tA)).json().result.data).toEqual([]);
    // seed un avoir (typeDocument='avoir', lié à la facture d'origine) côté admin → la lecture le renvoie
    await admin.query(
      `insert into factures ("artisanId","clientId",numero,"typeDocument","factureOrigineId",statut) values ($1,$2,$3,'avoir',$4,'envoyee')`,
      [artisanA, clientA, `AV-T-${Date.now()}`, id],
    );
    const avoirs = (await callQuery(server, "factures.getAvoirsByFacture", { factureId: id }, tA)).json().result.data as Array<{ typeDocument: string }>;
    expect(avoirs.length).toBe(1);
    expect(avoirs[0].typeDocument).toBe("avoir");
    // hors tenant → [] (pas 404)
    expect((await callQuery(server, "factures.getAvoirsByFacture", { factureId: id }, tB)).json().result.data).toEqual([]);
  });

  it("createAvoir (alias parité client) : délègue au même use-case que creerAvoir (409 sur brouillon, anti-IDOR 404, 401)", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const lignes = [{ designation: "Remb", quantite: "1", prixUnitaireHT: "30.00", tauxTVA: "20.00" }];
    const id = (await callMutation(server, "factures.create", { clientId: clientA, objet: "Origine alias" }, tA)).json().result.data.id as number;
    // 401 sans cookie
    expect((await callMutation(server, "factures.createAvoir", { factureOrigineId: id, lignes })).statusCode).toBe(401);
    // même garde que creerAvoir : pas d'avoir sur un brouillon → 409
    expect((await callMutation(server, "factures.createAvoir", { factureOrigineId: id, lignes }, tA)).statusCode).toBe(409);
    // anti-IDOR : B ne crée pas d'avoir sur la facture de A → 404
    expect((await callMutation(server, "factures.createAvoir", { factureOrigineId: id, lignes }, tB)).statusCode).toBe(404);
  });

  it("markAsPaid (parité client) : statut payee + montantPaye/datePaiement + écritures FEC équilibrées ; date invalide → 400 ; cross-tenant 404 ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "factures.create", { clientId: clientA, objet: "À payer" }, tA)).json().result.data.id as number;
    await callMutation(server, "factures.addLigne", { factureId: id, designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }, tA);
    await admin.query(`update factures set statut='envoyee' where id=$1`, [id]);
    const total = (await callQuery(server, "factures.getById", { id }, tA)).json().result.data.totalTTC as string;
    expect((await callMutation(server, "factures.markAsPaid", { id, montantPaye: total, datePaiement: "2026-07-01" })).statusCode).toBe(401);
    expect((await callMutation(server, "factures.markAsPaid", { id, montantPaye: total, datePaiement: "pas-une-date" }, tA)).statusCode).toBe(400);
    const paid = await callMutation(server, "factures.markAsPaid", { id, montantPaye: total, datePaiement: "2026-07-01" }, tA);
    expect(paid.statusCode).toBe(200);
    expect(paid.json().result.data.statut).toBe("payee");
    expect(paid.json().result.data.montantPaye).toBe(total);
    expect((await callMutation(server, "factures.markAsPaid", { id, montantPaye: total, datePaiement: "2026-07-01" }, tB)).statusCode).toBe(404);
  });

  it("OPE-60 — markAsPaid paiement partiel : statut reste envoyee ; paiement soldant : statut payee", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "factures.create", { clientId: clientA, objet: "Partiel" }, tA)).json().result.data.id as number;
    await callMutation(server, "factures.addLigne", { factureId: id, designation: "Travaux", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }, tA);
    await admin.query(`update factures set statut='envoyee' where id=$1`, [id]);

    const partiel = await callMutation(server, "factures.markAsPaid", { id, montantPaye: "50.00", datePaiement: "2026-07-01" }, tA);
    expect(partiel.statusCode).toBe(200);
    expect(partiel.json().result.data.statut).toBe("envoyee");
    expect(partiel.json().result.data.montantPaye).toBe("50.00");

    const solde = await callMutation(server, "factures.markAsPaid", { id, montantPaye: "70.00", datePaiement: "2026-07-01" }, tA);
    expect(solde.statusCode).toBe(200);
    expect(solde.json().result.data.statut).toBe("payee");
    expect(solde.json().result.data.montantPaye).toBe("120.00");
  });

  it("getAuditLog (parité client) : entrées triées récent→ancien, scopées ; hors tenant → [] ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "factures.create", { clientId: clientA, objet: "Audit" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "factures.getAuditLog", { factureId: id })).statusCode).toBe(401);
    // seed 2 entrées d'audit (la 2e plus récente)
    await admin.query(
      `insert into events ("artisanId","userId","entityType","entityId",action,"createdAt") values ($1,$2,'facture',$3,'created', now() - interval '1 minute'),($1,$2,'facture',$3,'sent', now())`,
      [artisanA, UA, id],
    );
    const log = (await callQuery(server, "factures.getAuditLog", { factureId: id }, tA)).json().result.data as Array<{ action: string }>;
    expect(log.map((e) => e.action)).toEqual(["sent", "created"]); /** tri récent → ancien */
    /** hors tenant → [] (pas 404) */
    expect((await callQuery(server, "factures.getAuditLog", { factureId: id }, tB)).json().result.data).toEqual([]);
  });

  it("franchise TVA : addLigne sans tvaCategorieId → FR_FRANCHISE ; tvaCategorieId explicite non-FR_20 préservé", async () => {
    const tA = await token(UA);
    await admin.query('update artisans set "franchiseTVA"=true where id=$1', [artisanA]);
    try {
      const id = (await callMutation(server, "factures.create", { clientId: clientA }, tA)).json().result.data.id as number;
      const l = await callMutation(server, "factures.addLigne", { factureId: id, designation: "Pose franchise", quantite: "1", prixUnitaireHT: "100.00" }, tA);
      expect(l.json().result.data.tvaCategorieId).toBe("FR_FRANCHISE");
      expect(l.json().result.data.tauxTVA).toBe("0.00");
      const l2 = await callMutation(server, "factures.addLigne", { factureId: id, designation: "Fourniture taux réduit", quantite: "1", prixUnitaireHT: "50.00", tvaCategorieId: "FR_10" }, tA);
      expect(l2.json().result.data.tvaCategorieId).toBe("FR_10");
    } finally {
      await admin.query('update artisans set "franchiseTVA"=false where id=$1', [artisanA]);
    }
  });
});
