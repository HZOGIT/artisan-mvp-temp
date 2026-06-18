import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { RelanceDevisRepositoryDrizzle } from "../../infra/relance-devis-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9945201;
const UB = 9945202;

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

describe.skipIf(!URL)("relances.router e2e (HTTP → tRPC → use-case → repo → RLS, log append-only)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;
  let devisA = 0;
  let devisB = 0;

  const purge = async (uid: number) => {
    await admin.query('delete from relances_devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };
  beforeAll(async () => {
    let artisanA = 0;
    let artisanB = 0;
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      const aid = (await admin.query('insert into artisans ("userId") values ($1) returning id', [uid])).rows[0].id;
      if (uid === UA) artisanA = aid; else artisanB = aid;
    }
    const cA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "CA"])).rows[0].id;
    const cB = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanB, "CB"])).rows[0].id;
    devisA = (await admin.query('insert into devis ("artisanId", "clientId", numero) values ($1,$2,$3) returning id', [artisanA, cA, "DEV-A"])).rows[0].id;
    devisB = (await admin.query('insert into devis ("artisanId", "clientId", numero) values ($1,$2,$3) returning id', [artisanB, cB, "DEV-B"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), relanceDevisRepo: new RelanceDevisRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → relances.list 401", async () => {
    expect((await q(server, "relances.list", undefined)).statusCode).toBe(401);
  });

  it("create (devisId du tenant) + getById → statut envoye", async () => {
    const tA = await token(UA);
    const created = await mut(server, "relances.create", { devisId: devisA, type: "email", destinataire: "c@test.fr" }, tA);
    expect(created.statusCode).toBe(200);
    const r = created.json().result.data as { id: number; statut: string; type: string };
    expect(r.statut).toBe("envoye");
    expect(r.type).toBe("email");
    expect((await q(server, "relances.getById", { id: r.id }, tA)).json().result.data.devisId).toBe(devisA);
  });

  it("ANTI-IDOR : create avec un devisId d'un AUTRE tenant → 404", async () => {
    const tA = await token(UA);
    expect((await mut(server, "relances.create", { devisId: devisB, type: "email" }, tA)).statusCode).toBe(404);
  });

  it("byDevis : filtre scopé ; [] pour un devis sans relance", async () => {
    const tA = await token(UA);
    await mut(server, "relances.create", { devisId: devisA, type: "notification" }, tA);
    const rel = (await q(server, "relances.byDevis", { devisId: devisA }, tA)).json().result.data as Array<{ devisId: number }>;
    expect(rel.length).toBeGreaterThan(0);
    expect(rel.every((x) => x.devisId === devisA)).toBe(true);
    expect((await q(server, "relances.byDevis", { devisId: 999999999 }, tA)).json().result.data).toEqual([]);
  });

  it("validations → 400 : type hors enum, statut hors enum", async () => {
    const tA = await token(UA);
    expect((await mut(server, "relances.create", { devisId: devisA, type: "sms" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "relances.create", { devisId: devisA, type: "email", statut: "en_cours" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/supprime pas la relance de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await mut(server, "relances.create", { devisId: devisA, type: "email" }, tA)).json().result.data.id as number;
    expect((await q(server, "relances.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "relances.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await q(server, "relances.byDevis", { devisId: devisA }, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "relances.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "relances.getById", { id }, tA)).statusCode).toBe(200);
  });

  it("delete OK propriétaire ; id inexistant → 404 ; pas de procédure update", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "relances.create", { devisId: devisA, type: "email" }, tA)).json().result.data.id as number;
    expect((await mut(server, "relances.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await q(server, "relances.getById", { id }, tA)).statusCode).toBe(404);
    expect((await mut(server, "relances.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
    // immuabilité : la procédure update n'existe pas → route inexistante (404)
    expect((await mut(server, "relances.update", { id }, tA)).statusCode).toBe(404);
  });
});
