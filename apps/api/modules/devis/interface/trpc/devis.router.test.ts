import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DevisRepositoryDrizzle } from "../../infra/devis-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9893101;
const UB = 9893102;

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

describe.skipIf(!URL)("devis.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from parametres_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
    await admin.query('delete from permissions_utilisateur where "userId"=$1', [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      for (const __p of ["devis.creer", "factures.creer"]) await admin.query('insert into permissions_utilisateur ("userId", permission, autorise) values ($1,$2,true)', [uid, __p]);
    }
    artisanA = (await admin.query('insert into artisans ("userId",siret) values ($1,$2) returning id', [UA, "73282932000074"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId",siret) values ($1,$2) returning id', [UB, "73282932000074"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "Client B"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), devisRepo: new DevisRepositoryDrizzle(app.db), devisDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → devis.list 401", async () => {
    expect((await callQuery(server, "devis.list", undefined)).statusCode).toBe(401);
  });

  it("create : numéro auto serveur + statut brouillon + list scopé", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "devis.create", { clientId: clientA, objet: "Réno" }, tA);
    expect(created.statusCode).toBe(200);
    const d = created.json().result.data as { id: number; numero: string; statut: string; totalTTC: string };
    expect(d.numero).toMatch(/^DEV-\d{5}$/);
    expect(d.statut).toBe("brouillon");
    expect(d.totalTTC).toBe("0.00");
    const list = await callQuery(server, "devis.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((x) => x.id === d.id)).toBe(true);
  });

  it("ANTI-IDOR-FK : create avec un clientId d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "devis.create", { clientId: clientB, objet: "Vol" }, tA)).statusCode).toBe(404);
  });

  it("lignes : addLigne recalcule le total ; section neutre", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "devis.create", { clientId: clientA }, tA)).json().result.data.id as number;
    const l = await callMutation(server, "devis.addLigne", { devisId: id, designation: "Pose", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" }, tA);
    expect(l.json().result.data.montantTTC).toBe("240.00");
    await callMutation(server, "devis.addLigne", { devisId: id, designation: "— Lot —", type: "section", quantite: "9", prixUnitaireHT: "999" }, tA);
    expect((await callQuery(server, "devis.getById", { id }, tA)).json().result.data.totalTTC).toBe("240.00");
    expect((await callQuery(server, "devis.getLignes", { devisId: id }, tA)).json().result.data.length).toBe(2);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le devis de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "devis.create", { clientId: clientA, objet: "Secret" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "devis.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "devis.getLignes", { devisId: id }, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "devis.update", { id, objet: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "devis.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "Vol", prixUnitaireHT: "1" }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "devis.getById", { id }, tA)).json().result.data.objet).toBe("Secret");
  });

  it("validation : designation vide → 400 ; prix non décimal → 400", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "devis.create", { clientId: clientA }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "", prixUnitaireHT: "1" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "X", prixUnitaireHT: "abc" }, tA)).statusCode).toBe(400);
  });

  it("envoyerRelance : devis accepté → 400 ; devis refusé → 400", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "devis.create", { clientId: clientA }, tA)).json().result.data.id as number;
    await admin.query("update devis set statut=$1 where id=$2", ["accepte", id]);
    expect((await callMutation(server, "devis.envoyerRelance", { devisId: id }, tA)).statusCode).toBe(400);
    await admin.query("update devis set statut=$1 where id=$2", ["refuse", id]);
    expect((await callMutation(server, "devis.envoyerRelance", { devisId: id }, tA)).statusCode).toBe(400);
  });

  it("IMMUTABILITÉ : un devis envoyé → update/addLigne → 409 (Conflict)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "devis.create", { clientId: clientA }, tA)).json().result.data.id as number;
    await admin.query('update devis set statut=$1 where id=$2', ["envoye", id]);
    expect((await callMutation(server, "devis.update", { id, objet: "x" }, tA)).statusCode).toBe(409);
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "Y", prixUnitaireHT: "1" }, tA)).statusCode).toBe(409);
  });

  it("IMMUTABILITÉ : un devis accepté → update/addLigne → 409 (Conflict)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "devis.create", { clientId: clientA }, tA)).json().result.data.id as number;
    await admin.query('update devis set statut=$1 where id=$2', ["accepte", id]);
    expect((await callMutation(server, "devis.update", { id, objet: "x" }, tA)).statusCode).toBe(409);
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "Y", prixUnitaireHT: "1" }, tA)).statusCode).toBe(409);
  });

  it("update/delete : métadonnées OK ; delete cascade lignes ; id inexistant → 404", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "devis.create", { clientId: clientA, objet: "Avant" }, tA)).json().result.data.id as number;
    await callMutation(server, "devis.addLigne", { devisId: id, designation: "L", prixUnitaireHT: "10" }, tA);
    expect((await callMutation(server, "devis.update", { id, objet: "Après" }, tA)).json().result.data.objet).toBe("Après");
    expect((await callMutation(server, "devis.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "devis.getById", { id }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "devis.update", { id: 999999999, objet: "x" }, tA)).statusCode).toBe(404);
  });

  it("transitions de statut : envoyer→accepter ; transition invalide → 409 ; cross-tenant → 404", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "devis.create", { clientId: clientA }, tA)).json().result.data.id as number;
    /** brouillon → accepter directement interdit (409) */
    expect((await callMutation(server, "devis.accepter", { id }, tA)).statusCode).toBe(409);
    expect((await callMutation(server, "devis.envoyer", { id }, tA)).json().result.data.statut).toBe("envoye");
    expect((await callMutation(server, "devis.accepter", { id }, tA)).json().result.data.statut).toBe("accepte");
    /** accepté = terminal : refuser → 409 */
    expect((await callMutation(server, "devis.refuser", { id }, tA)).statusCode).toBe(409);
    /** cross-tenant : B ne transitionne pas le devis de A */
    expect((await callMutation(server, "devis.envoyer", { id }, tB)).statusCode).toBe(404);
  });

  it("franchise TVA : addLigne sans tvaCategorieId → FR_FRANCHISE ; tvaCategorieId explicite non-FR_20 préservé", async () => {
    const tA = await token(UA);
    await admin.query('update artisans set "franchiseTVA"=true where id=$1', [artisanA]);
    try {
      const id = (await callMutation(server, "devis.create", { clientId: clientA }, tA)).json().result.data.id as number;
      const l = await callMutation(server, "devis.addLigne", { devisId: id, designation: "Pose franchise", quantite: "1", prixUnitaireHT: "100.00" }, tA);
      expect(l.json().result.data.tvaCategorieId).toBe("FR_FRANCHISE");
      expect(l.json().result.data.tauxTVA).toBe("0.00");
      const l2 = await callMutation(server, "devis.addLigne", { devisId: id, designation: "Fourniture taux réduit", quantite: "1", prixUnitaireHT: "50.00", tvaCategorieId: "FR_10" }, tA);
      expect(l2.json().result.data.tvaCategorieId).toBe("FR_10");
    } finally {
      await admin.query('update artisans set "franchiseTVA"=false where id=$1', [artisanA]);
    }
  });

  it("outbox atomicité — create → devis ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "devis.create", { clientId: clientA }, tA);
    expect(res.statusCode).toBe(200);
    const devisId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='devis.cree'", [devisId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("devis");
    expect((row.payload as { numero?: string }).numero).toMatch(/^DEV-/);
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — accepter → event_outbox action=devis.accepte avec userId tracé", async () => {
    const tA = await token(UA);
    const created = (await callMutation(server, "devis.create", { clientId: clientA }, tA)).json().result.data.id as number;
    await callMutation(server, "devis.envoyer", { id: created }, tA);
    const res = await callMutation(server, "devis.accepter", { id: created }, tA);
    expect(res.statusCode).toBe(200);
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='devis.accepte'", [created])).rows[0];
    expect(row).toBeDefined();
    expect(row.userId).toBe(UA);
    expect(row.artisanId).toBe(artisanA);
  });

  it("outbox atomicité — rollback: throw après write devis → 0 devis ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new DevisRepositoryDrizzle(app.db);
    const devisBefore = Number((await admin.query('select count(*) from devis where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        const numero = await r.nextNumero(ctx);
        await r.create(ctx, { clientId: clientA, numero });
        if (tx) await outboxEvent(tx, ctx, { action: "devis.cree", entityType: "devis", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const devisAfter = Number((await admin.query('select count(*) from devis where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(devisAfter).toBe(devisBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});
