import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { AvisRepositoryDrizzle } from "../../infra/avis-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9932001;
const UB = 9932002;

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

describe.skipIf(!URL)("avis.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;
  let avisA = 0;
  let server: ReturnType<typeof buildApp>;

  const seedAvis = async (artisanId: number, clientId: number, note: number, statut = "en_attente") => {
    const { rows } = await admin.query(
      'insert into avis_clients ("artisanId","clientId",note,statut,"createdAt","updatedAt") values ($1,$2,$3,$4,now(),now()) returning id',
      [artisanId, clientId, note, statut],
    );
    return rows[0].id as number;
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from avis_clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanB, "Client B"])).rows[0].id;
    avisA = await seedAvis(artisanA, clientA, 4);
    await seedAvis(artisanA, clientA, 5, "publie");
    await seedAvis(artisanB, clientB, 2, "publie");
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), avisRepo: new AvisRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from avis_clients where "artisanId"=$1', [aId]);
      await admin.query('delete from clients where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → avis.list 401", async () => {
    const res = await callQuery(server, "avis.list", undefined);
    expect(res.statusCode).toBe(401);
  });

  it("list (enrichi) + getStats scopés au tenant A", async () => {
    const tA = await token(UA);
    const list = await callQuery(server, "avis.list", undefined, tA);
    expect(list.statusCode).toBe(200);
    const data = list.json().result.data as Array<{ id: number; client: { nom: string } | null }>;
    const ids = data.map((a) => a.id);
    expect(ids).toContain(avisA);
    expect(ids.length).toBe(2);
    // enrichissement : le client lié (même tenant) est joint
    const enrichi = data.find((a) => a.id === avisA);
    expect(enrichi?.client?.nom).toBe("Client A");

    const stats = await callQuery(server, "avis.getStats", undefined, tA);
    expect(stats.statusCode).toBe(200);
    expect(stats.json().result.data.total).toBe(1); // 1 seul publié pour A
  });

  it("getById sur un id inexistant du même tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "avis.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("moderer avec statut hors union (en_attente) → 400 (zod, parité publie|masque)", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "avis.moderer", { avisId: avisA, statut: "en_attente" }, tA)).statusCode).toBe(400);
  });

  it("repondre + moderer par le propriétaire", async () => {
    const tA = await token(UA);
    const rep = await callMutation(server, "avis.repondre", { avisId: avisA, reponse: "Merci !" }, tA);
    expect(rep.statusCode).toBe(200);
    expect(rep.json().result.data.reponseArtisan).toBe("Merci !");

    const mod = await callMutation(server, "avis.moderer", { avisId: avisA, statut: "publie" }, tA);
    expect(mod.statusCode).toBe(200);
    expect(mod.json().result.data.statut).toBe("publie");
  });

  it("isolation cross-tenant : B ne voit pas / ne modifie pas l'avis de A", async () => {
    const tB = await token(UB);
    // getById → 404
    expect((await callQuery(server, "avis.getById", { id: avisA }, tB)).statusCode).toBe(404);
    // list ne contient pas l'avis de A
    const listB = await callQuery(server, "avis.list", undefined, tB);
    expect((listB.json().result.data as Array<{ id: number }>).some((a) => a.id === avisA)).toBe(false);
    // repondre / moderer → 404
    expect((await callMutation(server, "avis.repondre", { avisId: avisA, reponse: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "avis.moderer", { avisId: avisA, statut: "masque" }, tB)).statusCode).toBe(404);
  });

  it("validation Zod : repondre avec réponse vide → 400", async () => {
    const tA = await token(UA);
    const res = await callMutation(server, "avis.repondre", { avisId: avisA, reponse: "" }, tA);
    expect(res.statusCode).toBe(400);
  });
});
