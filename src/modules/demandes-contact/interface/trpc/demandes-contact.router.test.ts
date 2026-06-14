import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DemandeContactRepositoryDrizzle } from "../../infra/demande-contact-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9945801;
const UB = 9945802;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return app.inject({ method: "POST", url: `/api/trpc/${path}`, headers: { "content-type": "application/json", ...(tok ? { cookie: `token=${tok}` } : {}) }, payload: JSON.stringify(input) });
}
function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return app.inject({ method: "GET", url: `/api/trpc/${path}${qs}`, headers: tok ? { cookie: `token=${tok}` } : {} });
}

describe.skipIf(!URL)("demandesContact.router e2e (HTTP → tRPC → use-case → repo → RLS + état machine)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;
  let clientA = 0;
  let clientB = 0;

  const purge = async (uid: number) => {
    await admin.query('delete from demandes_contact where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    const artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    const artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "CA"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanB, "CB"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), demandeContactRepo: new DemandeContactRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  const creer = (tok: string, over: Record<string, unknown> = {}) =>
    mut(server, "demandesContact.create", { nom: "Jean Dupont", ...over }, tok);

  it("sans cookie → demandesContact.list 401", async () => {
    expect((await q(server, "demandesContact.list", undefined)).statusCode).toBe(401);
  });

  it("create + getById → statut nouveau + clientId null + source défaut vitrine", async () => {
    const tA = await token(UA);
    const created = await creer(tA, { email: "jean@test.fr" });
    expect(created.statusCode).toBe(200);
    const d = created.json().result.data as { id: number; statut: string; clientId: number | null; source: string };
    expect(d.statut).toBe("nouveau");
    expect(d.clientId).toBeNull();
    expect(d.source).toBe("vitrine");
    expect((await q(server, "demandesContact.getById", { id: d.id }, tA)).json().result.data.nom).toBe("Jean Dupont");
  });

  it("validations → 400 : nom vide, email invalide", async () => {
    const tA = await token(UA);
    expect((await creer(tA, { nom: "" })).statusCode).toBe(400);
    expect((await creer(tA, { email: "pas-un-email" })).statusCode).toBe(400);
  });

  it("byStatut : filtre scopé ; statut sans demande → []", async () => {
    const tA = await token(UA);
    await creer(tA);
    const nouveaux = (await q(server, "demandesContact.byStatut", { statut: "nouveau" }, tA)).json().result.data as unknown[];
    expect(nouveaux.length).toBeGreaterThan(0);
    expect((await q(server, "demandesContact.byStatut", { statut: "perdu" }, tA)).json().result.data).toEqual([]);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime/transitionne pas la demande de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await creer(tA, { nom: "Secret" })).json().result.data.id as number;
    expect((await q(server, "demandesContact.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "demandesContact.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "demandesContact.update", { id, nom: "hack" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "demandesContact.marquerContacte", { id }, tB)).statusCode).toBe(404);
    expect((await mut(server, "demandesContact.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "demandesContact.getById", { id }, tA)).json().result.data.nom).toBe("Secret");
  });

  it("update ne change pas le statut/clientId", async () => {
    const tA = await token(UA);
    const id = (await creer(tA)).json().result.data.id as number;
    const maj = await mut(server, "demandesContact.update", { id, nom: "Modifié", telephone: "0600000000" }, tA);
    expect(maj.json().result.data.nom).toBe("Modifié");
    expect(maj.json().result.data.statut).toBe("nouveau"); // inchangé
    expect(maj.json().result.data.clientId).toBeNull(); // inchangé
  });

  it("transitions via l'API : marquerContacte/convertir(clientId)/marquerPerdu ; anti-IDOR + terminal 409", async () => {
    const tA = await token(UA);
    const id = (await creer(tA)).json().result.data.id as number;
    expect((await mut(server, "demandesContact.marquerContacte", { id }, tA)).json().result.data.statut).toBe("contacte");
    // anti-IDOR : convertir avec clientId d'un AUTRE tenant → 404
    expect((await mut(server, "demandesContact.convertir", { id, clientId: clientB }, tA)).statusCode).toBe(404);
    // convertir avec clientId du tenant → converti + lié
    const converti = await mut(server, "demandesContact.convertir", { id, clientId: clientA }, tA);
    expect(converti.json().result.data.statut).toBe("converti");
    expect(converti.json().result.data.clientId).toBe(clientA);
    // transition depuis terminal (converti) → 409
    expect((await mut(server, "demandesContact.marquerPerdu", { id }, tA)).statusCode).toBe(409);
    // marquerPerdu sur une autre demande (depuis nouveau) → perdu
    const id2 = (await creer(tA)).json().result.data.id as number;
    expect((await mut(server, "demandesContact.marquerPerdu", { id: id2 }, tA)).json().result.data.statut).toBe("perdu");
  });
});
