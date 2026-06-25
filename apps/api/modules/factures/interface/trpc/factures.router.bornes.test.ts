import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { FactureRepositoryDrizzle } from "../../infra/facture-repository-drizzle";
import { NoopComptaPort } from "../../application/compta-port";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

// Durcissement e2e du domaine factures : bornes zod exhaustives + invariants du transport
// (numero/statut/totaux/montantPaye inviolables, ligne liée à la facture ciblée). Complète
// factures.router.test.ts. ⚠️ Pièce comptable légale.

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9894301;
const UB = 9894302;

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

const UC = 9894303;

describe.skipIf(!URL)("factures.router e2e — bornes & invariants transport", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanC = 0;
  let clientA = 0;
  let clientC = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from parametres_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB, UC]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanC = (await admin.query('insert into artisans ("userId","franchiseTVA") values ($1,true) returning id', [UC])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientC = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanC, "Client C"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), factureRepo: new FactureRepositoryDrizzle(app.db), compta: new NoopComptaPort() });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB, UC]) await purge(uid);
    await app.close();
    await admin.end();
  });

  async function createFacture(tok: string, over: Record<string, unknown> = {}): Promise<number> {
    const res = await callMutation(server, "factures.create", { clientId: clientA, ...over }, tok);
    return res.json().result.data.id as number;
  }

  it("create — bornes max (objet>500, referenceClient>100, siretDestinataire>14, conditionsPaiement>2000, notes>5000) → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "factures.create", { clientId: clientA, objet: "x".repeat(501) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.create", { clientId: clientA, referenceClient: "x".repeat(101) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.create", { clientId: clientA, siretDestinataire: "1".repeat(15) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.create", { clientId: clientA, conditionsPaiement: "x".repeat(2001) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.create", { clientId: clientA, notes: "x".repeat(5001) }, tA)).statusCode).toBe(400);
  });

  it("create — dateEcheance invalide + typeDocument invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "factures.create", { clientId: clientA, dateEcheance: "31/12/2026" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.create", { clientId: clientA, typeDocument: "ticket" }, tA)).statusCode).toBe(400);
  });

  it("addLigne — bornes (designation>500, reference>50, unite>20) + prix négatif + type invalide → 400", async () => {
    const tA = await token(UA);
    const id = await createFacture(tA);
    expect((await callMutation(server, "factures.addLigne", { factureId: id, designation: "x".repeat(501), prixUnitaireHT: "1" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.addLigne", { factureId: id, designation: "OK", prixUnitaireHT: "1", reference: "r".repeat(51) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.addLigne", { factureId: id, designation: "OK", prixUnitaireHT: "1", unite: "u".repeat(21) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.addLigne", { factureId: id, designation: "OK", prixUnitaireHT: "-5" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "factures.addLigne", { factureId: id, designation: "OK", prixUnitaireHT: "1", type: "materiel" }, tA)).statusCode).toBe(400);
  });

  it("INVARIANT transport : numero/statut/totaux/montantPaye envoyés au create sont IGNORÉS", async () => {
    const tA = await token(UA);
    const res = await callMutation(
      server,
      "factures.create",
      { clientId: clientA, objet: "Falsif", numero: "HACK-999", statut: "payee", totalTTC: "9999.99", montantPaye: "9999.99" },
      tA,
    );
    expect(res.statusCode).toBe(200);
    const f = res.json().result.data as { numero: string; statut: string; totalTTC: string; montantPaye: string };
    expect(f.numero).toMatch(/^FAC-\d{5}$/); // numéro serveur, pas "HACK-999"
    expect(f.statut).toBe("brouillon"); // pas "payee"
    expect(f.totalTTC).toBe("0.00"); // dérivé des lignes
    expect(f.montantPaye).toBe("0.00"); // paiement = use-case dédié, pas falsifiable
  });

  it("INVARIANT transport : numero/statut/totaux/montantPaye envoyés au update sont IGNORÉS", async () => {
    const tA = await token(UA);
    const id = await createFacture(tA, { objet: "Avant" });
    const numAvant = (await callQuery(server, "factures.getById", { id }, tA)).json().result.data.numero as string;
    const res = await callMutation(
      server,
      "factures.update",
      { id, objet: "Après", numero: "HACK-1", statut: "payee", totalTTC: "5000.00", montantPaye: "5000.00" },
      tA,
    );
    expect(res.statusCode).toBe(200);
    const f = res.json().result.data as { numero: string; statut: string; totalTTC: string; montantPaye: string; objet: string };
    expect(f.objet).toBe("Après");
    expect(f.numero).toBe(numAvant); // immuable
    expect(f.statut).toBe("brouillon"); // non modifiable via update
    expect(f.totalTTC).toBe("0.00"); // pas falsifiable
    expect(f.montantPaye).toBe("0.00"); // pas falsifiable
  });

  it("envoyer — SIRET artisan absent → 400 ; SIRET présent → 200", async () => {
    // artisanA n'a pas de SIRET (insert sans siret dans beforeAll)
    const tA = await token(UA);
    const id = await createFacture(tA);
    expect((await callMutation(server, "factures.envoyer", { id }, tA)).statusCode).toBe(400);
    await admin.query('update artisans set siret=$1 where id=$2', ["73282932000074", artisanA]);
    try {
      expect((await callMutation(server, "factures.envoyer", { id }, tA)).statusCode).toBe(200);
    } finally {
      await admin.query('update artisans set siret=null where id=$1', [artisanA]);
    }
  });

  it("updateLigne/deleteLigne — recalculs ; ligne d'une AUTRE facture du tenant → 404 ; ligne inexistante → 404", async () => {
    const tA = await token(UA);
    const id1 = await createFacture(tA);
    const id2 = await createFacture(tA);
    const l1 = (await callMutation(server, "factures.addLigne", { factureId: id1, designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }, tA)).json().result.data.id as number;
    // updateLigne avec le mauvais factureId (l1 appartient à id1, on prétend id2) → 404
    expect((await callMutation(server, "factures.updateLigne", { id: l1, factureId: id2, quantite: "5" }, tA)).statusCode).toBe(404);
    await callMutation(server, "factures.updateLigne", { id: l1, factureId: id1, quantite: "3" }, tA);
    expect((await callQuery(server, "factures.getById", { id: id1 }, tA)).json().result.data.totalTTC).toBe("360.00");
    expect((await callMutation(server, "factures.updateLigne", { id: 999999999, factureId: id1, quantite: "1" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "factures.deleteLigne", { id: 999999999, factureId: id1 }, tA)).statusCode).toBe(404);
    await callMutation(server, "factures.deleteLigne", { id: l1, factureId: id1 }, tA);
    expect((await callQuery(server, "factures.getById", { id: id1 }, tA)).json().result.data.totalTTC).toBe("0.00");
  });

  it("franchise TVA — addLigne sans tvaCategorieId → FR_FRANCHISE (0%) ; avec tvaCategorieId → respecté", async () => {
    const tC = await token(UC);
    const facId = (await callMutation(server, "factures.create", { clientId: clientC }, tC)).json().result.data.id as number;
    const l = (await callMutation(server, "factures.addLigne", { factureId: facId, designation: "Pose", prixUnitaireHT: "100.00" }, tC)).json().result.data as { tvaCategorieId: string; tauxTVA: string; montantTVA: string };
    expect(l.tvaCategorieId).toBe("FR_FRANCHISE");
    expect(l.tauxTVA).toBe("0");
    expect(l.montantTVA).toBe("0.00");
    const detail = (await callQuery(server, "factures.getById", { id: facId }, tC)).json().result.data as { totalTVA: string; totalTTC: string; totalHT: string };
    expect(detail.totalTVA).toBe("0.00");
    expect(detail.totalTTC).toBe("100.00");
    const l2 = (await callMutation(server, "factures.addLigne", { factureId: facId, designation: "Matériaux", prixUnitaireHT: "50.00", tvaCategorieId: "FR_20" }, tC)).json().result.data as { tvaCategorieId: string; tauxTVA: string };
    expect(l2.tvaCategorieId).toBe("FR_20");
    expect(l2.tauxTVA).toBe("20");
  });
});
