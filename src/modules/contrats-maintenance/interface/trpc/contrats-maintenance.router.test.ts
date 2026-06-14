import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ContratRepositoryDrizzle } from "../../infra/contrat-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9945601;
const UB = 9945602;
const DATE = "2026-07-01T00:00:00.000Z";

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

describe.skipIf(!URL)("contrats.router e2e (HTTP → tRPC → use-case → repo → RLS + état machine)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;
  let clientA = 0;
  let clientB = 0;

  const purge = async (uid: number) => {
    await admin.query('delete from contrats_maintenance where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
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
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), contratRepo: new ContratRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  const creer = (tok: string, over: Record<string, unknown> = {}) =>
    mut(server, "contrats.create", { clientId: clientA, titre: "Entretien", montantHT: "300.00", periodicite: "annuel", dateDebut: DATE, ...over }, tok);

  it("sans cookie → contrats.list 401", async () => {
    expect((await q(server, "contrats.list", undefined)).statusCode).toBe(401);
  });

  it("create (clientId du tenant) + getById → statut actif + reference CTR-xxxxx + défauts", async () => {
    const tA = await token(UA);
    const created = await creer(tA);
    expect(created.statusCode).toBe(200);
    const c = created.json().result.data as { id: number; statut: string; reference: string; type: string; tauxTVA: string };
    expect(c.statut).toBe("actif");
    expect(c.reference).toMatch(/^CTR-\d{5}$/);
    expect(c.type).toBe("entretien");
    expect(c.tauxTVA).toBe("20.00");
    expect((await q(server, "contrats.getById", { id: c.id }, tA)).json().result.data.titre).toBe("Entretien");
  });

  it("ANTI-IDOR : create avec un clientId d'un AUTRE tenant → 404", async () => {
    const tA = await token(UA);
    expect((await creer(tA, { clientId: clientB })).statusCode).toBe(404);
  });

  it("validations → 400 : titre vide, montantHT non décimal, dateFin < dateDebut", async () => {
    const tA = await token(UA);
    expect((await creer(tA, { titre: "" })).statusCode).toBe(400);
    expect((await creer(tA, { montantHT: "abc" })).statusCode).toBe(400);
    expect((await creer(tA, { dateFin: "2026-06-01T00:00:00.000Z" })).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime/transitionne pas le contrat de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await creer(tA, { titre: "Secret" })).json().result.data.id as number;
    expect((await q(server, "contrats.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "contrats.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "contrats.update", { id, titre: "hack" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "contrats.suspendre", { id }, tB)).statusCode).toBe(404);
    expect((await mut(server, "contrats.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "contrats.getById", { id }, tA)).json().result.data.titre).toBe("Secret");
  });

  it("update ne change pas le statut ni la reference", async () => {
    const tA = await token(UA);
    const created = (await creer(tA)).json().result.data as { id: number; reference: string };
    const maj = await mut(server, "contrats.update", { id: created.id, titre: "Modifié", montantHT: "350.00" }, tA);
    expect(maj.json().result.data.titre).toBe("Modifié");
    expect(maj.json().result.data.statut).toBe("actif"); // inchangé
    expect(maj.json().result.data.reference).toBe(created.reference); // inchangée
  });

  it("transitions via l'API : suspendre/reactiver/terminer ; terminal → 409", async () => {
    const tA = await token(UA);
    const id = (await creer(tA)).json().result.data.id as number;
    expect((await mut(server, "contrats.suspendre", { id }, tA)).json().result.data.statut).toBe("suspendu");
    expect((await mut(server, "contrats.reactiver", { id }, tA)).json().result.data.statut).toBe("actif");
    expect((await mut(server, "contrats.terminer", { id }, tA)).json().result.data.statut).toBe("termine");
    // depuis terminal (termine) → 409
    expect((await mut(server, "contrats.suspendre", { id }, tA)).statusCode).toBe(409);
  });
});
