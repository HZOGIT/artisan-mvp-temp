import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { NotificationRepositoryDrizzle } from "../../infra/notification-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9936001;
const UB = 9936002;

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

describe.skipIf(!URL)("notifications.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  const seed = async (artisanId: number, titre: string, opts?: { lu?: boolean; archived?: boolean }) =>
    (await admin.query(
      'insert into notifications ("artisanId", titre, lu, archived, "createdAt") values ($1,$2,$3,$4,now()) returning id',
      [artisanId, titre, opts?.lu ?? false, opts?.archived ?? false],
    )).rows[0].id as number;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from notifications where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), notificationRepo: new NotificationRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from notifications where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → notifications.list 401", async () => {
    expect((await callQuery(server, "notifications.list", undefined)).statusCode).toBe(401);
  });

  it("list + getUnreadCount scopés au tenant A", async () => {
    await admin.query('delete from notifications where "artisanId" in ($1,$2)', [artisanA, artisanB]);
    await seed(artisanA, "N1");
    await seed(artisanA, "N2", { lu: true });
    await seed(artisanB, "B1");
    const tA = await token(UA);
    const list = await callQuery(server, "notifications.list", undefined, tA);
    expect(list.statusCode).toBe(200);
    expect((list.json().result.data as Array<{ titre: string }>).map((n) => n.titre).sort()).toEqual(["N1", "N2"]);
    const count = await callQuery(server, "notifications.getUnreadCount", undefined, tA);
    expect(count.json().result.data).toBe(1); // N1
  });

  it("markAsRead + markAllAsRead + archive pour le propriétaire", async () => {
    await admin.query('delete from notifications where "artisanId"=$1', [artisanA]);
    const id1 = await seed(artisanA, "M1");
    await seed(artisanA, "M2");
    const tA = await token(UA);
    expect((await callMutation(server, "notifications.markAsRead", { id: id1 }, tA)).json().result.data).toEqual({ success: true });
    const all = await callMutation(server, "notifications.markAllAsRead", {}, tA);
    expect(all.json().result.data.success).toBe(true);
    expect(await (await callQuery(server, "notifications.getUnreadCount", undefined, tA)).json().result.data).toBe(0);
    expect((await callMutation(server, "notifications.archive", { id: id1 }, tA)).json().result.data).toEqual({ success: true });
  });

  it("isolation cross-tenant : B ne marque/archive pas la notif de A → 404", async () => {
    const idA = await seed(artisanA, "Secret");
    const tB = await token(UB);
    expect((await callMutation(server, "notifications.markAsRead", { id: idA }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "notifications.archive", { id: idA }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "notifications.delete", { id: idA }, tB)).statusCode).toBe(404);
    // B ne voit pas la notif de A
    expect((await callQuery(server, "notifications.list", undefined, tB)).json().result.data as unknown[]).not.toContainEqual(expect.objectContaining({ id: idA }));
  });

  it("pagination : limit borné", async () => {
    await admin.query('delete from notifications where "artisanId"=$1', [artisanA]);
    for (let i = 0; i < 4; i++) await seed(artisanA, `P${i}`);
    const tA = await token(UA);
    expect(((await callQuery(server, "notifications.list", { limit: 2, page: 1 }, tA)).json().result.data as unknown[]).length).toBe(2);
    // limit > 100 rejeté par zod → 400
    expect((await callQuery(server, "notifications.list", { limit: 9999 }, tA)).statusCode).toBe(400);
  });

  it("markAsRead / archive sur un id inexistant du même tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "notifications.markAsRead", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "notifications.archive", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : page 0 → 400, page > 100000 → 400", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "notifications.list", { page: 0 }, tA)).statusCode).toBe(400);
    expect((await callQuery(server, "notifications.list", { page: 100001 }, tA)).statusCode).toBe(400);
  });

  it("filtres e2e : nonLuesUniquement / includeArchived exacts + ordre createdAt desc", async () => {
    await admin.query('delete from notifications where "artisanId"=$1', [artisanA]);
    const first = await seed(artisanA, "F-vieille");
    await seed(artisanA, "F-lue", { lu: true });
    await seed(artisanA, "F-arch", { archived: true });
    const last = await seed(artisanA, "F-recente");
    const tA = await token(UA);
    // défaut : non archivées (3) ; ordre createdAt desc → la plus récente en tête
    const def = (await callQuery(server, "notifications.list", undefined, tA)).json().result.data as Array<{ id: number; titre: string }>;
    expect(def.length).toBe(3);
    expect(def[0].id).toBe(last);
    expect(def[def.length - 1].id).toBe(first);
    // nonLuesUniquement → exclut F-lue et F-arch
    const nl = (await callQuery(server, "notifications.list", { nonLuesUniquement: true }, tA)).json().result.data as Array<{ titre: string }>;
    expect(nl.map((n) => n.titre).sort()).toEqual(["F-recente", "F-vieille"]);
    // includeArchived → 4
    expect(((await callQuery(server, "notifications.list", { includeArchived: true }, tA)).json().result.data as unknown[]).length).toBe(4);
  });

  it("markAllAsRead ne touche pas l'autre tenant (e2e) + getUnreadCount reflète", async () => {
    await admin.query('delete from notifications where "artisanId" in ($1,$2)', [artisanA, artisanB]);
    await seed(artisanA, "A1");
    await seed(artisanA, "A2");
    await seed(artisanB, "B1");
    const tA = await token(UA);
    const tB = await token(UB);
    expect((await callMutation(server, "notifications.markAllAsRead", {}, tA)).json().result.data.count).toBe(2);
    expect(await (await callQuery(server, "notifications.getUnreadCount", undefined, tA)).json().result.data).toBe(0);
    // B intact
    expect(await (await callQuery(server, "notifications.getUnreadCount", undefined, tB)).json().result.data).toBe(1);
  });
});
