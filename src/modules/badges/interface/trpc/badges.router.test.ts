import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { BadgeRepositoryDrizzle } from "../../infra/badge-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9934001;
const UB = 9934002;

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

describe.skipIf(!URL)("badges.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let techA = 0;
  let techB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from badges_techniciens where "technicienId" in (select id from techniciens where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from techniciens where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from badges where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    techA = (await admin.query('insert into techniciens ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Tech A"])).rows[0].id;
    techB = (await admin.query('insert into techniciens ("artisanId", nom) values ($1,$2) returning id', [artisanB, "Tech B"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), badgeRepo: new BadgeRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from badges_techniciens where "technicienId" in (select id from techniciens where "artisanId"=$1)', [aId]);
      await admin.query('delete from techniciens where "artisanId"=$1', [aId]);
      await admin.query('delete from badges where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → badges.list 401", async () => {
    expect((await callQuery(server, "badges.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "badges.create", { code: "PRO", nom: "Pro", points: 50 }, tA);
    expect(created.statusCode).toBe(200);
    const bId = created.json().result.data.id as number;
    const list = await callQuery(server, "badges.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((b) => b.id === bId)).toBe(true);
  });

  it("validation Zod : code vide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "badges.create", { code: "", nom: "X" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne modifie/supprime pas le badge de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const bId = (await callMutation(server, "badges.create", { code: "SEC", nom: "Sec" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "badges.update", { id: bId, data: { nom: "hack" } }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "badges.delete", { id: bId }, tB)).statusCode).toBe(404);
  });

  it("attribuerBadge : OK pour le technicien du tenant, anti-IDOR sur un technicien d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    const bId = (await callMutation(server, "badges.create", { code: "ATT", nom: "Att" }, tA)).json().result.data.id as number;
    // OK sur le technicien de A
    const ok = await callMutation(server, "badges.attribuerBadge", { technicienId: techA, badgeId: bId, valeurAtteinte: 10 }, tA);
    expect(ok.statusCode).toBe(200);
    // A tente d'attribuer sur le technicien de B → 404 (anti-IDOR)
    const ko = await callMutation(server, "badges.attribuerBadge", { technicienId: techB, badgeId: bId }, tA);
    expect(ko.statusCode).toBe(404);
    // lecture scopée : badges du technicien de A
    const lst = await callQuery(server, "badges.getBadgesTechnicien", { technicienId: techA }, tA);
    expect((lst.json().result.data as unknown[]).length).toBe(1);
  });

  it("getBadgesTechnicien sur un technicien d'un autre tenant → [] (lecture sans oracle, pas 404)", async () => {
    const tB = await token(UB);
    const res = await callQuery(server, "badges.getBadgesTechnicien", { technicienId: techA }, tB);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data).toEqual([]);
  });

  it("attribuerBadge avec un badge d'un autre tenant → 404 (anti-IDOR sur la 2e FK)", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const badgeDeA = (await callMutation(server, "badges.create", { code: "OWN", nom: "OwnA" }, tA)).json().result.data.id as number;
    // B attribue le badge de A sur son propre technicien → badge hors tenant → 404
    const res = await callMutation(server, "badges.attribuerBadge", { technicienId: techB, badgeId: badgeDeA }, tB);
    expect(res.statusCode).toBe(404);
  });

  it("update / delete sur un id inexistant du même tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "badges.update", { id: 999999999, data: { nom: "x" } }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "badges.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("validation Zod : nom > 100 caractères → 400", async () => {
    const tA = await token(UA);
    const res = await callMutation(server, "badges.create", { code: "LONG", nom: "x".repeat(101) }, tA);
    expect(res.statusCode).toBe(400);
  });

  it("attribuerBadge idempotent en e2e : double appel → une seule attribution", async () => {
    const tA = await token(UA);
    const bId = (await callMutation(server, "badges.create", { code: "IDEM", nom: "Idem" }, tA)).json().result.data.id as number;
    const a1 = await callMutation(server, "badges.attribuerBadge", { technicienId: techA, badgeId: bId }, tA);
    const a2 = await callMutation(server, "badges.attribuerBadge", { technicienId: techA, badgeId: bId, valeurAtteinte: 99 }, tA);
    expect(a1.json().result.data.id).toBe(a2.json().result.data.id);
    const lst = await callQuery(server, "badges.getBadgesTechnicien", { technicienId: techA }, tA);
    expect((lst.json().result.data as Array<{ badgeId: number }>).filter((x) => x.badgeId === bId).length).toBe(1);
  });
});
