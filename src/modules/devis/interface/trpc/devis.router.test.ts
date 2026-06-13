import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DevisRepositoryDrizzle } from "../../infra/devis-repository-drizzle";

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

describe.skipIf(!URL)("devis.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
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
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "Client B"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), devisRepo: new DevisRepositoryDrizzle(app.db) });
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

  it("IMMUTABILITÉ : un devis accepté → update/addLigne → 409 (Conflict)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "devis.create", { clientId: clientA }, tA)).json().result.data.id as number;
    // Force le statut accepté côté admin (le transport n'expose pas statut).
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
});
