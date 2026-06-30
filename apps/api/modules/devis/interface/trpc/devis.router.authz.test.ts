import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DevisRepositoryDrizzle } from "../../infra/devis-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

/** owner artisan (isOwner: true — bypass toutes les permissions) */
const OWNER = 9895501;
/** collaborateur non-owner de OWNER (isOwner: false — soumis aux gates) */
const MEMBER = 9895502;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

/**
 * Garde de permission sur les mutations devis (OPE-789).
 * Un collaborateur non-owner sans droit `devis.creer` doit obtenir 403 sur create/update/delete/envoyer/accepter.
 * Avec la permission ou en tant qu'owner, la mutation doit passer (200 ou erreur métier ≤ 409).
 */
describe.skipIf(!URL)("devis.router — gate de permission (authz OPE-789)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanId = 0;
  let clientId = 0;
  let server: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from permissions_utilisateur where "userId" in ($1,$2)', [OWNER, MEMBER]);
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [OWNER]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [OWNER]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [OWNER]);
    await admin.query('delete from artisans where "userId"=$1', [OWNER]);
    await admin.query("delete from users where id in ($1,$2)", [OWNER, MEMBER]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [OWNER, `u${OWNER}@t.fr`]);
    artisanId = (await admin.query<{ id: number }>('insert into artisans ("userId") values ($1) returning id', [OWNER])).rows[0].id;
    clientId = (await admin.query<{ id: number }>('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "Client Authz Test"])).rows[0].id;
    /** MEMBER = collaborateur rattaché via users.artisanId (non-owner, isOwner: false) */
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'artisan\',$3)', [MEMBER, `u${MEMBER}@t.fr`, artisanId]);
    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(app.db),
      devisRepo: new DevisRepositoryDrizzle(app.db),
      devisDb: app.db,
    });
  });

  afterAll(async () => {
    await server.close();
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("owner → create 200 (bypass permission)", async () => {
    const res = await mut(server, "devis.create", { clientId }, await jwt(OWNER));
    expect(res.statusCode).toBe(200);
  });

  it("membre sans permission → create 403", async () => {
    const res = await mut(server, "devis.create", { clientId }, await jwt(MEMBER));
    expect(res.statusCode).toBe(403);
  });

  it("membre sans permission → update 403", async () => {
    const tokOwner = await jwt(OWNER);
    const id = ((await mut(server, "devis.create", { clientId }, tokOwner)).json() as { result: { data: { id: number } } }).result.data.id;
    const res = await mut(server, "devis.update", { id, objet: "hack" }, await jwt(MEMBER));
    expect(res.statusCode).toBe(403);
  });

  it("membre sans permission → delete 403", async () => {
    const tokOwner = await jwt(OWNER);
    const id = ((await mut(server, "devis.create", { clientId }, tokOwner)).json() as { result: { data: { id: number } } }).result.data.id;
    const res = await mut(server, "devis.delete", { id }, await jwt(MEMBER));
    expect(res.statusCode).toBe(403);
  });

  it("membre sans permission → envoyer 403", async () => {
    const tokOwner = await jwt(OWNER);
    const id = ((await mut(server, "devis.create", { clientId }, tokOwner)).json() as { result: { data: { id: number } } }).result.data.id;
    const res = await mut(server, "devis.envoyer", { id }, await jwt(MEMBER));
    expect(res.statusCode).toBe(403);
  });

  it("membre sans permission → accepter 403", async () => {
    const tokOwner = await jwt(OWNER);
    const id = ((await mut(server, "devis.create", { clientId }, tokOwner)).json() as { result: { data: { id: number } } }).result.data.id;
    await admin.query("update devis set statut='envoye' where id=$1", [id]);
    const res = await mut(server, "devis.accepter", { id }, await jwt(MEMBER));
    expect(res.statusCode).toBe(403);
  });

  it("membre avec devis.creer → create/update/envoyer/accepter 200 ou erreur métier ≠ 403", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [MEMBER, "devis.creer"]);
    const tok = await jwt(MEMBER);

    const created = await mut(server, "devis.create", { clientId, objet: "Test authz" }, tok);
    expect(created.statusCode).toBe(200);
    const id = (created.json() as { result: { data: { id: number } } }).result.data.id;

    expect((await mut(server, "devis.update", { id, objet: "Mis à jour" }, tok)).statusCode).toBe(200);
    /** envoyer sans SIRET artisan peut retourner 400 (erreur métier) — le gate authz est passé */
    expect((await mut(server, "devis.envoyer", { id }, tok)).statusCode).not.toBe(403);
    /** accepter nécessite statut envoye — on force via admin pour tester le gate */
    await admin.query("update devis set statut='envoye' where id=$1", [id]);
    expect((await mut(server, "devis.accepter", { id }, tok)).statusCode).not.toBe(403);
  });

  it("membre avec devis.creer SANS devis.supprimer → delete 403", async () => {
    const tokOwner = await jwt(OWNER);
    const id = ((await mut(server, "devis.create", { clientId }, tokOwner)).json() as { result: { data: { id: number } } }).result.data.id;
    const res = await mut(server, "devis.delete", { id }, await jwt(MEMBER));
    expect(res.statusCode).toBe(403);
  });

  it("membre avec devis.supprimer → delete 200", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true) on conflict do nothing', [MEMBER, "devis.supprimer"]);
    const tokOwner = await jwt(OWNER);
    const id = ((await mut(server, "devis.create", { clientId }, tokOwner)).json() as { result: { data: { id: number } } }).result.data.id;
    const res = await mut(server, "devis.delete", { id }, await jwt(MEMBER));
    expect(res.statusCode).toBe(200);
  });
});
