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

describe.skipIf(!URL)("commandes.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let fournA = 0;
  let fournB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from lignes_commandes_fournisseurs where "commandeId" in (select id from commandes_fournisseurs where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from commandes_fournisseurs where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from fournisseurs where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
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
      await admin.query('delete from lignes_commandes_fournisseurs where "commandeId" in (select id from commandes_fournisseurs where "artisanId"=$1)', [aId]);
      await admin.query('delete from commandes_fournisseurs where "artisanId"=$1', [aId]);
      await admin.query('delete from fournisseurs where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  const ligne = { designation: "Tube", quantite: 10, prixUnitaire: 5, tauxTVA: 20 };

  it("sans cookie → commandes.list 401", async () => {
    expect((await callQuery(server, "commandes.list", undefined)).statusCode).toBe(401);
  });

  it("create (totaux serveur) + list + getLignes scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "commandes.create", { fournisseurId: fournA, lignes: [ligne] }, tA);
    expect(created.statusCode).toBe(200);
    const cmd = created.json().result.data as { id: number; totalHT: string; totalTTC: string };
    expect(cmd.totalHT).toBe("50.00");
    expect(cmd.totalTTC).toBe("60.00");
    expect((await callQuery(server, "commandes.list", undefined, tA)).json().result.data as Array<{ id: number }>).toContainEqual(expect.objectContaining({ id: cmd.id }));
    expect(((await callQuery(server, "commandes.getLignes", { commandeId: cmd.id }, tA)).json().result.data as unknown[]).length).toBe(1);
  });

  it("validation Zod : sans ligne → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "commandes.create", { fournisseurId: fournA, lignes: [] }, tA)).statusCode).toBe(400);
  });

  it("anti-IDOR-FK : create avec le fournisseur d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "commandes.create", { fournisseurId: fournB, lignes: [ligne] }, tA)).statusCode).toBe(404);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la commande de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "commandes.create", { fournisseurId: fournA, lignes: [ligne] }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "commandes.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "commandes.getLignes", { commandeId: id }, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "commandes.update", { id, notes: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "commandes.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "commandes.getById", { id }, tA)).statusCode).toBe(200);
  });

  it("update (métadonnées) + delete OK pour le propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "commandes.create", { fournisseurId: fournA, lignes: [ligne] }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "commandes.update", { id, notes: "ok" }, tA)).json().result.data.notes).toBe("ok");
    expect((await callMutation(server, "commandes.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "commandes.getById", { id }, tA)).statusCode).toBe(404);
  });
});
