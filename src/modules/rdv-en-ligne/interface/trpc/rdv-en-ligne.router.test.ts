import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { RdvRepositoryDrizzle } from "../../infra/rdv-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9945001;
const UB = 9945002;
const DATE = "2026-07-01T10:00:00.000Z";

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

describe.skipIf(!URL)("rdvEnLigne.router e2e (HTTP → tRPC → use-case → repo → RLS + état machine)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;
  let clientA = 0;
  let clientB = 0;

  const purge = async (uid: number) => {
    await admin.query('delete from rdv_en_ligne where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
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
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanB, "Client B"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), rdvRepo: new RdvRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  const creer = async (tok: string, over: Record<string, unknown> = {}) =>
    mut(server, "rdvEnLigne.create", { clientId: clientA, titre: "Dépannage", dateProposee: DATE, ...over }, tok);

  it("sans cookie → rdvEnLigne.list 401", async () => {
    expect((await q(server, "rdvEnLigne.list", undefined)).statusCode).toBe(401);
  });

  it("create (clientId du tenant) + getById → statut en_attente, défauts", async () => {
    const tA = await token(UA);
    const created = await creer(tA);
    expect(created.statusCode).toBe(200);
    const r = created.json().result.data as { id: number; statut: string; dureeEstimee: number; urgence: string };
    expect(r.statut).toBe("en_attente");
    expect(r.dureeEstimee).toBe(60);
    expect(r.urgence).toBe("normale");
    expect((await q(server, "rdvEnLigne.getById", { id: r.id }, tA)).json().result.data.titre).toBe("Dépannage");
  });

  it("ANTI-IDOR : create avec un clientId d'un AUTRE tenant → 404", async () => {
    const tA = await token(UA);
    expect((await creer(tA, { clientId: clientB })).statusCode).toBe(404);
  });

  it("validations → 400 : titre vide, dureeEstimee 0", async () => {
    const tA = await token(UA);
    expect((await creer(tA, { titre: "" })).statusCode).toBe(400);
    expect((await creer(tA, { dureeEstimee: 0 })).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime/transitionne pas le RDV de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await creer(tA, { titre: "Secret" })).json().result.data.id as number;
    expect((await q(server, "rdvEnLigne.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "rdvEnLigne.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "rdvEnLigne.update", { id, titre: "hack" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "rdvEnLigne.confirmer", { id }, tB)).statusCode).toBe(404);
    expect((await mut(server, "rdvEnLigne.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "rdvEnLigne.getById", { id }, tA)).json().result.data.titre).toBe("Secret");
  });

  it("update ne change pas le statut", async () => {
    const tA = await token(UA);
    const id = (await creer(tA)).json().result.data.id as number;
    const maj = await mut(server, "rdvEnLigne.update", { id, titre: "Modifié", dureeEstimee: 90 }, tA);
    expect(maj.json().result.data.titre).toBe("Modifié");
    expect(maj.json().result.data.statut).toBe("en_attente"); // inchangé
  });

  it("transitions via l'API : confirmer, refuser(motif), annuler, et terminal → 409", async () => {
    const tA = await token(UA);
    // confirmer depuis en_attente
    const id1 = (await creer(tA)).json().result.data.id as number;
    expect((await mut(server, "rdvEnLigne.confirmer", { id: id1 }, tA)).json().result.data.statut).toBe("confirme");
    // annuler depuis confirme
    expect((await mut(server, "rdvEnLigne.annuler", { id: id1 }, tA)).json().result.data.statut).toBe("annule");
    // refuser sans motif → 400 (zod min(1))
    const id2 = (await creer(tA)).json().result.data.id as number;
    expect((await mut(server, "rdvEnLigne.refuser", { id: id2 }, tA)).statusCode).toBe(400);
    // refuser avec motif → refuse + motif
    const refuse = await mut(server, "rdvEnLigne.refuser", { id: id2, motifRefus: "Indisponible" }, tA);
    expect(refuse.json().result.data.statut).toBe("refuse");
    expect(refuse.json().result.data.motifRefus).toBe("Indisponible");
    // confirmer depuis un statut terminal (refuse) → 409
    expect((await mut(server, "rdvEnLigne.confirmer", { id: id2 }, tA)).statusCode).toBe(409);
  });
});
