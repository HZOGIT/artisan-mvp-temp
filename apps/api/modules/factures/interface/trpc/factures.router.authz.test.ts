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

/** owner artisan (isOwner: true — bypass toutes les permissions) */
const OWNER = 9894401;
/** collaborateur non-owner de OWNER (isOwner: false — soumis aux gates) */
const MEMBER = 9894402;


const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
}

/**
 * Garde de permission sur les mutations financières factures (OPE-785).
 * Un collaborateur non-owner sans droit `factures.creer` / `factures.supprimer` doit obtenir 403.
 * Avec la permission ou en tant qu'owner, la mutation doit passer (200 ou erreur métier ≤ 409).
 */
describe.skipIf(!URL)("factures.router — gate de permission (authz OPE-785)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanId = 0;
  let clientId = 0;
  let server: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from permissions_utilisateur where "userId" in ($1,$2)', [OWNER, MEMBER]);
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in (select id from artisans where "userId"=$1))', [OWNER]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [OWNER]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [OWNER]);
    await admin.query('delete from artisans where "userId"=$1', [OWNER]);
    await admin.query("delete from users where id in ($1,$2)", [OWNER, MEMBER]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [OWNER, `u${OWNER}@t.fr`]);
    artisanId = (await admin.query<{ id: number }>('insert into artisans ("userId") values ($1) returning id', [OWNER])).rows[0].id;
    clientId = (await admin.query<{ id: number }>('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "Client Test"])).rows[0].id;
    /** MEMBER = collaborateur rattaché via users.artisanId (non-owner, isOwner: false) */
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'artisan\',$3)', [MEMBER, `u${MEMBER}@t.fr`, artisanId]);
    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(app.db),
      factureRepo: new FactureRepositoryDrizzle(app.db),
      compta: new NoopComptaPort(),
    });
  });

  afterAll(async () => {
    await server.close();
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("owner → create 200 (bypass permission)", async () => {
    const res = await mut(server, "factures.create", { clientId }, await jwt(OWNER));
    expect(res.statusCode).toBe(200);
  });

  it("membre sans permission → create 403", async () => {
    const res = await mut(server, "factures.create", { clientId }, await jwt(MEMBER));
    expect(res.statusCode).toBe(403);
  });

  it("membre avec factures.creer → create 200 ; update 200 ; addLigne 200 ; envoyer 200 ou 400", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [MEMBER, "factures.creer"]);
    const tok = await jwt(MEMBER);

    const created = await mut(server, "factures.create", { clientId }, tok);
    expect(created.statusCode).toBe(200);
    const fId = (created.json() as { result: { data: { id: number } } }).result.data.id;

    expect((await mut(server, "factures.update", { id: fId, objet: "Test authz" }, tok)).statusCode).toBe(200);
    expect((await mut(server, "factures.addLigne", { factureId: fId, designation: "Prestation", prixUnitaireHT: "100.00" }, tok)).statusCode).toBe(200);

    /** envoyer sans SIRET artisan → 400 (erreur métier = gate passée) */
    const envRes = await mut(server, "factures.envoyer", { id: fId }, tok);
    expect([200, 400]).toContain(envRes.statusCode);
  });

  it("membre avec factures.creer → enregistrerPaiement 403 si montant sur brouillon (erreur métier = 409)", async () => {
    const tok = await jwt(MEMBER);
    const fId = (await (mut(server, "factures.create", { clientId }, tok))).json() as { result: { data: { id: number } } };
    /** paiement sur brouillon → erreur métier 409 (= gate passée, le use-case rejette) */
    const res = await mut(server, "factures.enregistrerPaiement", { id: fId.result.data.id, montant: "50.00" }, tok);
    expect(res.statusCode).not.toBe(403);
  });

  it("membre avec factures.creer SANS factures.supprimer → delete 403", async () => {
    const tokOwner = await jwt(OWNER);
    const fId = ((await mut(server, "factures.create", { clientId }, tokOwner)).json() as { result: { data: { id: number } } }).result.data.id;
    const res = await mut(server, "factures.delete", { id: fId }, await jwt(MEMBER));
    expect(res.statusCode).toBe(403);
  });

  it("membre avec factures.supprimer → delete 200 (ou 404/409 si déjà supprimée)", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true) on conflict do nothing', [MEMBER, "factures.supprimer"]);
    const tokOwner = await jwt(OWNER);
    const fId = ((await mut(server, "factures.create", { clientId }, tokOwner)).json() as { result: { data: { id: number } } }).result.data.id;
    const res = await mut(server, "factures.delete", { id: fId }, await jwt(MEMBER));
    expect(res.statusCode).toBe(200);
  });

  it("list — membre sans factures.voir → 403", async () => {
    expect((await q(server, "factures.list", undefined, await jwt(MEMBER))).statusCode).toBe(403);
  });

  it("list — owner bypasse la garde → non-403", async () => {
    expect((await q(server, "factures.list", undefined, await jwt(OWNER))).statusCode).not.toBe(403);
  });

  it("list — membre AVEC factures.voir → non-403", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [MEMBER, "factures.voir"]);
    expect((await q(server, "factures.list", undefined, await jwt(MEMBER))).statusCode).not.toBe(403);
    await admin.query('delete from permissions_utilisateur where "userId"=$1 and permission=$2', [MEMBER, "factures.voir"]);
  });

  it("getById — membre sans factures.voir → 403", async () => {
    expect((await q(server, "factures.getById", { id: 1 }, await jwt(MEMBER))).statusCode).toBe(403);
  });

  it("getById — owner bypasse la garde → non-403", async () => {
    expect((await q(server, "factures.getById", { id: 999999999 }, await jwt(OWNER))).statusCode).not.toBe(403);
  });

  it("getLignes — membre sans factures.voir → 403", async () => {
    expect((await q(server, "factures.getLignes", { factureId: 1 }, await jwt(MEMBER))).statusCode).toBe(403);
  });

  it("getLignes — owner bypasse la garde → non-403", async () => {
    expect((await q(server, "factures.getLignes", { factureId: 999999999 }, await jwt(OWNER))).statusCode).not.toBe(403);
  });

  it("getAvoirsByFacture — membre sans factures.voir → 403", async () => {
    expect((await q(server, "factures.getAvoirsByFacture", { factureId: 1 }, await jwt(MEMBER))).statusCode).toBe(403);
  });

  it("getAvoirsByFacture — owner bypasse la garde → non-403", async () => {
    expect((await q(server, "factures.getAvoirsByFacture", { factureId: 999999999 }, await jwt(OWNER))).statusCode).not.toBe(403);
  });

  it("getAuditLog — membre sans factures.voir → 403", async () => {
    expect((await q(server, "factures.getAuditLog", { factureId: 1 }, await jwt(MEMBER))).statusCode).toBe(403);
  });

  it("getAuditLog — owner bypasse la garde → non-403", async () => {
    expect((await q(server, "factures.getAuditLog", { factureId: 999999999 }, await jwt(OWNER))).statusCode).not.toBe(403);
  });
});
